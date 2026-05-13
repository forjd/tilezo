import { describe, expect, test } from "bun:test";
import type { RoomLayout } from "@tilezo/engine";
import type { PersistenceStore } from "../db/persistence";
import { Metrics } from "../observability/metrics";
import { ensurePersonalRoom, personalRoomId } from "./personalRoom";
import { RoomManager } from "./RoomManager";

describe("ensurePersonalRoom", () => {
  test("creates and indexes a user's private room on demand", async () => {
    const rooms = new RoomManager([]);
    const store = createPersistenceStore();
    const metrics = new Metrics();

    await ensurePersonalRoom(
      { id: "user_1", username: "Dan" },
      { metrics, persistence: store, rooms },
    );

    expect(store.seededRoomIds).toEqual([personalRoomId("user_1")]);
    expect(rooms.hasAccessibleLayout(personalRoomId("user_1"), "user_1")).toBe(true);
    expect(rooms.hasAccessibleLayout(personalRoomId("user_1"), "user_2")).toBe(false);
    expect(
      metrics.snapshot({ activeRooms: 0, rooms: [], layouts: { public: 0, private: 1 } }).counters,
    ).toMatchObject({ "room.private.provisioned": 1 });
  });

  test("does not reseed an already indexed private room", async () => {
    const rooms = new RoomManager([]);
    const store = createPersistenceStore();

    await ensurePersonalRoom({ id: "user_1", username: "Dan" }, { persistence: store, rooms });
    await ensurePersonalRoom({ id: "user_1", username: "Dan" }, { persistence: store, rooms });

    expect(store.seededRoomIds).toEqual([personalRoomId("user_1")]);
  });
});

function createPersistenceStore() {
  return {
    seededRoomIds: [] as string[],
    async getRoom() {
      return undefined;
    },
    async seedRoom(layout: RoomLayout) {
      this.seededRoomIds.push(layout.id);
    },
  } satisfies PersistenceStore & { seededRoomIds: string[] };
}
