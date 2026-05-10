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

  test("leave removes a user", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });
    room.leave("user_1");

    expect(room.getUsers()).toEqual([]);
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
});
