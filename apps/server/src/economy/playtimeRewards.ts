import { eq, sql } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { userPlaytimeRewards, users } from "../db/schema";

export const PLAYTIME_REWARD_DOLLARS = 500;
export const PLAYTIME_REWARD_INTERVAL_MS = 60 * 60 * 1000;
export const PLAYTIME_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
export const PLAYTIME_REWARD_FLUSH_INTERVAL_MS = 60 * 1000;

export type PlaytimeRewardMutation = "activity" | "flush";

export type PlaytimeRewardState = {
  accruedActiveMs: number;
  lastActivityAt?: Date;
  lastAccruedAt?: Date;
};

export type PlaytimeRewardApplyResult = {
  accruedActiveMs: number;
  awardedDollars: number;
  awardedIntervals: number;
  balance?: number;
  lastActivityAt?: Date;
  lastAccruedAt?: Date;
};

export type PlaytimeRewardStore = {
  apply(
    userId: string,
    mutation: PlaytimeRewardMutation,
    now: Date,
  ): Promise<PlaytimeRewardApplyResult | undefined>;
};

type PlaytimeRewardServiceOptions = {
  now?: () => Date;
  publishBalanceUpdate?: (userId: string, dollars: number) => void;
};

export class PlaytimeRewardService {
  private readonly activeSocketsByUser = new Map<string, number>();
  private readonly pendingByUser = new Map<string, Promise<unknown>>();
  private readonly now: () => Date;

  constructor(
    private readonly store: PlaytimeRewardStore,
    private readonly options: PlaytimeRewardServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  socketOpened(userId: string): void {
    this.activeSocketsByUser.set(userId, (this.activeSocketsByUser.get(userId) ?? 0) + 1);
  }

  async socketClosed(userId: string, now = this.now()): Promise<PlaytimeRewardApplyResult> {
    const remaining = Math.max(0, (this.activeSocketsByUser.get(userId) ?? 1) - 1);

    if (remaining > 0) {
      this.activeSocketsByUser.set(userId, remaining);
      return emptyResult();
    }

    this.activeSocketsByUser.delete(userId);
    return await this.flushUser(userId, now);
  }

  async recordActivity(userId: string, now = this.now()): Promise<PlaytimeRewardApplyResult> {
    return await this.apply(userId, "activity", now);
  }

  async flushConnectedUsers(now = this.now()): Promise<PlaytimeRewardApplyResult[]> {
    const userIds = [...this.activeSocketsByUser.keys()];
    return await Promise.all(userIds.map((userId) => this.flushUser(userId, now)));
  }

  async flushUser(userId: string, now = this.now()): Promise<PlaytimeRewardApplyResult> {
    return await this.apply(userId, "flush", now);
  }

  private async apply(
    userId: string,
    mutation: PlaytimeRewardMutation,
    now: Date,
  ): Promise<PlaytimeRewardApplyResult> {
    return await this.enqueue(userId, async () => {
      const result = (await this.store.apply(userId, mutation, now)) ?? emptyResult();

      if (result.balance !== undefined && result.awardedDollars > 0) {
        this.options.publishBalanceUpdate?.(userId, result.balance);
      }

      return result;
    });
  }

  private async enqueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pendingByUser.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.finally(() => {
      if (this.pendingByUser.get(userId) === tracked) {
        this.pendingByUser.delete(userId);
      }
    });
    this.pendingByUser.set(userId, tracked);
    return await next;
  }
}

export class DrizzlePlaytimeRewardStore implements PlaytimeRewardStore {
  constructor(private readonly db: TilezoDatabase) {}

  async apply(
    userId: string,
    mutation: PlaytimeRewardMutation,
    now: Date,
  ): Promise<PlaytimeRewardApplyResult | undefined> {
    return await this.db.transaction(async (tx) => {
      if (mutation === "activity") {
        await tx.insert(userPlaytimeRewards).values({ userId }).onConflictDoNothing();
      }

      const [stored] = await tx
        .select({
          accruedActiveMs: userPlaytimeRewards.accruedActiveMs,
          lastActivityAt: userPlaytimeRewards.lastActivityAt,
          lastAccruedAt: userPlaytimeRewards.lastAccruedAt,
        })
        .from(userPlaytimeRewards)
        .where(eq(userPlaytimeRewards.userId, userId))
        .for("update");

      if (!stored) {
        return undefined;
      }

      const result = applyPlaytimeAccrual(
        {
          accruedActiveMs: stored.accruedActiveMs,
          lastActivityAt: stored.lastActivityAt ?? undefined,
          lastAccruedAt: stored.lastAccruedAt ?? undefined,
        },
        mutation,
        now,
      );
      let balance: number | undefined;

      if (result.awardedDollars > 0) {
        const [updatedUser] = await tx
          .update(users)
          .set({ dollars: sql`${users.dollars} + ${result.awardedDollars}` })
          .where(eq(users.id, userId))
          .returning({ dollars: users.dollars });
        balance = updatedUser?.dollars;
      }

      await tx
        .update(userPlaytimeRewards)
        .set({
          accruedActiveMs: result.accruedActiveMs,
          lastActivityAt: result.lastActivityAt ?? null,
          lastAccruedAt: result.lastAccruedAt ?? null,
          updatedAt: now,
        })
        .where(eq(userPlaytimeRewards.userId, userId));

      return { ...result, balance };
    });
  }
}

export function applyPlaytimeAccrual(
  state: PlaytimeRewardState,
  mutation: PlaytimeRewardMutation,
  now: Date,
): PlaytimeRewardApplyResult {
  const nowMs = now.getTime();
  let accruedActiveMs = Math.max(0, state.accruedActiveMs);
  let lastActivityAt = state.lastActivityAt;
  let lastAccruedAt = state.lastAccruedAt;

  if (lastActivityAt && lastAccruedAt) {
    const eligibleUntilMs = Math.min(nowMs, lastActivityAt.getTime() + PLAYTIME_ACTIVE_WINDOW_MS);
    accruedActiveMs += Math.max(0, eligibleUntilMs - lastAccruedAt.getTime());

    if (mutation === "activity") {
      lastActivityAt = now;
      lastAccruedAt = now;
    } else {
      lastAccruedAt = new Date(eligibleUntilMs);
    }
  } else if (mutation === "activity") {
    lastActivityAt = now;
    lastAccruedAt = now;
  }

  const awardedIntervals = Math.floor(accruedActiveMs / PLAYTIME_REWARD_INTERVAL_MS);
  accruedActiveMs %= PLAYTIME_REWARD_INTERVAL_MS;

  return {
    accruedActiveMs,
    awardedDollars: awardedIntervals * PLAYTIME_REWARD_DOLLARS,
    awardedIntervals,
    lastActivityAt,
    lastAccruedAt,
  };
}

function emptyResult(): PlaytimeRewardApplyResult {
  return {
    accruedActiveMs: 0,
    awardedDollars: 0,
    awardedIntervals: 0,
  };
}
