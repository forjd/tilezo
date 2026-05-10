import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import type { PersistenceStore } from "../db/persistence";
import { RoomManager } from "./RoomManager";

describe("RoomManager", () => {
  test("creates rooms from the default layout and clones it for ad hoc rooms", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    const lobby = manager.getOrCreate("lobby");
    const studio = manager.getOrCreate("studio");

    expect(manager.getOrCreate("lobby")).toBe(lobby);
    expect(lobby.id).toBe("lobby");
    expect(studio.id).toBe("studio");
  });

  test("removes only empty rooms", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    const room = manager.getOrCreate("lobby");

    room.join({ id: "user_1", username: "Dan" });
    manager.removeIfEmpty("lobby");
    expect(manager.get("lobby")).toBe(room);

    room.leave("user_1");
    manager.removeIfEmpty("lobby");
    expect(manager.get("lobby")).toBeUndefined();
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

    expect(manager.getOrCreate("lobby").id).toBe("lobby");
    expect(store.seededRoomIds).toEqual(["lobby"]);
  });
});
