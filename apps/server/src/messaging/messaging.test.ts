import { describe, expect, test } from "bun:test";
import {
  DirectMessageError,
  type DirectMessageRecord,
  DirectMessageService,
  type DirectMessageStore,
  DrizzleDirectMessageStore,
} from "./messaging";

function createStore(): DirectMessageStore & { saved: DirectMessageRecord[] } {
  const saved: DirectMessageRecord[] = [];
  return {
    saved,
    async save(message) {
      const record: DirectMessageRecord = {
        id: message.id,
        fromUserId: message.senderUserId,
        toUserId: message.recipientUserId,
        text: message.body,
        sentAt: "2026-06-13T00:00:00.000Z",
      };
      saved.push(record);
      return record;
    },
    async listConversation(userId, otherUserId, limit) {
      return saved
        .filter(
          (message) =>
            (message.fromUserId === userId && message.toUserId === otherUserId) ||
            (message.fromUserId === otherUserId && message.toUserId === userId),
        )
        .slice(-limit);
    },
  };
}

describe("DirectMessageService", () => {
  test("sends a message between friends and persists it", async () => {
    const store = createStore();
    const service = new DirectMessageService(store, async () => true);

    const record = await service.send("user_1", "user_2", "hello");

    expect(record).toMatchObject({ fromUserId: "user_1", toUserId: "user_2", text: "hello" });
    expect(store.saved).toHaveLength(1);
  });

  test("rejects messaging yourself", async () => {
    const service = new DirectMessageService(createStore(), async () => true);
    await expect(service.send("user_1", "user_1", "hi")).rejects.toBeInstanceOf(DirectMessageError);
  });

  test("rejects messaging non-friends without persisting", async () => {
    const store = createStore();
    const service = new DirectMessageService(store, async () => false);

    await expect(service.send("user_1", "user_2", "hi")).rejects.toThrow(
      "only message your friends",
    );
    expect(store.saved).toHaveLength(0);
  });

  test("returns conversation history for friends and blocks it for non-friends", async () => {
    const store = createStore();
    const friendly = new DirectMessageService(store, async () => true);

    await friendly.send("user_1", "user_2", "a");
    await friendly.send("user_2", "user_1", "b");

    expect((await friendly.history("user_1", "user_2")).map((m) => m.text)).toEqual(["a", "b"]);

    const blocked = new DirectMessageService(store, async () => false);
    await expect(blocked.history("user_1", "user_2")).rejects.toBeInstanceOf(DirectMessageError);
  });
});

describe("DrizzleDirectMessageStore", () => {
  const createdAt = new Date("2026-06-13T10:00:00.000Z");

  test("saves a message and maps row columns to the wire record", async () => {
    const row = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      body: "hello",
      createdAt,
    };
    const store = new DrizzleDirectMessageStore(queryDouble([[row]]));

    await expect(
      store.save({ id: "dm_1", senderUserId: "user_1", recipientUserId: "user_2", body: "hello" }),
    ).resolves.toEqual({
      id: "dm_1",
      fromUserId: "user_1",
      toUserId: "user_2",
      text: "hello",
      sentAt: "2026-06-13T10:00:00.000Z",
    });
  });

  test("lists a conversation oldest-first", async () => {
    // The store fetches newest-first then reverses, so feed rows newest-first.
    const newer = {
      id: "dm_2",
      senderUserId: "user_2",
      recipientUserId: "user_1",
      body: "second",
      createdAt: new Date("2026-06-13T10:01:00.000Z"),
    };
    const older = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      body: "first",
      createdAt,
    };
    const store = new DrizzleDirectMessageStore(queryDouble([[newer, older]]));

    const history = await store.listConversation("user_1", "user_2", 50);
    expect(history.map((message) => message.text)).toEqual(["first", "second"]);
  });
});

// Minimal awaitable/chainable Drizzle query-builder stand-in: each builder method returns
// the same chain, and awaiting it yields the next queued result array.
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
    "returning",
    "insert",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
