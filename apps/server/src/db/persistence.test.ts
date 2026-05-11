import { describe, expect, spyOn, test } from "bun:test";
import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import {
  DrizzlePersistenceStore,
  loadOrSeedDefaultRoom,
  loadOrSeedPublicRooms,
  type PersistenceStore,
} from "./persistence";

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

  test("falls back to bundled rooms when room persistence fails", async () => {
    const fallbackLayout = createRectRoomLayout("lobby", "Fallback Lobby", 3, 3, { x: 1, y: 1 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const store = createStore();
    store.getRoom = async () => {
      throw new Error("database unavailable");
    };

    const layout = await loadOrSeedDefaultRoom(store, fallbackLayout);

    expect(layout).toBe(fallbackLayout);
    expect(warn).toHaveBeenCalledWith(
      "Room persistence unavailable; using bundled default room",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  test("seeds missing public rooms and returns the persisted directory", async () => {
    const lobby = createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 });
    const studio = createRectRoomLayout("studio", "Studio", 4, 4, { x: 1, y: 1 });
    const storedLobby = createRectRoomLayout("lobby", "Stored Lobby", 2, 2, { x: 0, y: 0 });
    const store = {
      seededRooms: [] as RoomLayout[],
      async getRoom(roomId: string) {
        return roomId === "lobby" ? storedLobby : undefined;
      },
      async seedRoom(layout: RoomLayout) {
        this.seededRooms.push(layout);
      },
      async listRooms() {
        return [storedLobby, studio];
      },
    } satisfies PersistenceStore & { seededRooms: RoomLayout[] };

    await expect(loadOrSeedPublicRooms(store, [lobby, studio])).resolves.toEqual([
      storedLobby,
      studio,
    ]);
    expect(store.seededRooms).toEqual([studio]);
  });
});

describe("DrizzlePersistenceStore", () => {
  test("loads room layouts and upserts rooms", async () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 2, 2, { x: 0, y: 0 });
    const db = createDrizzleDouble(layout);
    const store = new DrizzlePersistenceStore(db.database);

    await expect(store.getRoom("lobby")).resolves.toBe(layout);
    await store.seedRoom(layout);
    await expect(store.listRooms()).resolves.toEqual([layout]);

    expect(db.selectedRooms).toBe(1);
    expect(db.listedRooms).toBe(1);
    expect(db.insertedValues).toEqual([
      {
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        layout,
      },
    ]);
    expect(db.conflictUpdates).toHaveLength(1);
  });
});

function createStore(options: { room?: RoomLayout } = {}) {
  const store = {
    seededRooms: [] as RoomLayout[],
    async getRoom(roomId: string) {
      return options.room?.id === roomId ? options.room : undefined;
    },
    async seedRoom(layout: RoomLayout) {
      this.seededRooms.push(layout);
    },
  } satisfies PersistenceStore & {
    seededRooms: RoomLayout[];
  };

  return store;
}

function createDrizzleDouble(layout: RoomLayout) {
  const calls = {
    selectedRooms: 0,
    listedRooms: 0,
    insertedValues: [] as unknown[],
    conflictUpdates: [] as unknown[],
    database: {
      select() {
        return {
          from() {
            return {
              where() {
                calls.selectedRooms += 1;
                return Promise.resolve([{ layout }]);
              },
              orderBy() {
                calls.listedRooms += 1;
                return Promise.resolve([{ layout }]);
              },
            };
          },
        };
      },
      insert() {
        return {
          values(value: unknown) {
            calls.insertedValues.push(value);
            return {
              onConflictDoUpdate(update: unknown) {
                calls.conflictUpdates.push(update);
                return Promise.resolve();
              },
            };
          },
        };
      },
    } as unknown as ConstructorParameters<typeof DrizzlePersistenceStore>[0],
  };

  return calls;
}
