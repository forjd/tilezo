import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@habbo/engine";
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
      },
    ]);
  });

  test("leave removes a user", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }));

    room.join({ id: "user_1", username: "Dan" });
    room.leave("user_1");

    expect(room.getUsers()).toEqual([]);
  });

  test("movement updates authoritative user position", () => {
    const room = new Room(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }));

    room.join({ id: "user_1", username: "Dan" });
    const path = room.moveUser("user_1", { x: 2, y: 0 });

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(room.getUsers()[0]?.position).toEqual({ x: 2, y: 0 });
  });
});
