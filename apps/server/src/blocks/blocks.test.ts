import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { BlockError, BlockService, type BlockStore, DrizzleBlockStore } from "./blocks";

function createStore(): BlockStore & { pairs: Set<string> } {
  const pairs = new Set<string>();
  return {
    pairs,
    async blockUser(blockerUserId, blockedUserId) {
      pairs.add(pairKey(blockerUserId, blockedUserId));
    },
    async unblockUser(blockerUserId, blockedUserId) {
      pairs.delete(pairKey(blockerUserId, blockedUserId));
    },
    async isBlocked(blockerUserId, blockedUserId) {
      return pairs.has(pairKey(blockerUserId, blockedUserId));
    },
    async isBlockedEitherDirection(userId, otherUserId) {
      return pairs.has(pairKey(userId, otherUserId)) || pairs.has(pairKey(otherUserId, userId));
    },
    async listBlockedUsers() {
      return [];
    },
  };
}

describe("BlockService", () => {
  test("blocks, unblocks, and checks either direction", async () => {
    const store = createStore();
    const service = new BlockService(store);

    await service.block("user_1", "user_2");

    expect(await service.isBlocked("user_1", "user_2")).toBe(true);
    expect(await service.isBlockedEitherDirection("user_2", "user_1")).toBe(true);

    await service.unblock("user_1", "user_2");
    expect(await service.isBlockedEitherDirection("user_1", "user_2")).toBe(false);
  });

  test("rejects self-blocks", async () => {
    const service = new BlockService(createStore());

    await expect(service.block("user_1", "user_1")).rejects.toBeInstanceOf(BlockError);
  });
});

describe("DrizzleBlockStore", () => {
  test("maps blocked user rows", async () => {
    const row = {
      id: "user_2",
      username: "Kai",
      appearance: DEFAULT_AVATAR_APPEARANCE,
      blockedAt: new Date("2026-06-13T00:00:00.000Z"),
    };
    const store = new DrizzleBlockStore(queryDouble([[row]]));

    await expect(store.listBlockedUsers("user_1")).resolves.toEqual([
      {
        id: "user_2",
        username: "Kai",
        appearance: DEFAULT_AVATAR_APPEARANCE,
        blockedAt: "2026-06-13T00:00:00.000Z",
      },
    ]);
  });

  test("checks blocked state", async () => {
    const store = new DrizzleBlockStore(queryDouble([[{ blockerUserId: "user_1" }], []]));

    await expect(store.isBlocked("user_1", "user_2")).resolves.toBe(true);
    await expect(store.isBlockedEitherDirection("user_1", "user_2")).resolves.toBe(false);
  });
});

function pairKey(blockerUserId: string, blockedUserId: string): string {
  return `${blockerUserId}:${blockedUserId}`;
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
    "orderBy",
    "limit",
    "values",
    "insert",
    "onConflictDoNothing",
    "delete",
    "innerJoin",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
