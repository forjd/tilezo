import { describe, expect, test } from "bun:test";
import {
  applyPlaytimeAccrual,
  DrizzlePlaytimeRewardStore,
  PLAYTIME_ACTIVE_WINDOW_MS,
  PLAYTIME_REWARD_INTERVAL_MS,
  type PlaytimeRewardApplyResult,
  type PlaytimeRewardMutation,
  PlaytimeRewardService,
  type PlaytimeRewardState,
  type PlaytimeRewardStore,
} from "./playtimeRewards";

const BASE_TIME = Date.parse("2026-06-15T00:00:00.000Z");

describe("applyPlaytimeAccrual", () => {
  test("starts tracking on the first input without awarding immediately", () => {
    const result = applyPlaytimeAccrual({ accruedActiveMs: 0 }, "activity", at(0));

    expect(result).toMatchObject({
      accruedActiveMs: 0,
      awardedDollars: 0,
      awardedIntervals: 0,
    });
    expect(result.lastActivityAt?.getTime()).toBe(BASE_TIME);
    expect(result.lastAccruedAt?.getTime()).toBe(BASE_TIME);
  });

  test("accrues elapsed time between inputs inside the active window", () => {
    const result = applyPlaytimeAccrual(
      {
        accruedActiveMs: 0,
        lastActivityAt: at(0),
        lastAccruedAt: at(0),
      },
      "activity",
      at(4 * 60 * 1000),
    );

    expect(result.accruedActiveMs).toBe(4 * 60 * 1000);
    expect(result.awardedDollars).toBe(0);
    expect(result.lastActivityAt?.getTime()).toBe(at(4 * 60 * 1000).getTime());
    expect(result.lastAccruedAt?.getTime()).toBe(at(4 * 60 * 1000).getTime());
  });

  test("caps an idle gap at the five minute active window", () => {
    const result = applyPlaytimeAccrual(
      {
        accruedActiveMs: 0,
        lastActivityAt: at(0),
        lastAccruedAt: at(0),
      },
      "activity",
      at(10 * 60 * 1000),
    );

    expect(result.accruedActiveMs).toBe(PLAYTIME_ACTIVE_WINDOW_MS);
    expect(result.awardedDollars).toBe(0);
    expect(result.lastActivityAt?.getTime()).toBe(at(10 * 60 * 1000).getTime());
    expect(result.lastAccruedAt?.getTime()).toBe(at(10 * 60 * 1000).getTime());
  });

  test("awards multiple full hours and carries the remainder", () => {
    const result = applyPlaytimeAccrual(
      {
        accruedActiveMs: 7_000_000,
        lastActivityAt: at(0),
        lastAccruedAt: at(0),
      },
      "activity",
      at(PLAYTIME_ACTIVE_WINDOW_MS),
    );

    expect(result.awardedIntervals).toBe(2);
    expect(result.awardedDollars).toBe(1000);
    expect(result.accruedActiveMs).toBe(7_000_000 + PLAYTIME_ACTIVE_WINDOW_MS - 2 * 3_600_000);
  });

  test("flushes only uncounted active time without extending activity", () => {
    const result = applyPlaytimeAccrual(
      {
        accruedActiveMs: 0,
        lastActivityAt: at(0),
        lastAccruedAt: at(0),
      },
      "flush",
      at(10 * 60 * 1000),
    );

    expect(result.accruedActiveMs).toBe(PLAYTIME_ACTIVE_WINDOW_MS);
    expect(result.lastActivityAt?.getTime()).toBe(BASE_TIME);
    expect(result.lastAccruedAt?.getTime()).toBe(at(PLAYTIME_ACTIVE_WINDOW_MS).getTime());
  });
});

