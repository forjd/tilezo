import { beforeEach, describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE, ROOM_CREATION_COST } from "@tilezo/protocol";
import { sql } from "drizzle-orm";
import { DrizzleAuthStore, UsernameTakenError } from "../auth/auth";
import { DrizzleEconomyStore } from "../economy/economy";
import { DrizzlePlaytimeRewardStore, PLAYTIME_ACTIVE_WINDOW_MS } from "../economy/playtimeRewards";
import { DrizzleFriendStore } from "../friends/friends";
import { DrizzleDirectMessageStore } from "../messaging/messaging";
import { createDatabase } from "./db";
import { DrizzlePersistenceStore } from "./persistence";

// Real-Postgres integration coverage for the Drizzle stores: exercises the actual column
// mappings, unique/check constraints, onConflict targets, and the bidirectional friend
// join that the in-memory/fake-double unit tests cannot. Opt-in via RUN_DB_TESTS=1 against
// a migrated Postgres (CI sets it and provides the service); the default `bun test` run
// skips it so it never needs a database — even though `.env` defines DATABASE_URL.
const dbTestsEnabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const db = dbTestsEnabled ? createDatabase(process.env.DATABASE_URL) : undefined;

describe("database integration", () => {
  const database = db;

  if (!database) {
    test.skip("requires RUN_DB_TESTS=1 and a migrated Postgres", () => {});
    return;
  }

  const authStore = new DrizzleAuthStore(database);
  const economyStore = new DrizzleEconomyStore(database);
  const playtimeRewardStore = new DrizzlePlaytimeRewardStore(database);
  const friendStore = new DrizzleFriendStore(database);
  const directMessageStore = new DrizzleDirectMessageStore(database);
  const persistence = new DrizzlePersistenceStore(database);

  beforeEach(async () => {
    await database.execute(
      sql`TRUNCATE TABLE users, rooms, friendships, user_room_sessions, room_items, direct_messages, user_inventory, user_playtime_rewards RESTART IDENTITY CASCADE`,
    );
  });

  function seedUser(username: string) {
    return authStore.createUser({
      appearance: DEFAULT_AVATAR_APPEARANCE,
      username,
      usernameKey: username.toLowerCase(),
      passwordHash: `hash-${username}`,
    });
  }

  test("round-trips users and enforces uniqueness and token revocation", async () => {
    const user = await seedUser("Dan");
    expect(user.tokenVersion).toBe(0);

    expect(await authStore.findUserByUsernameKey("dan")).toMatchObject({
      id: user.id,
      username: "Dan",
    });
    expect(await authStore.findUserById(user.id)).toMatchObject({ id: user.id });

    const updated = await authStore.updateUserAppearance(user.id, {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "bob",
    });
    expect(updated?.appearance.hair).toBe("bob");

    await authStore.incrementTokenVersion(user.id);
    expect((await authStore.findUserById(user.id))?.tokenVersion).toBe(1);

    // The DB unique constraint on username_key drives USERNAME_TAKEN, not a TOCTOU check.
    await expect(
      authStore.createUser({
        appearance: DEFAULT_AVATAR_APPEARANCE,
        username: "DAN",
        usernameKey: "dan",
        passwordHash: "hash",
      }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  test("stores canonical friendships and lists them from either direction", async () => {
    const dan = await seedUser("Dan");
    const kai = await seedUser("Kai");

    await friendStore.addFriend(dan.id, kai.id);
    // Adding the reverse pair is idempotent (canonical ordering + onConflictDoNothing).
    await friendStore.addFriend(kai.id, dan.id);

    expect(await friendStore.countFriendSlots(dan.id)).toBe(1);
    expect((await friendStore.listFriends(dan.id)).map((friend) => friend.id)).toEqual([kai.id]);
    expect((await friendStore.listFriends(kai.id)).map((friend) => friend.id)).toEqual([dan.id]);

    await friendStore.removeFriend(kai.id, dan.id);
    expect(await friendStore.countFriendSlots(dan.id)).toBe(0);
  });

  test("rejects self-friendship at the database level", async () => {
    const dan = await seedUser("Dan");
    await expect(friendStore.addFriend(dan.id, dan.id)).rejects.toThrow();
  });

  test("persists direct messages and lists a conversation in both directions", async () => {
    const dan = await seedUser("Dan");
    const kai = await seedUser("Kai");

    const sent = await directMessageStore.save({
      id: "dm_1",
      senderUserId: dan.id,
      recipientUserId: kai.id,
      body: "hey Kai",
    });
    expect(sent).toMatchObject({ fromUserId: dan.id, toUserId: kai.id, text: "hey Kai" });

    await directMessageStore.save({
      id: "dm_2",
      senderUserId: kai.id,
      recipientUserId: dan.id,
      body: "hi Dan",
    });

    // Both participants see the same conversation, oldest-first.
    expect(
      (await directMessageStore.listConversation(dan.id, kai.id, 50)).map((m) => m.text),
    ).toEqual(["hey Kai", "hi Dan"]);
    expect(
      (await directMessageStore.listConversation(kai.id, dan.id, 50)).map((m) => m.text),
    ).toEqual(["hey Kai", "hi Dan"]);

    // The no-self CHECK constraint blocks a self-message.
    await expect(
      directMessageStore.save({
        id: "dm_3",
        senderUserId: dan.id,
        recipientUserId: dan.id,
        body: "note to self",
      }),
    ).rejects.toThrow();
  });

  test("seeds rooms, lists by visibility and owner, and tracks the last room", async () => {
    const owner = await seedUser("Dan");
    const publicLayout = createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 });
    const privateLayout = createRectRoomLayout("home_dan", "Dan's Room", 4, 4, { x: 1, y: 1 });

    await persistence.seedRoom(publicLayout);
    await persistence.seedRoom(privateLayout, {
      ownerUserId: owner.id,
      visibility: "private",
      access: "knock",
      description: "cozy",
      capacity: 10,
    });

    expect(await persistence.getRoom("lobby")).toMatchObject({ id: "lobby" });
    expect((await persistence.listPublicRooms()).map((layout) => layout.id)).toEqual(["lobby"]);
    expect((await persistence.listOwnedRooms(owner.id)).map((room) => room.layout.id)).toEqual([
      "home_dan",
    ]);

    const stored = await persistence.listRooms();
    expect(stored.find((room) => room.layout.id === "home_dan")).toMatchObject({
      visibility: "private",
      access: "knock",
      description: "cozy",
      capacity: 10,
    });

    await persistence.saveLastRoomIdForUser(owner.id, "lobby");
    expect(await persistence.getLastRoomIdForUser(owner.id)).toBe("lobby");
    await persistence.clearLastRoomIdForUser(owner.id);
    expect(await persistence.getLastRoomIdForUser(owner.id)).toBeUndefined();
  });

  test("tracks starting balance, room creation costs, and inventory purchases", async () => {
    const owner = await seedUser("Dan");
    const startBalance = owner.dollars;

    expect(await economyStore.getBalance(owner.id)).toBe(startBalance);
    expect(await economyStore.getInventory(owner.id)).toEqual([]);

    const spent = await economyStore.spend(owner.id, ROOM_CREATION_COST);
    expect(spent.balance).toBe(startBalance - ROOM_CREATION_COST);
    expect(await economyStore.getBalance(owner.id)).toBe(startBalance - ROOM_CREATION_COST);

    const purchase = await economyStore.purchase(owner.id, "woven_rug");
    expect(purchase.balance).toBe(startBalance - ROOM_CREATION_COST - 25);
    expect(purchase.inventory).toContainEqual({ itemType: "woven_rug", quantity: 1 });

    const second = await economyStore.purchase(owner.id, "woven_rug");
    expect(second.inventory).toContainEqual({ itemType: "woven_rug", quantity: 2 });

    expect(await economyStore.reserveItem(owner.id, "woven_rug")).toBe(true);
    expect(await economyStore.getInventory(owner.id)).toContainEqual({
      itemType: "woven_rug",
      quantity: 1,
    });

    await economyStore.refundItem(owner.id, "woven_rug");
    expect(await economyStore.getInventory(owner.id)).toContainEqual({
      itemType: "woven_rug",
      quantity: 2,
    });
  });

  test("credits hourly active play rewards and persists remainder progress", async () => {
    const owner = await seedUser("Dan");
    const startBalance = owner.dollars;
    const startedAt = new Date("2026-06-15T00:00:00.000Z");
    let result: Awaited<ReturnType<typeof playtimeRewardStore.apply>>;

    for (let index = 0; index <= 12; index += 1) {
      result = await playtimeRewardStore.apply(
        owner.id,
        "activity",
        new Date(startedAt.getTime() + index * PLAYTIME_ACTIVE_WINDOW_MS),
      );
    }

    expect(result).toMatchObject({
      accruedActiveMs: 0,
      awardedDollars: 500,
      awardedIntervals: 1,
      balance: startBalance + 500,
    });
    expect(await economyStore.getBalance(owner.id)).toBe(startBalance + 500);
  });

  test("rejects spending and purchases with insufficient funds", async () => {
    const owner = await seedUser("Dan");
    await economyStore.spend(owner.id, owner.dollars);

    await expect(economyStore.purchase(owner.id, "crate_table")).rejects.toThrow(
      "You need $50 to buy this item",
    );
    await expect(economyStore.spend(owner.id, 1)).rejects.toThrow("You need $1 for this");
  });

  test("rejects purchasing unknown furniture", async () => {
    const owner = await seedUser("Dan");
    await expect(economyStore.purchase(owner.id, "no_such_item")).rejects.toThrow(
      "This item is not for sale",
    );
  });

  test("rejects reserving items that are not in the inventory", async () => {
    const owner = await seedUser("Dan");
    expect(await economyStore.reserveItem(owner.id, "crate_table")).toBe(false);
  });
});
