import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import {
  DrizzleFriendStore,
  FriendError,
  FriendService,
  type FriendStore,
  type FriendUser,
  friendshipPair,
} from "./friends";

const kai = {
  id: "user_2",
  username: "Kai",
  appearance: DEFAULT_AVATAR_APPEARANCE,
} satisfies FriendUser;

describe("FriendService", () => {
  test("adds friends by username and includes presence", async () => {
    const store = createStore([kai]);
    const service = new FriendService(store, (userId) =>
      userId === "user_2" ? { online: true, roomId: "studio" } : { online: false },
    );

    await expect(service.add("user_1", "Kai")).resolves.toEqual({
      ...kai,
      online: true,
      roomId: "studio",
      canJoinRoom: true,
    });
    await expect(service.list("user_1")).resolves.toEqual([
      {
        ...kai,
        online: true,
        roomId: "studio",
        canJoinRoom: true,
      },
    ]);
  });

  test("rejects self-friendship and unknown users", async () => {
    const store = createStore([{ ...kai, id: "user_1" }]);
    const service = new FriendService(store, () => ({ online: false }));

    await expect(service.add("user_1", "Kai")).rejects.toThrow(FriendError);
    await expect(service.add("user_1", "Missing")).rejects.toThrow("No player found");
  });

  test("removes friends", async () => {
    const store = createStore([kai]);
    const service = new FriendService(store, () => ({ online: false }));

    await service.add("user_1", "Kai");
    await service.remove("user_1", "user_2");

    await expect(service.list("user_1")).resolves.toEqual([]);
  });

  test("rejects adding friends beyond the configured cap", async () => {
    const rem = { id: "user_3", username: "Rem", appearance: DEFAULT_AVATAR_APPEARANCE };
    const store = createStore([kai, rem]);
    const service = new FriendService(store, () => ({ online: false }), { maxFriends: 1 });

    await service.add("user_1", "Kai");
    await expect(service.add("user_1", "Rem")).rejects.toThrow("at most 1 friends");
  });

  test("lists each friendship once regardless of direction", async () => {
    const dan = { id: "user_1", username: "Dan", appearance: DEFAULT_AVATAR_APPEARANCE };
    const store = createStore([dan, kai]);
    const service = new FriendService(store, () => ({ online: false }));

    await service.add("user_1", "Kai");

    expect((await service.list("user_1")).map((friend) => friend.id)).toEqual(["user_2"]);
    expect((await service.list("user_2")).map((friend) => friend.id)).toEqual(["user_1"]);
  });
});

describe("friendshipPair", () => {
  test("orders the pair canonically regardless of argument order", () => {
    expect(friendshipPair("b", "a")).toEqual(["a", "b"]);
    expect(friendshipPair("a", "b")).toEqual(["a", "b"]);
  });
});

describe("DrizzleFriendStore", () => {
  const friend = { id: "user_2", username: "Kai", appearance: DEFAULT_AVATAR_APPEARANCE };

  test("finds users, counts, adds, removes, and lists friends both directions", async () => {
    expect(await new DrizzleFriendStore(queryDouble([[friend]])).findUserByUsername("Kai")).toEqual(
      friend,
    );
    expect(await new DrizzleFriendStore(queryDouble([[{ value: 3 }]])).countFriends("user_1")).toBe(
      3,
    );
    await new DrizzleFriendStore(queryDouble([[]])).addFriend("user_1", "user_2");
    await new DrizzleFriendStore(queryDouble([[]])).removeFriend("user_1", "user_2");

    // First query returns the friendship rows, the second resolves the friend users.
    const list = await new DrizzleFriendStore(
      queryDouble([[{ userId: "user_1", friendUserId: "user_2" }], [friend]]),
    ).listFriends("user_1");
    expect(list).toEqual([friend]);
  });

  test("returns no friends when there are no friendship rows and zero on a missing count", async () => {
    expect(await new DrizzleFriendStore(queryDouble([[]])).listFriends("user_1")).toEqual([]);
    expect(await new DrizzleFriendStore(queryDouble([[]])).countFriends("user_1")).toBe(0);
  });
});

// A minimal awaitable/chainable Drizzle query-builder stand-in: every builder method
// returns the same chain, and awaiting it yields the next queued result array.
function queryDouble(
  results: unknown[][] = [],
  options: { rejectWith?: unknown } = {},
  // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Drizzle database.
): any {
  let index = 0;
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      if (options.rejectWith !== undefined) {
        return Promise.reject(options.rejectWith).then(resolve, reject);
      }
      return Promise.resolve(results[index++] ?? []).then(resolve, reject);
    },
  };

  for (const method of [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
    "returning",
    "onConflictDoNothing",
    "onConflictDoUpdate",
    "insert",
    "update",
    "delete",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}

function createStore(users: FriendUser[]): FriendStore {
  const friendships = new Set<string>();

  return {
    async addFriend(userId, friendUserId) {
      friendships.add(friendshipKey(userId, friendUserId));
    },
    async countFriends(userId) {
      return [...friendships]
        .map((key) => key.split(":"))
        .filter(([left, right]) => left === userId || right === userId).length;
    },
    async findUserByUsername(username) {
      return users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase());
    },
    async listFriends(userId) {
      const friendIds = [...friendships]
        .map((key) => key.split(":"))
        .filter(([left, right]) => left === userId || right === userId)
        .map(([left, right]) => (left === userId ? right : left));
      return users.filter((user) => friendIds.includes(user.id));
    },
    async removeFriend(userId, friendUserId) {
      friendships.delete(friendshipKey(userId, friendUserId));
    },
  };
}

function friendshipKey(userId: string, friendUserId: string): string {
  return [userId, friendUserId].sort().join(":");
}
