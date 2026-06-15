import { type AvatarAppearance, sanitizeAppearance } from "@tilezo/protocol";
import { and, asc, eq, gt, or } from "drizzle-orm";
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

export type BlockListOptions = {
  limit: number;
  afterUsername?: string;
};

export type BlockStore = {
  blockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerUserId: string, blockedUserId: string): Promise<void>;
  isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean>;
  isBlockedEitherDirection(userId: string, otherUserId: string): Promise<boolean>;
  countBlockedUsers(blockerUserId: string): Promise<number>;
  listBlockedUsers(
    blockerUserId: string,
    options?: BlockListOptions,
  ): Promise<BlockedUserSummary[]>;
};

export class BlockError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const DEFAULT_BLOCK_LIST_LIMIT = 50;
export const MAX_BLOCK_LIST_LIMIT = 100;
export const DEFAULT_MAX_BLOCKED_USERS = 500;

export class BlockService {
  constructor(
    private readonly store: BlockStore,
    private readonly options: { maxBlockedUsers?: number } = {},
  ) {}

  async block(userId: string, blockedUserId: string): Promise<void> {
    if (userId === blockedUserId) {
      throw new BlockError("INVALID_BLOCK", "You cannot block yourself");
    }

    if (!(await this.store.isBlocked(userId, blockedUserId))) {
      const count = await this.store.countBlockedUsers(userId);
      const maxBlockedUsers = this.options.maxBlockedUsers ?? DEFAULT_MAX_BLOCKED_USERS;
      if (count >= maxBlockedUsers) {
        throw new BlockError("BLOCK_LIMIT_REACHED", "You have reached the blocked user limit");
      }
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

  list(userId: string, options: Partial<BlockListOptions> = {}): Promise<BlockedUserSummary[]> {
    return this.store.listBlockedUsers(userId, {
      limit: clampLimit(options.limit),
      afterUsername: normalizeCursor(options.afterUsername),
    });
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

  async countBlockedUsers(blockerUserId: string): Promise<number> {
    const rows = await this.db
      .select({ blockedUserId: blockedUsers.blockedUserId })
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerUserId, blockerUserId));
    return rows.length;
  }

  async listBlockedUsers(
    blockerUserId: string,
    options: BlockListOptions = { limit: DEFAULT_BLOCK_LIST_LIMIT },
  ): Promise<BlockedUserSummary[]> {
    const afterUsername = normalizeCursor(options.afterUsername);
    const conditions = [eq(blockedUsers.blockerUserId, blockerUserId)];
    if (afterUsername) {
      conditions.push(gt(users.usernameKey, afterUsername));
    }

    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        appearance: users.appearance,
        blockedAt: blockedUsers.createdAt,
      })
      .from(blockedUsers)
      .innerJoin(users, eq(users.id, blockedUsers.blockedUserId))
      .where(and(...conditions))
      .orderBy(asc(users.usernameKey))
      .limit(clampLimit(options.limit));

    return rows.map(toSummary);
  }
}

function toSummary(row: BlockedUserRow): BlockedUserSummary {
  return {
    id: row.id,
    username: row.username,
    // Normalize on read so a legacy/hand-edited appearance row cannot break the blocked-list
    // avatar previews (which share the strict client schema and renderer).
    appearance: sanitizeAppearance(row.appearance),
    blockedAt: row.blockedAt.toISOString(),
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit) || limit < 1) {
    return DEFAULT_BLOCK_LIST_LIMIT;
  }
  return Math.min(limit, MAX_BLOCK_LIST_LIMIT);
}

function normalizeCursor(cursor: string | undefined): string | undefined {
  const trimmed = cursor?.trim().toLowerCase();
  return trimmed || undefined;
}
