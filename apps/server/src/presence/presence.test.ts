import { describe, expect, test } from "bun:test";
import { PresenceTracker } from "./presence";

describe("PresenceTracker", () => {
  test("tracks online state and current room per connection", () => {
    const presence = new PresenceTracker();

    expect(presence.get("user_1")).toEqual({ online: false });

    presence.connect("user_1", "socket_1");
    expect(presence.get("user_1")).toEqual({ online: true });

    presence.joinRoom("user_1", "socket_1", "lobby");
    expect(presence.get("user_1")).toEqual({ online: true, roomId: "lobby" });

    presence.disconnect("user_1", "socket_1");
    expect(presence.get("user_1")).toEqual({ online: false });
  });

  test("keeps a user online while another connection remains open", () => {
    const presence = new PresenceTracker();

    presence.connect("user_1", "socket_1");
    presence.joinRoom("user_1", "socket_2", "studio");
    presence.disconnect("user_1", "socket_1");

    expect(presence.get("user_1")).toEqual({ online: true, roomId: "studio" });
  });

  test("moves a user to one room across connections", () => {
    const presence = new PresenceTracker();
    presence.joinRoom("user_1", "socket_1", "lobby");

    presence.moveUserToRoom("user_1", "socket_2", "studio");

    expect(presence.get("user_1")).toEqual({ online: true, roomId: "studio" });
  });
});
