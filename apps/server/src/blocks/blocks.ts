import type { AvatarAppearance } from "@tilezo/protocol";
import { and, asc, eq, or } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { blockedUsers, users } from "../db/schema";

export type BlockedUserSummary = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
  blockedAt: string;
};

type BlockedUserRow = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
  blockedAt: Date;
};

export type BlockStore = {
  blockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean>;
  isBlockedEitherDirection(userId: string, otherUserId: string): Promise<boolean>;
  listBlockedUsers(blockerUserId: string): Promise<BlockedUserSummary[]>;
};

export class BlockError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class BlockService {
  constructor(private readonly store: BlockStore) {}

  async block(userId: string, blockedUserId: string): Promise<void> {
    if (userId === blockedUserId) {
      throw new BlockError("INVALID_BLOCK", "You cannot block yourself");
    }

    await this.store.blockUser(userId, blockedUserId);
  }

  unblock(userId: string, blockedUserId: string): Promise<void> {
    return this.store.unblockUser(userId, blockedUserId);
  }

  isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean> {
    return this.store.isBlocked(blockerUserId, blockedUserId);
  }

  isBlockedEitherDirection(userId: string, otherUserId: string): Promise<boolean> {
    return this.store.isBlockedEitherDirection(userId, otherUserId);
  }

  list(userId: string): Promise<BlockedUserSummary[]> {
    return this.store.listBlockedUsers(userId);
  }
}

export class DrizzleBlockStore implements BlockStore {
  constructor(private readonly db: TilezoDatabase) {}

  async blockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.db
      .insert(blockedUsers)
      .values({ blockerUserId, blockedUserId })
      .onConflictDoNothing();
  }

  async unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerUserId, blockerUserId),
          eq(blockedUsers.blockedUserId, blockedUserId),
        ),
      );
  }

  async isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ blockerUserId: blockedUsers.blockerUserId })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerUserId, blockerUserId),
          eq(blockedUsers.blockedUserId, blockedUserId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async isBlockedEitherDirection(userId: string, otherUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ blockerUserId: blockedUsers.blockerUserId })
      .from(blockedUsers)
      .where(
        or(
          and(eq(blockedUsers.blockerUserId, userId), eq(blockedUsers.blockedUserId, otherUserId)),
          and(eq(blockedUsers.blockerUserId, otherUserId), eq(blockedUsers.blockedUserId, userId)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async listBlockedUsers(blockerUserId: string): Promise<BlockedUserSummary[]> {
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        appearance: users.appearance,
        blockedAt: blockedUsers.createdAt,
      })
      .from(blockedUsers)
      .innerJoin(users, eq(users.id, blockedUsers.blockedUserId))
      .where(eq(blockedUsers.blockerUserId, blockerUserId))
      .orderBy(asc(users.usernameKey));

    return rows.map(toSummary);
  }
}

function toSummary(row: BlockedUserRow): BlockedUserSummary {
  return {
    id: row.id,
    username: row.username,
    appearance: row.appearance,
    blockedAt: row.blockedAt.toISOString(),
  };
}
