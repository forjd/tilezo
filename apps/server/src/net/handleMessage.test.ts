import { describe, expect, test } from "bun:test";
import type { ServerMessage } from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import { RoomManager } from "../rooms/RoomManager";
import { handleClose, handleMessage } from "./handleMessage";
import type { SocketData } from "./socketTypes";

describe("handleMessage", () => {
  test("sends parser errors for invalid messages", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket();

    handleMessage(ws, "{", { rooms, publish() {} });

    expect(ws.sent[0]).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
  });

  test("leaves the previous room before joining a new room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });
    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "studio" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });

    expect(ws.unsubscribed).toEqual(["room:lobby"]);
    expect(rooms.get("lobby")).toBeUndefined();
    expect(rooms.get("studio")?.getUsers()).toEqual([
      { id: "user_db_1", username: "Dan", position: { x: 2, y: 2 } },
    ]);
    expect(published).toContainEqual({
      topic: "room:lobby",
      message: { type: "user.left", userId: "user_db_1" },
    });
  });

  test("rejects movement and chat before joining a room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket();

    handleMessage(ws, JSON.stringify({ type: "avatar.move.request", target: { x: 1, y: 1 } }), {
      rooms,
      publish() {},
    });
    handleMessage(ws, JSON.stringify({ type: "chat.say", text: "hello" }), {
      rooms,
      publish() {},
    });

    expect(ws.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before moving" },
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before chatting" },
    ]);
  });

  test("rejects room joins before socket authentication", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });

    expect(ws.sent).toEqual([
      { type: "error", code: "UNAUTHENTICATED", message: "Log in before joining a room" },
    ]);
  });

  test("publishes valid movement and rejects blocked targets", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "avatar.move.request", target: { x: 2, y: 1 } }), {
      rooms,
      publish(_topic, message) {
        published.push(message);
      },
    });
    handleMessage(ws, JSON.stringify({ type: "avatar.move.request", target: { x: 99, y: 99 } }), {
      rooms,
      publish() {},
    });

    expect(published[0]).toMatchObject({ type: "avatar.moved", userId: "user_db_1" });
    expect(ws.sent).toEqual([
      { type: "error", code: "INVALID_TILE", message: "Target tile is not walkable" },
    ]);
  });

  test("publishes chat and responds to ping", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;
    handleMessage(ws, JSON.stringify({ type: "chat.say", text: "hello" }), {
      rooms,
      publish(_topic, message) {
        published.push(message);
      },
    });
    handleMessage(ws, JSON.stringify({ type: "ping", sentAt: "2026-05-10T00:00:00.000Z" }), {
      rooms,
      publish() {},
    });

    expect(published[0]).toMatchObject({
      type: "chat.message",
      userId: "user_db_1",
      username: "Dan",
      text: "hello",
    });
    expect(ws.sent).toEqual([{ type: "pong", sentAt: "2026-05-10T00:00:00.000Z" }]);
  });
});

describe("handleClose", () => {
  test("removes joined users and publishes leave notifications", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    handleClose(ws, rooms, (topic, message) => published.push({ topic, message }));

    expect(ws.unsubscribed).toEqual(["room:lobby"]);
    expect(rooms.get("lobby")).toBeUndefined();
    expect(published).toEqual([
      { topic: "room:lobby", message: { type: "user.left", userId: "user_db_1" } },
    ]);
  });

  test("ignores sockets that never joined a room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket();
    const published: ServerMessage[] = [];

    handleClose(ws, rooms, (_topic, message) => published.push(message));

    expect(ws.unsubscribed).toEqual([]);
    expect(published).toEqual([]);
  });
});

function createSocket(data: SocketData = { userId: "user_1" }) {
  const sent: ServerMessage[] = [];
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];

  return {
    data,
    sent,
    subscribed,
    unsubscribed,
    send(message: string) {
      sent.push(JSON.parse(message) as ServerMessage);
    },
    subscribe(topic: string) {
      subscribed.push(topic);
    },
    unsubscribe(topic: string) {
      unsubscribed.push(topic);
    },
  } as unknown as ServerWebSocket<SocketData> & {
    sent: ServerMessage[];
    subscribed: string[];
    unsubscribed: string[];
  };
}
