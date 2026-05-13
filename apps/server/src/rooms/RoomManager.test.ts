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

  test("bundled public rooms spawn users on the door tile", async () => {
    const manager = await RoomManager.create();

    manager.getOrCreate("lobby")?.join({ id: "user_1", username: "Dan" });

    expect(manager.get("lobby")?.getUsers()[0]?.position).toEqual({ x: 0, y: 2 });
  });
});
