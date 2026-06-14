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
    const privateRoom = createRectRoomLayout("home_user_1", "Dan's Room", 3, 3, { x: 1, y: 1 });
    const store = {
      seededRooms: [] as RoomLayout[],
      async getRoom(roomId: string) {
        return roomId === "lobby" ? storedLobby : undefined;
      },
      async seedRoom(layout: RoomLayout) {
        this.seededRooms.push(layout);
      },
      async listRooms() {
        return [
          {
            layout: storedLobby,
            visibility: "public" as const,
            description: "",
            capacity: 25,
            access: "open" as const,
          },
          {
            layout: studio,
            visibility: "public" as const,
            description: "",
            capacity: 25,
            access: "open" as const,
          },
          {
            layout: privateRoom,
            ownerUserId: "user_1",
            visibility: "private" as const,
            description: "Personal space",
            capacity: 10,
            access: "knock" as const,
          },
        ];
      },
    } satisfies PersistenceStore & { seededRooms: RoomLayout[] };

    await expect(loadOrSeedPublicRooms(store, [lobby, studio])).resolves.toEqual({
      publicLayouts: [storedLobby, studio],
      privateLayouts: [{ layout: privateRoom, ownerUserId: "user_1", access: "knock" }],
      roomRules: [
        { roomId: "lobby", ownerUserId: undefined, access: "open" },
        { roomId: "studio", ownerUserId: undefined, access: "open" },
        { roomId: "home_user_1", ownerUserId: "user_1", access: "knock" },
      ],
    });
    expect(store.seededRooms).toEqual([studio]);
  });

  test("falls back to listPublicRooms when the store has no room directory", async () => {
    const lobby = createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 });
    const storedLobby = createRectRoomLayout("lobby", "Stored Lobby", 2, 2, { x: 0, y: 0 });
    const store = {
      async getRoom() {
        return storedLobby;
      },
      async seedRoom() {},
      async listPublicRooms() {
        return [storedLobby];
      },
    } satisfies PersistenceStore;

    await expect(loadOrSeedPublicRooms(store, [lobby])).resolves.toEqual({
      publicLayouts: [storedLobby],
      privateLayouts: [],
      roomRules: [],
    });
  });
});

describe("DrizzlePersistenceStore", () => {
  test("loads room layouts and upserts rooms", async () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 2, 2, { x: 0, y: 0 });
    const db = createDrizzleDouble(layout);
    const store = new DrizzlePersistenceStore(db.database);

    await expect(store.getRoom("lobby")).resolves.toBe(layout);
    await store.seedRoom(layout);
    await expect(store.listRooms()).resolves.toEqual([
      {
        layout,
        ownerUserId: undefined,
        visibility: "public",
        description: "",
        capacity: 25,
        access: "open",
      },
    ]);
    await expect(store.listPublicRooms()).resolves.toEqual([layout]);
    await expect(store.listOwnedRooms("user_1")).resolves.toEqual([
      { layout, ownerUserId: "user_1" },
    ]);

    expect(db.selectedRooms).toBe(3);
    expect(db.listedRooms).toBe(3);
    expect(db.insertedValues).toEqual([
      {
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        description: "",
        ownerUserId: null,
        visibility: "public",
        access: "open",
        capacity: 25,
        layout,
      },
    ]);
    expect(db.conflictUpdates).toHaveLength(1);
  });

  test("persists last joined room sessions", async () => {
    const store = new DrizzlePersistenceStore(queryDouble([[{ roomId: "lobby" }], [], []]));

    await expect(store.getLastRoomIdForUser("user_1")).resolves.toBe("lobby");
    await expect(store.saveLastRoomIdForUser("user_1", "studio")).resolves.toBeUndefined();
    await expect(store.clearLastRoomIdForUser("user_1")).resolves.toBeUndefined();
  });

  test("persists room furniture items", async () => {
    const item = {
      id: "item_1",
      itemType: "crate_table",
      x: 2,
      y: 1,
      z: 0,
      rotation: 0,
      state: {},
    };
    const store = new DrizzlePersistenceStore(queryDouble([[item], [], []]));

    await expect(store.listRoomItems("room_1")).resolves.toEqual([item]);
    await expect(store.saveRoomItem("room_1", item)).resolves.toBeUndefined();
    await expect(store.deleteRoomItem("item_1")).resolves.toBeUndefined();
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
                return {
                  orderBy() {
                    calls.listedRooms += 1;
                    return Promise.resolve([{ layout }]);
                  },
                  // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
                  then(resolve: (value: { layout: RoomLayout }[]) => void) {
                    calls.selectedRooms += 0;
                    return Promise.resolve([{ layout }]).then(resolve);
                  },
                };
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

function queryDouble(
  results: unknown[][] = [],
  // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Drizzle database.
): any {
  let index = 0;
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(results[index++] ?? []).then(resolve, reject);
    },
  };

  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "insert",
    "values",
    "onConflictDoUpdate",
    "delete",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
