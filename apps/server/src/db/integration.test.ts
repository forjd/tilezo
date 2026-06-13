import { beforeEach, describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { sql } from "drizzle-orm";
import { DrizzleAuthStore, UsernameTakenError } from "../auth/auth";
import { DrizzleFriendStore } from "../friends/friends";
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
  const friendStore = new DrizzleFriendStore(database);
  const persistence = new DrizzlePersistenceStore(database);

  beforeEach(async () => {
    await database.execute(
      sql`TRUNCATE TABLE users, rooms, friendships, user_room_sessions, room_items RESTART IDENTITY CASCADE`,
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

    expect(await friendStore.countFriends(dan.id)).toBe(1);
    expect((await friendStore.listFriends(dan.id)).map((friend) => friend.id)).toEqual([kai.id]);
    expect((await friendStore.listFriends(kai.id)).map((friend) => friend.id)).toEqual([dan.id]);

    await friendStore.removeFriend(kai.id, dan.id);
    expect(await friendStore.countFriends(dan.id)).toBe(0);
  });

  test("rejects self-friendship at the database level", async () => {
    const dan = await seedUser("Dan");
    await expect(friendStore.addFriend(dan.id, dan.id)).rejects.toThrow();
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
});
