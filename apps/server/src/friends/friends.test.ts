import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { FriendError, FriendService, type FriendStore, type FriendUser } from "./friends";

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
});

function createStore(users: FriendUser[]): FriendStore {
  const friendships = new Set<string>();

  return {
    async addFriend(userId, friendUserId) {
      friendships.add(friendshipKey(userId, friendUserId));
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
