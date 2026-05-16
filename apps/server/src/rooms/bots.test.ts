import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE, type ServerMessage } from "@tilezo/protocol";
import { RoomBotController, type RoomBotDefinition } from "./bots";
import { RoomManager } from "./RoomManager";

const testBot = {
  id: "bot:test-guide",
  username: "Test Guide",
  roomIds: ["lobby"],
  appearance: { ...DEFAULT_AVATAR_APPEARANCE, shirtColor: "#2f6f5f" },
  lines: ["hello from the room loop"],
} satisfies RoomBotDefinition;

describe("room bots", () => {
  test("seeds configured bots into newly created rooms", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }), {
      bots: [testBot],
    });

    const room = manager.getOrCreate("lobby");

    expect(room?.getUsers()).toEqual([
      {
        id: "bot:test-guide",
        username: "Test Guide",
        position: { x: 1, y: 1 },
        appearance: testBot.appearance,
      },
    ]);
  });

  test("removes active rooms when only configured bots remain", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }), {
      bots: [testBot],
    });
    const room = manager.getOrCreate("lobby");

    room?.join({ id: "user_1", username: "Dan" });
    room?.leave("user_1");
    manager.removeIfEmpty("lobby");

    expect(manager.get("lobby")).toBeUndefined();
  });

  test("publishes scripted bot chat through the room topic", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 1, y: 1 }), {
      bots: [testBot],
    });
    manager.getOrCreate("lobby");
    const published: { topic: string; message: ServerMessage }[] = [];
    const controller = new RoomBotController({
      rooms: manager,
      bots: [testBot],
      now: () => 1_000,
      random: () => 0,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });

    controller.tick();

    expect(published).toEqual([
      {
        topic: "room:lobby",
        message: {
          type: "chat.message",
          userId: "bot:test-guide",
          username: "Test Guide",
          text: "hello from the room loop",
          sentAt: "1970-01-01T00:00:01.000Z",
        },
      },
    ]);
  });

  test("publishes scripted bot movement through the room topic", () => {
    const manager = new RoomManager(createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }), {
      bots: [testBot],
    });
    manager.getOrCreate("lobby");
    const published: { topic: string; message: ServerMessage }[] = [];
    const randomValues = [0, 0.9, 0.9];
    const controller = new RoomBotController({
      rooms: manager,
      bots: [testBot],
      now: () => 1_000,
      random: () => randomValues.shift() ?? 0.9,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });

    controller.tick();

    expect(published).toEqual([
      {
        topic: "room:lobby",
        message: {
          type: "avatar.moved",
          userId: "bot:test-guide",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      },
    ]);
  });
});
