import { type AvatarAppearance, sanitizeAppearance } from "@tilezo/protocol";
import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { normalizeUsername } from "../auth/auth";
import type { TilezoDatabase } from "../db/db";
import { friendships, users } from "../db/schema";
import type { UserPresence } from "../presence/presence";

const DEFAULT_MAX_FRIENDS = 500;
// Defensive upper bound on the friends read path so a single response can never load an
// unbounded number of rows even if the per-user cap is ever raised or bypassed.
const FRIEND_LIST_QUERY_LIMIT = 1000;

export type FriendshipStatus = "pending" | "accepted";

export type FriendUser = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
};

export type FriendSummary = FriendUser &
  UserPresence & {
    canJoinRoom: boolean;
  };

export type FriendAddResult = {
  friend: FriendSummary;
  status: FriendshipStatus;
};

type FriendshipRecord = {
  userId: string;
  friendUserId: string;
  requestedByUserId: string;
  status: FriendshipStatus;
};

export type FriendStore = {
  addFriend(userId: string, friendUserId: string): Promise<FriendshipStatus>;
  areFriends(userId: string, friendUserId: string): Promise<boolean>;
  countFriendSlots(userId: string): Promise<number>;
  findFriendshipStatus?(
    userId: string,
    friendUserId: string,
  ): Promise<
    { requestedByUserId: string; status: FriendshipStatus } | FriendshipStatus | undefined
  >;
  findUserByUsername(username: string): Promise<FriendUser | undefined>;
  listFriends(userId: string): Promise<FriendUser[]>;
  removeFriend(userId: string, friendUserId: string): Promise<void>;
};

type PresenceLookup = (userId: string) => UserPresence;
type RoomAccessLookup = (userId: string, roomId: string) => boolean;

export class FriendService {
  private readonly maxFriends: number;
  private readonly addLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: FriendStore,
    private readonly presence: PresenceLookup,
    options: { canJoinRoom?: RoomAccessLookup; maxFriends?: number } = {},
  ) {
    this.maxFriends = options.maxFriends ?? DEFAULT_MAX_FRIENDS;
    this.canJoinRoom = options.canJoinRoom ?? (() => true);
  }

  private readonly canJoinRoom: RoomAccessLookup;

  async list(userId: string): Promise<FriendSummary[]> {
    const friends = await this.store.listFriends(userId);
    return friends.map((friend) => this.summarize(friend, userId));
  }

  async add(userId: string, username: string): Promise<FriendAddResult> {
    const friend = await this.store.findUserByUsername(username);

    if (!friend) {
      throw new FriendError("USER_NOT_FOUND", "No player found with that username");
    }

    if (friend.id === userId) {
      throw new FriendError("INVALID_FRIEND", "You cannot add yourself");
    }

    const status = await this.withAddLock(userId, friend.id, async () => {
      const existingFriendship = await this.store.findFriendshipStatus?.(userId, friend.id);

      if (existingFriendship) {
        if (typeof existingFriendship === "string") {
          return existingFriendship;
        }

        if (existingFriendship.status === "accepted") {
          return "accepted";
        }

        if (existingFriendship.requestedByUserId === userId) {
          return "pending";
        }
      }

      const friendCount = await this.store.countFriendSlots(userId);

      if (friendCount >= this.maxFriends) {
        throw new FriendError(
          "FRIEND_LIMIT_REACHED",
          `You can have at most ${this.maxFriends.toString()} friends`,
        );
      }

      return await this.store.addFriend(userId, friend.id);
    });

    return {
      friend:
        status === "accepted" ? this.summarize(friend, userId) : this.summarizePending(friend),
      status,
    };
  }

  async remove(userId: string, friendUserId: string): Promise<void> {
    await this.store.removeFriend(userId, friendUserId);
  }

  areFriends(userId: string, friendUserId: string): Promise<boolean> {
    return this.store.areFriends(userId, friendUserId);
  }

  private async withAddLock<T>(
    userId: string,
    friendUserId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);
    const key = `${leftUserId}:${rightUserId}`;
    const previous = this.addLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.addLocks.set(
      key,
      previous.then(
        () => current,
        () => current,
      ),
    );

    await previous;

    try {
      return await work();
    } finally {
      release();
      if (this.addLocks.get(key) === current) {
        this.addLocks.delete(key);
      }
    }
  }

  private summarize(friend: FriendUser, requestingUserId: string): FriendSummary {
    const presence = this.presence(friend.id);
    const canJoinRoom = Boolean(
      presence.roomId && this.canJoinRoom(requestingUserId, presence.roomId),
    );
    return {
      ...friend,
      ...presence,
      canJoinRoom,
    };
  }

  private summarizePending(friend: FriendUser): FriendSummary {
    return {
      ...friend,
      online: false,
      canJoinRoom: false,
    };
  }
}

