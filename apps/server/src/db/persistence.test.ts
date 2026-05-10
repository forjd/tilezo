import { describe, expect, spyOn, test } from "bun:test";
import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import {
  DrizzlePersistenceStore,
  loadOrSeedDefaultRoom,
  type PersistenceStore,
  persistJoinedUser,
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

  test("continues when user persistence fails", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const store = createStore();
    store.upsertUser = async () => {
      throw new Error("database unavailable");
    };

    await persistJoinedUser(store, { id: "user_1", username: "Dan" });

    expect(warn).toHaveBeenCalledWith(
      "User persistence unavailable; continuing without persisted user",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe("DrizzlePersistenceStore", () => {
  test("loads room layouts and upserts rooms and users", async () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 2, 2, { x: 0, y: 0 });
    const db = createDrizzleDouble(layout);
    const store = new DrizzlePersistenceStore(db.database);

    await expect(store.getRoom("lobby")).resolves.toBe(layout);
    await store.seedRoom(layout);
    await store.upsertUser({ id: "user_1", username: "Dan" });

    expect(db.selectedRooms).toBe(1);
    expect(db.insertedValues).toEqual([
      {
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        layout,
      },
      { id: "user_1", username: "Dan" },
    ]);
    expect(db.conflictUpdates).toHaveLength(2);
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

function createDrizzleDouble(layout: RoomLayout) {
  const calls = {
    selectedRooms: 0,
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
