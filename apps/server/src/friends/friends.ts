import type { AvatarAppearance } from "@tilezo/protocol";
import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { normalizeUsername } from "../auth/auth";
import type { TilezoDatabase } from "../db/db";
import { friendships, users } from "../db/schema";
import type { UserPresence } from "../presence/presence";

const DEFAULT_MAX_FRIENDS = 500;
// Defensive upper bound on the friends read path so a single response can never load an
// unbounded number of rows even if the per-user cap is ever raised or bypassed.
const FRIEND_LIST_QUERY_LIMIT = 1000;

export type FriendUser = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
};

export type FriendSummary = FriendUser &
  UserPresence & {
    canJoinRoom: boolean;
  };

export type FriendStore = {
  addFriend(userId: string, friendUserId: string): Promise<void>;
  countFriends(userId: string): Promise<number>;
  findUserByUsername(username: string): Promise<FriendUser | undefined>;
  listFriends(userId: string): Promise<FriendUser[]>;
  removeFriend(userId: string, friendUserId: string): Promise<void>;
};

type PresenceLookup = (userId: string) => UserPresence;

export class FriendService {
  private readonly maxFriends: number;

  constructor(
    private readonly store: FriendStore,
    private readonly presence: PresenceLookup,
    options: { maxFriends?: number } = {},
  ) {
    this.maxFriends = options.maxFriends ?? DEFAULT_MAX_FRIENDS;
  }

  async list(userId: string): Promise<FriendSummary[]> {
    const friends = await this.store.listFriends(userId);
    return friends.map((friend) => this.summarize(friend));
  }

  async add(userId: string, username: string): Promise<FriendSummary> {
    const friend = await this.store.findUserByUsername(username);

    if (!friend) {
      throw new FriendError("USER_NOT_FOUND", "No player found with that username");
    }

    if (friend.id === userId) {
      throw new FriendError("INVALID_FRIEND", "You cannot add yourself");
    }

    const friendCount = await this.store.countFriends(userId);

    if (friendCount >= this.maxFriends) {
      throw new FriendError(
        "FRIEND_LIMIT_REACHED",
        `You can have at most ${this.maxFriends.toString()} friends`,
      );
    }

    await this.store.addFriend(userId, friend.id);
    return this.summarize(friend);
  }

  async remove(userId: string, friendUserId: string): Promise<void> {
    await this.store.removeFriend(userId, friendUserId);
  }

  private summarize(friend: FriendUser): FriendSummary {
    const presence = this.presence(friend.id);
    return {
      ...friend,
      ...presence,
      canJoinRoom: Boolean(presence.roomId),
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
    return user;
  }

  async addFriend(userId: string, friendUserId: string): Promise<void> {
    const [leftUserId, rightUserId] = friendshipPair(userId, friendUserId);

    await this.db
      .insert(friendships)
      .values({
        userId: leftUserId,
        friendUserId: rightUserId,
      })
      .onConflictDoNothing();
  }

  async countFriends(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(friendships)
      .where(or(eq(friendships.userId, userId), eq(friendships.friendUserId, userId)));
    return row?.value ?? 0;
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
      .where(or(eq(friendships.userId, userId), eq(friendships.friendUserId, userId)))
      .limit(FRIEND_LIST_QUERY_LIMIT);
    const friendIds = rows.map((row) => (row.userId === userId ? row.friendUserId : row.userId));

    if (friendIds.length === 0) {
      return [];
    }

    return await this.db
      .select({
        id: users.id,
        username: users.username,
        appearance: users.appearance,
      })
      .from(users)
      .where(inArray(users.id, friendIds))
      .orderBy(asc(users.usernameKey))
      .limit(FRIEND_LIST_QUERY_LIMIT);
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