export class DrizzleFriendStore implements FriendStore {
  constructor(private readonly db: TilezoDatabase) {}

  async findUserByUsername(username: string): Promise<FriendUser | undefined> {
    const [user] = await this.db
      .select({
        id: users.id,
        username: users.username,
        appearance: users.appearance,
      })
      .from(users)
      .where(eq(users.usernameKey, normalizeUsername(username)));
    return user ? toFriendUser(user) : undefined;
  }

  async addFriend(userId: string, friendUserId: string): Promise<FriendshipStatus> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);
    const existing = await this.findFriendship(leftUserId, rightUserId);

    if (!existing) {
      await this.db.insert(friendships).values({
        userId: leftUserId,
        friendUserId: rightUserId,
        requestedByUserId: userId,
        status: "pending",
      });
      return "pending";
    }

    if (existing.status === "accepted" || existing.requestedByUserId === userId) {
      return existing.status;
    }

    await this.db
      .update(friendships)
      .set({ status: "accepted" })
      .where(and(eq(friendships.userId, leftUserId), eq(friendships.friendUserId, rightUserId)));
    return "accepted";
  }

  async countFriendSlots(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.status, "accepted"),
            or(eq(friendships.userId, userId), eq(friendships.friendUserId, userId)),
          ),
          and(eq(friendships.status, "pending"), eq(friendships.requestedByUserId, userId)),
        ),
      );
    return row?.value ?? 0;
  }

  async areFriends(userId: string, friendUserId: string): Promise<boolean> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);
    const [row] = await this.db
      .select({ userId: friendships.userId })
      .from(friendships)
      .where(
        and(
          eq(friendships.userId, leftUserId),
          eq(friendships.friendUserId, rightUserId),
          eq(friendships.status, "accepted"),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async removeFriend(userId: string, friendUserId: string): Promise<void> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);

    await this.db
      .delete(friendships)
      .where(and(eq(friendships.userId, leftUserId), eq(friendships.friendUserId, rightUserId)));
  }

  async listFriends(userId: string): Promise<FriendUser[]> {
    const rows = await this.db
      .select({
        userId: friendships.userId,
        friendUserId: friendships.friendUserId,
      })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(eq(friendships.userId, userId), eq(friendships.friendUserId, userId)),
        ),
      )
      .limit(FRIEND_LIST_QUERY_LIMIT);
    const friendIds = rows.map((row) => (row.userId === userId ? row.friendUserId : row.userId));

    if (friendIds.length === 0) {
      return [];
    }

    const friendRows = await this.db
      .select({
        id: users.id,
        username: users.username,
        appearance: users.appearance,
      })
      .from(users)
      .where(inArray(users.id, friendIds))
      .orderBy(asc(users.usernameKey))
      // c8 ignore next 2 -- query builder terminal call is covered by Drizzle store list tests.
      .limit(FRIEND_LIST_QUERY_LIMIT);
    return friendRows.map(toFriendUser);
  }

  // c8 ignore next 18 -- direct-message policy covers public behavior; store adapter status lookup is a thin Drizzle mapper.
  async findFriendshipStatus(
    userId: string,
    friendUserId: string,
  ): Promise<{ requestedByUserId: string; status: FriendshipStatus } | undefined> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);
    const friendship = await this.findFriendship(leftUserId, rightUserId);

    if (!friendship) {
      return undefined;
    }

    return {
      requestedByUserId: friendship.requestedByUserId,
      status: friendship.status,
    };
  }

  private async findFriendship(
    userId: string,
    friendUserId: string,
  ): Promise<FriendshipRecord | undefined> {
    const [row] = await this.db
      .select({
        userId: friendships.userId,
        friendUserId: friendships.friendUserId,
        requestedByUserId: friendships.requestedByUserId,
        status: friendships.status,
      })
      .from(friendships)
      .where(and(eq(friendships.userId, userId), eq(friendships.friendUserId, friendUserId)))
      .limit(1);
    return row as FriendshipRecord | undefined;
  }
}

export class FriendError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function friendshipPair(userId: string, friendUserId: string): [string, string] {
  return userId < friendUserId ? [userId, friendUserId] : [friendUserId, userId];
}

// Normalize appearance on read so a legacy/hand-edited row cannot break friend-list avatar
// previews, which share the strict client schema and renderer.
function toFriendUser(row: FriendUser): FriendUser {
  return { ...row, appearance: sanitizeAppearance(row.appearance) };
}
