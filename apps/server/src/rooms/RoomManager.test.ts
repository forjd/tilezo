import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import type { PersistenceStore } from "../db/persistence";
import { RoomManager } from "./RoomManager";

describe("RoomManager", () => {
  test("creates only public rooms without an owner", () => {
    const manager = new RoomManager([
      createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }),
      createRectRoomLayout("studio", "Studio", 4, 4, { x: 1, y: 1 }),
    ]);

    const lobby = manager.getOrCreate("lobby");
    const studio = manager.getOrCreate("studio");

    expect(manager.getOrCreate("lobby")).toBe(lobby);
    expect(lobby?.id).toBe("lobby");
    expect(studio?.id).toBe("studio");
    expect(manager.getOrCreate("private-room")).toBeUndefined();
  });

  test("lists and joins private rooms only for their owner", () => {
    const privateLayout = createRectRoomLayout("home_user_1", "Dan's Room", 3, 3, {
      x: 1,
      y: 1,
    });
    const manager = new RoomManager({
      publicLayouts: [createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 })],
      privateLayouts: [{ layout: privateLayout, ownerUserId: "user_1" }],
    });

    expect(manager.listPublicRooms(undefined, "user_2")).toEqual([
      { id: "lobby", name: "Lobby", userCount: 0, joined: false },
    ]);
    expect(manager.listPublicRooms(undefined, "user_1")).toEqual([
      { id: "lobby", name: "Lobby", userCount: 0, joined: false },
      { id: "home_user_1", name: "Dan's Room", userCount: 0, joined: false },
    ]);
    expect(manager.getOrCreate("home_user_1", "user_2")).toBeUndefined();
    expect(manager.getOrCreate("home_user_1", "user_1")?.id).toBe("home_user_1");
    expect(manager.getOrCreate("home_user_1", "user_2")).toBeUndefined();
    expect(manager.hasAccessibleLayout("home_user_1", "user_1")).toBe(true);
    expect(manager.hasAccessibleLayout("home_user_1", "user_2")).toBe(false);
  });

  test("removes only empty rooms", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    const room = manager.getOrCreate("lobby");

    room?.join({ id: "user_1", username: "Dan" });
    manager.removeIfEmpty("lobby");
    expect(manager.get("lobby")).toBe(room);

    room?.leave("user_1");
    manager.removeIfEmpty("lobby");
    expect(manager.get("lobby")).toBeUndefined();
  });

  test("removes a user from every other active room", () => {
    const manager = new RoomManager([
      createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }),
      createRectRoomLayout("studio", "Studio", 3, 3, { x: 1, y: 1 }),
    ]);
    manager.getOrCreate("lobby")?.join({ id: "user_1", username: "Dan" });
    manager.getOrCreate("studio")?.join({ id: "user_1", username: "Dan" });

    expect(manager.removeUserFromOtherRooms("user_1", "studio")).toEqual(["lobby"]);
    expect(manager.get("lobby")?.hasUser("user_1")).toBe(false);
    expect(manager.get("studio")?.hasUser("user_1")).toBe(true);
  });

  test("lists public rooms with live population and current-room state", () => {
    const manager = new RoomManager([
      createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }),
      createRectRoomLayout("studio", "Studio", 4, 4, { x: 1, y: 1 }),
    ]);

    manager.getOrCreate("studio")?.join({ id: "user_1", username: "Dan" });

    expect(manager.listPublicRooms("studio")).toEqual([
      { id: "lobby", name: "Lobby", userCount: 0, joined: false },
      { id: "studio", name: "Studio", userCount: 1, joined: true },
    ]);
  });

  test("adds created public and private rooms to the accessible directory", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    const publicRoom = createRectRoomLayout("room_public", "Public Room", 4, 4, { x: 1, y: 1 });
    const privateRoom = createRectRoomLayout("room_private", "Private Room", 4, 4, {
      x: 1,
      y: 1,
    });

    manager.addRoom(publicRoom, { ownerUserId: "user_1", visibility: "public" });
    manager.addRoom(privateRoom, { ownerUserId: "user_1", visibility: "private" });

    expect(manager.listPublicRooms(undefined, "user_2").map((room) => room.id)).toEqual([
      "lobby",
      "room_public",
    ]);
    expect(manager.listPublicRooms(undefined, "user_1").map((room) => room.id)).toEqual([
      "lobby",
      "room_public",
      "room_private",
    ]);
  });

  test("requires approval for knock-only rooms unless the user owns the room", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    const knockRoom = createRectRoomLayout("room_knock", "Knock Room", 4, 4, { x: 1, y: 1 });

    manager.addRoom(knockRoom, {
      access: "knock",
      ownerUserId: "user_1",
      visibility: "public",
    });

    expect(manager.listPublicRooms(undefined, "user_2").map((room) => room.id)).toContain(
      "room_knock",
    );
    expect(manager.canJoinRoom("room_knock", "user_2")).toEqual({
      ok: false,
      code: "ROOM_ACCESS_REQUIRED",
      message: "This room requires approval before joining",
    });
    expect(manager.canJoinRoom("room_knock", "user_1")).toEqual({ ok: true });
  });

  test("rejects joins when an active room is at capacity but allows reconnects", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    const tinyRoom = createRectRoomLayout("tiny", "Tiny", 4, 4, { x: 1, y: 1 });
    manager.addRoom(tinyRoom, { capacity: 1, visibility: "public" });
    const room = manager.getOrCreate("tiny");

    room?.join({ id: "user_1", username: "Dan" });

    expect(manager.canJoinRoom("tiny", "user_2")).toEqual({
      ok: false,
      code: "ROOM_FULL",
      message: "This room is full",
    });
    expect(manager.canJoinRoom("tiny", "user_1")).toEqual({ ok: true });
  });

  test("hydrates persisted room capacity rules", () => {
    const layout = createRectRoomLayout("tiny", "Tiny", 4, 4, { x: 1, y: 1 });
    const manager = new RoomManager({
      publicLayouts: [layout],
      privateLayouts: [],
      roomRules: [{ roomId: "tiny", access: "open", capacity: 1 }],
    });
    const room = manager.getOrCreate("tiny");

    room?.join({ id: "user_1", username: "Dan" });

    expect(manager.canJoinRoom("tiny", "user_2")).toEqual({
      ok: false,
      code: "ROOM_FULL",
      message: "This room is full",
    });
  });

  test("hydrates cached room items and exposes owner edit permissions", () => {
    const layout = createRectRoomLayout("room_public", "Public Room", 4, 4, { x: 1, y: 1 });
    const manager = new RoomManager(
      { publicLayouts: [layout], privateLayouts: [] },
      {
        roomItems: new Map([
          [
            "room_public",
            [
              {
                id: "item_1",
                itemType: "crate_table",
                x: 2,
                y: 1,
                z: 0,
                rotation: 0,
                state: {},
              },
            ],
          ],
        ]),
      },
    );

    manager.addRoom(layout, { ownerUserId: "user_1", visibility: "public" });

    expect(manager.canEditRoom("room_public", "user_1")).toBe(true);
    expect(manager.canEditRoom("room_public", "user_2")).toBe(false);
    expect(manager.getOrCreate("room_public")?.getSnapshot().items).toEqual([
      {
        id: "item_1",
        itemType: "crate_table",
        x: 2,
        y: 1,
        z: 0,
        rotation: 0,
        state: {},
      },
    ]);
  });

  test("reports room metrics for the debug endpoint", () => {
    const manager = new RoomManager([
      createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }),
      createRectRoomLayout("studio", "Studio", 3, 3, { x: 1, y: 1 }),
    ]);

    manager.addPrivateRoom(
      createRectRoomLayout("home_user_1", "Home", 3, 3, { x: 1, y: 1 }),
      "user_1",
    );
    manager.getOrCreate("studio")?.join({ id: "user_1", username: "Dan" });

    expect(manager.getMetrics()).toEqual({
      activeRooms: 1,
      rooms: [{ id: "studio", userCount: 1 }],
      layouts: {
        public: 2,
        private: 1,
      },
    });
  });

  test("loads and seeds the bundled default room through persistence", async () => {
    const store = {
      seededRoomIds: [] as string[],
      async getRoom() {
        return undefined;
      },
      async seedRoom(layout) {
        this.seededRoomIds.push(layout.id);
      },
    } satisfies PersistenceStore & { seededRoomIds: string[] };

    const manager = await RoomManager.create({ persistence: store });

    expect(manager.getOrCreate("lobby")?.id).toBe("lobby");
    expect(store.seededRoomIds).toEqual(["lobby", "atrium", "studio"]);
  });

  test("bundled public rooms spawn users on the attached door tile", async () => {
    const manager = await RoomManager.create();

    manager.getOrCreate("lobby")?.join({ id: "user_1", username: "Dan" });

    expect(manager.get("lobby")?.getUsers()[0]?.position).toEqual({ x: -1, y: 2 });
  });
});
