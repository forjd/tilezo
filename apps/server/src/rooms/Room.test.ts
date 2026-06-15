import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { Room } from "./Room";

describe("Room", () => {
  test("join adds a user", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });

    expect(room.getUsers()).toEqual([
      {
        id: "user_1",
        username: "Dan",
        position: { x: 1, y: 1 },
        appearance: DEFAULT_AVATAR_APPEARANCE,
      },
    ]);
  });

  test("join chooses an unoccupied walkable spawn tile", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    const first = room.join({ id: "user_1", username: "Dan" });
    const second = room.join({ id: "user_2", username: "Lily" });

    expect(first.position).toEqual({ x: 1, y: 1 });
    expect(second.position).not.toEqual(first.position);
    expect(room.isWalkable(second.position)).toBe(true);
  });

  test("leave removes a user", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });
    room.leave("user_1");

    expect(room.getUsers()).toEqual([]);
  });

  test("leave only removes the user when the connection id matches", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));
    room.join({ id: "user_1", username: "Dan", connectionId: "socket_new" });

    // A stale socket closing with an older connection id must not evict the user.
    expect(room.leave("user_1", "socket_old")).toBe(false);
    expect(room.hasUser("user_1")).toBe(true);

    // The current connection (or an unguarded leave) does remove them.
    expect(room.leave("user_1", "socket_new")).toBe(true);
    expect(room.hasUser("user_1")).toBe(false);
  });

  test("reattach re-points an existing user at a new connection without resetting position", () => {
    let now = 1_000;
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }), () => now);
    room.join({ id: "user_1", username: "Dan", connectionId: "socket_old" });
    room.moveUser("user_1", { x: 2, y: 0 });
    now += 720;
    expect(room.getUsers()[0]?.position).toEqual({ x: 2, y: 0 });

    room.reattach({ id: "user_1", username: "Dan", connectionId: "socket_new" });

    expect(room.getConnectionId("user_1")).toBe("socket_new");
    // Position is preserved (not reset to spawn) and the new connection owns the avatar.
    expect(room.getUsers()[0]?.position).toEqual({ x: 2, y: 0 });
    // The stale connection can no longer evict the (now reattached) user.
    expect(room.leave("user_1", "socket_old")).toBe(false);
  });

  test("moveUser returns null for unknown users and unreachable targets", () => {
    const room = new Room(
      createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }, [{ x: 2, y: 2 }]),
    );

    expect(room.moveUser("ghost", { x: 1, y: 1 })).toBeNull();

    room.join({ id: "user_1", username: "Dan" });
    expect(room.moveUser("user_1", { x: 99, y: 99 })).toBeNull();
    expect(room.moveUser("user_1", { x: 2, y: 2 })).toBeNull();
  });

  test("placed blocking furniture is included in snapshots and blocks movement", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }));

    room.join({ id: "user_1", username: "Dan" });
    const item = room.placeItem({
      id: "item_1",
      itemType: "crate_table",
      x: 2,
      y: 0,
      z: 0,
      rotation: 0,
      state: {},
    });

    expect(item).toMatchObject({ id: "item_1", itemType: "crate_table", x: 2, y: 0 });
    if (!item) {
      throw new Error("expected furniture item to be placed");
    }

    expect(room.getSnapshot().items).toEqual([item]);
    expect(room.moveUser("user_1", { x: 2, y: 0 })).toBeNull();
  });

  test("rejects invalid furniture placement over users and allows pickup", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });

    expect(
      room.placeItem({
        id: "item_1",
        itemType: "crate_table",
        x: 1,
        y: 1,
        z: 0,
        rotation: 0,
        state: {},
      }),
    ).toBeUndefined();

    const item = room.placeItem({
      id: "item_2",
      itemType: "woven_rug",
      x: 1,
      y: 1,
      z: 0,
      rotation: 0,
      state: {},
    });

    expect(item).toBeDefined();
    expect(room.pickupItem("item_2")).toEqual(item);
    expect(room.getSnapshot().items).toEqual([]);
  });

  test("movement rejects occupied avatar destinations", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }));

    room.join({ id: "user_1", username: "Dan" });
    const second = room.join({ id: "user_2", username: "Lily" });

    expect(room.moveUser("user_1", second.position)).toBeNull();
  });

  test("movement rejects destinations reserved by another active movement", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }));

    room.join({ id: "user_1", username: "Dan" });
    room.join({ id: "user_2", username: "Lily" });
    expect(room.moveUser("user_2", { x: 3, y: 0 })).toBeDefined();

    expect(room.moveUser("user_1", { x: 3, y: 0 })).toBeNull();
  });

  test("movement updates authoritative user position after the path completes", () => {
    let now = 1_000;
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }), () => now);

    room.join({ id: "user_1", username: "Dan" });
    const path = room.moveUser("user_1", { x: 2, y: 0 });

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    now += 720;
    expect(room.getUsers()[0]?.position).toEqual({ x: 2, y: 0 });
  });

  test("movement reroutes from the current tile before a previous move completes", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }));

    room.join({ id: "user_1", username: "Dan" });
    room.moveUser("user_1", { x: 2, y: 0 });

    expect(room.moveUser("user_1", { x: 2, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  test("movement reroutes from the last reached tile during a previous move", () => {
    let now = 1_000;
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }), () => now);

    room.join({ id: "user_1", username: "Dan" });
    room.moveUser("user_1", { x: 3, y: 0 });
    now += 360;

    expect(room.moveUser("user_1", { x: 2, y: 1 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  test("repeated movement to the same target does not restart progress", () => {
    let now = 1_000;
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }), () => now);

    room.join({ id: "user_1", username: "Dan" });
    room.moveUser("user_1", { x: 3, y: 0 });
    now += 360;

    expect(room.moveUser("user_1", { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);

    expect(room.getUsers()[0]?.position).toEqual({ x: 1, y: 0 });
  });

  test("snapshots include remaining movement for users mid-walk", () => {
    let now = 1_000;
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }), () => now);

    room.join({ id: "user_1", username: "Dan" });
    room.moveUser("user_1", { x: 3, y: 0 });
    now += 360;

    expect(room.getUsers()[0]).toMatchObject({
      id: "user_1",
      position: { x: 1, y: 0 },
      movementPath: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
    });
  });

  test("clones, sorts, moves, and updates furniture without leaking mutable state", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 0, y: 0 }));

    expect(room.getItem("missing")).toBeUndefined();
    expect(room.moveItem("missing", { x: 1, y: 1, rotation: 0 })).toBeUndefined();
    expect(room.updateItemState("missing", { on: true })).toBeUndefined();

    const later = room.placeItem({
      id: "item_z",
      itemType: "woven_rug",
      x: 2,
      y: 2,
      z: 0,
      rotation: 0,
      state: { color: "red" },
    });
    const earlier = room.placeItem({
      id: "item_a",
      itemType: "woven_rug",
      x: 1,
      y: 0,
      z: 0,
      rotation: 0,
      state: { color: "blue" },
    });

    expect(room.getItems().map((item) => item.id)).toEqual(["item_a", "item_z"]);
    if (!earlier || !later) {
      throw new Error("expected rugs to be placed");
    }

    const externalCopy = room.getItem("item_a");
    if (externalCopy) {
      externalCopy.state.color = "mutated";
    }
    expect(room.getItem("item_a")?.state).toEqual({ color: "blue" });

    expect(room.canPlaceItem({ ...earlier, x: 2, y: 2 })).toBe(false);
    expect(room.validateItemMove("item_a", { ...earlier, x: 2, y: 2 })).toEqual({ ok: false });
    expect(room.moveItem("item_a", { x: 0, y: 2, rotation: 0 })).toMatchObject({
      id: "item_a",
      x: 0,
      y: 2,
    });
    expect(room.updateItemState("item_a", { on: true })?.state).toEqual({ on: true });
  });

  test("rejects furniture with invalid definitions, rotations, heights, spawn, and occupied user tiles", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 4, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });

    expect(
      room.canPlaceItem({
        id: "unknown",
        itemType: "missing_furniture",
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        state: {},
      }),
    ).toBe(false);
    expect(
      room.canPlaceItem({
        id: "bad_rotation",
        itemType: "glass_lamp",
        x: 0,
        y: 0,
        z: 0,
        rotation: 2,
        state: {},
      }),
    ).toBe(false);
    expect(
      room.canPlaceItem({
        id: "bad_height",
        itemType: "crate_table",
        x: 0,
        y: 0,
        z: 1,
        rotation: 0,
        state: {},
      }),
    ).toBe(false);
    expect(
      room.canPlaceItem({
        id: "spawn_blocker",
        itemType: "crate_table",
        x: 1,
        y: 1,
        z: 0,
        rotation: 0,
        state: {},
      }),
    ).toBe(false);
    expect(
      room.canPlaceItem({
        id: "rug_on_user",
        itemType: "woven_rug",
        x: 1,
        y: 1,
        z: 0,
        rotation: 0,
        state: {},
      }),
    ).toBe(true);
  });
});