describe("PlaytimeRewardService", () => {
  test("flushes connected users once even when a user has multiple sockets", async () => {
    const store = new MemoryPlaytimeRewardStore();
    const service = new PlaytimeRewardService(store);

    service.socketOpened("user_1");
    service.socketOpened("user_1");

    await service.flushConnectedUsers(at(60_000));

    expect(store.calls).toEqual([{ userId: "user_1", mutation: "flush", now: at(60_000) }]);
  });

  test("flushes accrued active time when the last socket closes", async () => {
    const store = new MemoryPlaytimeRewardStore();
    const service = new PlaytimeRewardService(store);

    service.socketOpened("user_1");
    await service.recordActivity("user_1", at(0));
    await service.socketClosed("user_1", at(4 * 60 * 1000));

    expect(store.states.get("user_1")?.accruedActiveMs).toBe(4 * 60 * 1000);
  });

  test("does not flush when another socket remains open", async () => {
    const store = new MemoryPlaytimeRewardStore();
    const service = new PlaytimeRewardService(store);

    service.socketOpened("user_1");
    service.socketOpened("user_1");
    await service.recordActivity("user_1", at(0));
    store.calls.length = 0;

    await service.socketClosed("user_1", at(4 * 60 * 1000));

    expect(store.calls).toEqual([]);
  });

  test("publishes a balance update when activity earns an hourly reward", async () => {
    const store = new MemoryPlaytimeRewardStore();
    const published: Array<{ userId: string; dollars: number }> = [];
    const service = new PlaytimeRewardService(store, {
      publishBalanceUpdate(userId, dollars) {
        published.push({ userId, dollars });
      },
    });
    store.balances.set("user_1", 500);
    store.states.set("user_1", {
      accruedActiveMs: PLAYTIME_REWARD_INTERVAL_MS - 100_000,
      lastActivityAt: at(0),
      lastAccruedAt: at(0),
    });

    await service.recordActivity("user_1", at(100_000));

    expect(published).toEqual([{ userId: "user_1", dollars: 1000 }]);
    expect(store.states.get("user_1")?.accruedActiveMs).toBe(0);
  });
});

describe("DrizzlePlaytimeRewardStore", () => {
  test("applies activity and credits earned dollars in one transaction", async () => {
    const db = queryDouble();
    const tx = queryDouble([
      [],
      [
        {
          accruedActiveMs: PLAYTIME_REWARD_INTERVAL_MS - 100_000,
          lastActivityAt: at(0),
          lastAccruedAt: at(0),
        },
      ],
      [{ dollars: 1000 }],
      [],
    ]);
    db.transaction = async (callback: (transaction: unknown) => unknown) => callback(tx);
    const store = new DrizzlePlaytimeRewardStore(db);

    await expect(store.apply("user_1", "activity", at(100_000))).resolves.toMatchObject({
      accruedActiveMs: 0,
      awardedDollars: 500,
      awardedIntervals: 1,
      balance: 1000,
    });
  });

  test("does not create reward state during a flush for an unseen user", async () => {
    const db = queryDouble();
    const tx = queryDouble([[]]);
    db.transaction = async (callback: (transaction: unknown) => unknown) => callback(tx);
    const store = new DrizzlePlaytimeRewardStore(db);

    await expect(store.apply("user_1", "flush", at(100_000))).resolves.toBeUndefined();
  });
});

function at(offsetMs: number): Date {
  return new Date(BASE_TIME + offsetMs);
}

class MemoryPlaytimeRewardStore implements PlaytimeRewardStore {
  readonly balances = new Map<string, number>();
  readonly calls: Array<{ userId: string; mutation: PlaytimeRewardMutation; now: Date }> = [];
  readonly states = new Map<string, PlaytimeRewardState>();

  async apply(
    userId: string,
    mutation: PlaytimeRewardMutation,
    now: Date,
  ): Promise<PlaytimeRewardApplyResult | undefined> {
    this.calls.push({ userId, mutation, now });

    if (mutation === "activity" && !this.states.has(userId)) {
      this.states.set(userId, { accruedActiveMs: 0 });
    }

    const state = this.states.get(userId);

    if (!state) {
      return undefined;
    }

    const result = applyPlaytimeAccrual(state, mutation, now);
    this.states.set(userId, {
      accruedActiveMs: result.accruedActiveMs,
      lastActivityAt: result.lastActivityAt,
      lastAccruedAt: result.lastAccruedAt,
    });

    if (result.awardedDollars <= 0) {
      return result;
    }

    const balance = (this.balances.get(userId) ?? 0) + result.awardedDollars;
    this.balances.set(userId, balance);
    return { ...result, balance };
  }
}

function queryDouble(
  results: unknown[][] = [],
  // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Drizzle database.
): any {
  let index = 0;
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(results[index++] ?? []).then(resolve, reject);
    },
  };

  for (const method of [
    "select",
    "from",
    "where",
    "for",
    "update",
    "set",
    "returning",
    "insert",
    "values",
    "onConflictDoNothing",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
