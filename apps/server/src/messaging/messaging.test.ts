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
    async listUnreadCounts(userId) {
      const counts = new Map<string, number>();

      for (const message of saved) {
        if (message.toUserId !== userId || message.readAt) {
          continue;
        }

        counts.set(message.fromUserId, (counts.get(message.fromUserId) ?? 0) + 1);
      }

      return [...counts].map(([friendId, count]) => ({ friendId, count }));
    },
    async markConversationRead(readerUserId, otherUserId) {
      const readAt = "2026-06-13T10:02:00.000Z";
      const messageIds: string[] = [];

      for (const message of saved) {
        if (
          message.fromUserId === otherUserId &&
          message.toUserId === readerUserId &&
          !message.readAt
        ) {
          message.readAt = readAt;
          messageIds.push(message.id);
        }
      }

      return { readerUserId, otherUserId, messageIds, readAt };
    },
    async findMessage(messageId) {
      return saved.find((message) => message.id === messageId);
    },
    async editMessage(messageId, text) {
      const message = saved.find((item) => item.id === messageId);

      if (!message) {
        throw new Error("missing message");
      }

      message.text = text;
      message.editedAt = "2026-06-13T10:03:00.000Z";
      return message;
    },
    async deleteMessage(messageId) {
      const message = saved.find((item) => item.id === messageId);

      if (!message) {
        throw new Error("missing message");
      }

      message.deletedAt = "2026-06-13T10:04:00.000Z";
      message.text = "";
      return {
        id: message.id,
        fromUserId: message.fromUserId,
        toUserId: message.toUserId,
        deletedAt: message.deletedAt,
      };
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

  test("rejects blocked conversations without persisting", async () => {
    const store = createStore();
    const service = new DirectMessageService(
      store,
      async () => true,
      async () => true,
    );

    await expect(service.send("user_1", "user_2", "hi")).rejects.toThrow(
      "cannot message this player",
    );
    await expect(service.history("user_1", "user_2")).rejects.toBeInstanceOf(DirectMessageError);
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

  test("marks conversations read and returns unread counts", async () => {
    const store = createStore();
    const service = new DirectMessageService(store, async () => true);

    await service.send("user_2", "user_1", "a");
    await service.send("user_2", "user_1", "b");

    expect(await service.unreadCounts("user_1")).toEqual([{ friendId: "user_2", count: 2 }]);

    const receipt = await service.markRead("user_1", "user_2");
    expect(receipt.readerUserId).toBe("user_1");
    expect(receipt.otherUserId).toBe("user_2");
    expect(receipt.messageIds).toHaveLength(2);
    expect(receipt.messageIds.every((id) => id.startsWith("dm_"))).toBe(true);
    expect(await service.unreadCounts("user_1")).toEqual([]);
  });

  test("edits and deletes owned messages", async () => {
    const store = createStore();
    const service = new DirectMessageService(store, async () => true);
    const sent = await service.send("user_1", "user_2", "before");

    await expect(service.edit("user_1", sent.id, "after")).resolves.toMatchObject({
      id: sent.id,
      text: "after",
      editedAt: "2026-06-13T10:03:00.000Z",
    });
    await expect(service.delete("user_1", sent.id)).resolves.toMatchObject({
      id: sent.id,
      deletedAt: "2026-06-13T10:04:00.000Z",
    });
  });

  test("rejects edits from non-senders and deleted messages", async () => {
    const store = createStore();
    const service = new DirectMessageService(store, async () => true);
    const sent = await service.send("user_1", "user_2", "before");

    await expect(service.edit("user_2", sent.id, "after")).rejects.toThrow("own messages");
    await service.delete("user_1", sent.id);
    await expect(service.edit("user_1", sent.id, "after")).rejects.toThrow("already been deleted");
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
      readAt: new Date("2026-06-13T10:02:00.000Z"),
      editedAt: new Date("2026-06-13T10:03:00.000Z"),
      deletedAt: null,
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
      readAt: "2026-06-13T10:02:00.000Z",
      editedAt: "2026-06-13T10:03:00.000Z",
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
      readAt: null,
      editedAt: null,
      deletedAt: null,
    };
    const older = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      body: "first",
      createdAt,
      readAt: null,
      editedAt: null,
      deletedAt: null,
    };
    const store = new DrizzleDirectMessageStore(queryDouble([[newer, older]]));

    const history = await store.listConversation("user_1", "user_2", 50);
    expect(history.map((message) => message.text)).toEqual(["first", "second"]);
  });

  test("hides deleted message body in mapped records", async () => {
    const row = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      body: "secret",
      createdAt,
      readAt: null,
      editedAt: null,
      deletedAt: new Date("2026-06-13T10:04:00.000Z"),
    };
    const store = new DrizzleDirectMessageStore(queryDouble([[row]]));

    await expect(store.findMessage("dm_1")).resolves.toEqual({
      id: "dm_1",
      fromUserId: "user_1",
      toUserId: "user_2",
      text: "",
      sentAt: "2026-06-13T10:00:00.000Z",
      deletedAt: "2026-06-13T10:04:00.000Z",
    });
  });

  test("lists unread counts and marks conversations read", async () => {
    const store = new DrizzleDirectMessageStore(
      queryDouble([[{ friendId: "user_2", value: 3 }], [{ id: "dm_1" }, { id: "dm_2" }]]),
    );

    await expect(store.listUnreadCounts("user_1")).resolves.toEqual([
      { friendId: "user_2", count: 3 },
    ]);
    await expect(store.markConversationRead("user_1", "user_2")).resolves.toMatchObject({
      readerUserId: "user_1",
      otherUserId: "user_2",
      messageIds: ["dm_1", "dm_2"],
    });
  });

  test("edits and deletes messages in the store", async () => {
    const edited = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      body: "after",
      createdAt,
      readAt: null,
      editedAt: new Date("2026-06-13T10:03:00.000Z"),
      deletedAt: null,
    };
    const deleted = {
      id: "dm_1",
      senderUserId: "user_1",
      recipientUserId: "user_2",
      deletedAt: new Date("2026-06-13T10:04:00.000Z"),
    };
    const store = new DrizzleDirectMessageStore(queryDouble([[edited], [deleted]]));

    await expect(store.editMessage("dm_1", "after")).resolves.toMatchObject({
      id: "dm_1",
      text: "after",
      editedAt: "2026-06-13T10:03:00.000Z",
    });
    await expect(store.deleteMessage("dm_1")).resolves.toEqual({
      id: "dm_1",
      fromUserId: "user_1",
      toUserId: "user_2",
      deletedAt: "2026-06-13T10:04:00.000Z",
    });
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
    "groupBy",
    "update",
    "set",
    "values",
    "returning",
    "insert",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
