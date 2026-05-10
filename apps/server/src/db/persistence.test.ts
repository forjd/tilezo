import { describe, expect, test } from "bun:test";
import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import { loadOrSeedDefaultRoom, type PersistenceStore, persistJoinedUser } from "./persistence";

describe("persistence", () => {
  test("loads an existing default room from the store", async () => {
    const storedLayout = createRectRoomLayout("lobby", "Stored Lobby", 2, 2, { x: 0, y: 0 });
    const fallbackLayout = createRectRoomLayout("lobby", "Fallback Lobby", 3, 3, { x: 1, y: 1 });
    const store = createStore({ room: storedLayout });

    const layout = await loadOrSeedDefaultRoom(store, fallbackLayout);

    expect(layout).toBe(storedLayout);
    expect(store.seededRooms).toEqual([]);
  });

  test("seeds the default room when the store has no room", async () => {
    const fallbackLayout = createRectRoomLayout("lobby", "Fallback Lobby", 3, 3, { x: 1, y: 1 });
    const store = createStore();

    const layout = await loadOrSeedDefaultRoom(store, fallbackLayout);

    expect(layout).toBe(fallbackLayout);
    expect(store.seededRooms).toEqual([fallbackLayout]);
  });

  test("persists a joined user", async () => {
    const store = createStore();

    await persistJoinedUser(store, { id: "user_1", username: "Dan" });

    expect(store.users).toEqual([{ id: "user_1", username: "Dan" }]);
  });

  test("skips persistence when no store is configured", async () => {
    await expect(persistJoinedUser(undefined, { id: "user_1", username: "Dan" })).resolves.toBe(
      undefined,
    );
  });
});

function createStore(options: { room?: RoomLayout } = {}) {
  const store = {
    seededRooms: [] as RoomLayout[],
    users: [] as { id: string; username: string }[],
    async getRoom(roomId: string) {
      return options.room?.id === roomId ? options.room : undefined;
    },
    async seedRoom(layout: RoomLayout) {
      this.seededRooms.push(layout);
    },
    async upsertUser(user: { id: string; username: string }) {
      this.users.push(user);
    },
  } satisfies PersistenceStore & {
    seededRooms: RoomLayout[];
    users: { id: string; username: string }[];
  };

  return store;
}
