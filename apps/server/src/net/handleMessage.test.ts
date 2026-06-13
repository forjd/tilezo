import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE, type ServerMessage } from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import { DirectMessageError, type DirectMessageService } from "../messaging/messaging";
import { RoomManager } from "../rooms/RoomManager";
import {
  consumeRateLimit,
  handleClose,
  handleMessage,
  handleOpen,
  RATE_LIMITS,
} from "./handleMessage";
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
      {
        id: "user_db_1",
        username: "Dan",
        position: { x: -1, y: 2 },
        appearance: DEFAULT_AVATAR_APPEARANCE,
      },
    ]);
    expect(published).toContainEqual({
      topic: "room:lobby",
      message: { type: "user.left", userId: "user_db_1" },
    });
  });

  test("lists public rooms with current membership state", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "studio" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "room.list.request" }), {
      rooms,
      publish() {},
    });
    await flushAsyncMessages();

    expect(ws.sent).toEqual([
      {
        type: "room.list",
        rooms: [
          { id: "lobby", name: "Lobby", userCount: 0, joined: false },
          { id: "atrium", name: "Atrium", userCount: 0, joined: false },
          { id: "studio", name: "Studio", userCount: 1, joined: true },
        ],
      },
    ]);
  });

  test("lists and joins the authenticated user's private room", async () => {
    const rooms = await RoomManager.create();
    rooms.addPrivateRoom(createTestLayout("home_user_db_1", "Dan's Room"), "user_db_1");
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.list.request" }), {
      rooms,
      publish() {},
    });
    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "home_user_db_1" }), {
      rooms,
      publish() {},
    });
    await flushAsyncMessages();

    expect(ws.sent[0]).toEqual({
      type: "room.list",
      rooms: [
        { id: "lobby", name: "Lobby", userCount: 0, joined: false },
        { id: "atrium", name: "Atrium", userCount: 0, joined: false },
        { id: "studio", name: "Studio", userCount: 0, joined: false },
        { id: "home_user_db_1", name: "Dan's Room", userCount: 0, joined: false },
      ],
    });
    expect(ws.sent[1]).toMatchObject({
      type: "room.snapshot",
      roomId: "home_user_db_1",
    });
  });

  test("lazily provisions the authenticated user's private room when listed", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const seededRoomIds: string[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.list.request" }), {
      rooms,
      publish() {},
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom(layout) {
          seededRoomIds.push(layout.id);
        },
      },
    });
    await flushAsyncMessages();

    expect(seededRoomIds).toEqual(["home_user_db_1"]);
    expect(ws.sent[0]?.type).toBe("room.list");
    expect(
      ws.sent[0]?.type === "room.list"
        ? ws.sent[0].rooms.some(
            (room) => room.id === "home_user_db_1" && room.name === "Dan's Room",
          )
        : false,
    ).toBe(true);
  });

  test("persists the last joined room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const saved: { userId: string; roomId: string }[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "studio" }), {
      rooms,
      publish() {},
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async saveLastRoomIdForUser(userId, roomId) {
          saved.push({ userId, roomId });
        },
      },
    });
    await Promise.resolve();

    expect(saved).toEqual([{ userId: "user_db_1", roomId: "studio" }]);
  });

  test("rejects private rooms owned by another user", async () => {
    const rooms = await RoomManager.create();
    rooms.addPrivateRoom(createTestLayout("home_user_db_2", "Kai's Room"), "user_db_2");
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "home_user_db_2" }), {
      rooms,
      publish() {},
    });

    expect(ws.sent).toEqual([
      { type: "error", code: "ROOM_NOT_FOUND", message: "Room is not available" },
    ]);
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
    handleMessage(ws, JSON.stringify({ type: "chat.typing", isTyping: true }), {
      rooms,
      publish() {},
    });

    expect(ws.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before moving" },
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before chatting" },
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before typing" },
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

  test("rejects unavailable public rooms without leaving the current room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "private-room" }), {
      rooms,
      publish() {},
    });

    expect(ws.data.roomId).toBe("lobby");
    expect(ws.unsubscribed).toEqual([]);
    expect(ws.sent).toEqual([
      { type: "error", code: "ROOM_NOT_FOUND", message: "Room is not available" },
    ]);
  });

  test("rejects knock-only public rooms without leaving the current room", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("room_knock", "Knock Room"), {
      access: "knock",
      ownerUserId: "user_db_2",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "room_knock" }), {
      rooms,
      publish() {},
    });

    expect(ws.data.roomId).toBe("lobby");
    expect(ws.unsubscribed).toEqual([]);
    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "ROOM_ACCESS_REQUIRED",
        message: "This room requires approval before joining",
      },
    ]);
  });

  test("allows owners to join their knock-only public rooms", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("room_knock", "Knock Room"), {
      access: "knock",
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "room_knock" }), {
      rooms,
      publish() {},
    });

    expect(ws.sent[0]).toMatchObject({
      type: "room.snapshot",
      roomId: "room_knock",
    });
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

  test("publishes typing status", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    handleMessage(ws, JSON.stringify({ type: "chat.typing", isTyping: true }), {
      rooms,
      publish(_topic, message) {
        published.push(message);
      },
    });

    expect(published).toEqual([
      {
        type: "chat.typing",
        userId: "user_db_1",
        username: "Dan",
        isTyping: true,
      },
    ]);
  });

  test("includes appearance in room snapshots and broadcasts updates", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      appearance: { ...DEFAULT_AVATAR_APPEARANCE, shirtColor: "#2f5f7f" },
    });
    const published: { topic: string; message: ServerMessage }[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });
    handleMessage(
      ws,
      JSON.stringify({
        type: "avatar.appearance.update",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "side-part", hairColor: "#8b4a24" },
      }),
      {
        rooms,
        publish(topic, message) {
          published.push({ topic, message });
        },
      },
    );

    expect(ws.sent[0]).toMatchObject({
      type: "room.snapshot",
      users: [
        {
          id: "user_db_1",
          appearance: { ...DEFAULT_AVATAR_APPEARANCE, shirtColor: "#2f5f7f" },
        },
      ],
    });
    expect(ws.data.appearance).toEqual({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part",
      hairColor: "#8b4a24",
    });
    expect(published).toContainEqual({
      topic: "room:lobby",
      message: {
        type: "avatar.appearance.updated",
        userId: "user_db_1",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          hair: "side-part",
          hairColor: "#8b4a24",
        },
      },
    });
  });

  test("does not update socket appearance before a room join", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });

    handleMessage(
      ws,
      JSON.stringify({
        type: "avatar.appearance.update",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" },
      }),
      {
        rooms,
        publish() {},
      },
    );

    expect(ws.data.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "Join a room before updating your character",
      },
    ]);
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

  test("does not remove a newer reconnect when a stale socket closes", async () => {
    const rooms = await RoomManager.create();
    const oldSocket = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_old",
    });
    const newSocket = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_new",
    });
    const published: ServerMessage[] = [];

    handleMessage(oldSocket, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    handleMessage(newSocket, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    handleClose(oldSocket, rooms, (_topic, message) => published.push(message));

    expect(rooms.get("lobby")?.getUsers()).toEqual([
      {
        id: "user_db_1",
        username: "Dan",
        position: { x: -1, y: 2 },
        appearance: DEFAULT_AVATAR_APPEARANCE,
      },
    ]);
    expect(published).toEqual([]);
  });
});

describe("handleOpen", () => {
  test("sends connected and resumes a valid persisted room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_1",
      resumeRoomId: "studio",
    });
    const published: { topic: string; message: ServerMessage }[] = [];
    const studioTiles = rooms.getOrCreate("studio")?.getSnapshot().tiles ?? [];

    handleOpen(ws, {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
    });
    await Promise.resolve();

    // The socket subscribes to its per-user DM topic on open, then resumes the room.
    expect(ws.subscribed).toEqual(["user:user_db_1", "room:studio"]);
    expect(ws.sent).toEqual([
      { type: "connected", userId: "user_db_1" },
      {
        type: "room.snapshot",
        roomId: "studio",
        users: [
          {
            id: "user_db_1",
            username: "Dan",
            position: { x: -1, y: 2 },
            appearance: DEFAULT_AVATAR_APPEARANCE,
          },
        ],
        tiles: studioTiles,
      },
      {
        type: "room.list",
        rooms: [
          { id: "lobby", name: "Lobby", userCount: 0, joined: false },
          { id: "atrium", name: "Atrium", userCount: 0, joined: false },
          { id: "studio", name: "Studio", userCount: 1, joined: true },
        ],
      },
    ]);
    expect(published).toContainEqual({
      topic: "room:studio",
      message: {
        type: "user.joined",
        user: {
          id: "user_db_1",
          username: "Dan",
          position: { x: -1, y: 2 },
          appearance: DEFAULT_AVATAR_APPEARANCE,
        },
      },
    });
  });
});

describe("duplicate connections and movement guards", () => {
  test("suppresses a duplicate user.joined when a newer socket reconnects the same user", async () => {
    const rooms = await RoomManager.create();
    const socketA = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_a",
    });
    const socketB = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_b",
    });
    const published: ServerMessage[] = [];
    const publish = (_topic: string, message: ServerMessage) => published.push(message);

    handleMessage(socketA, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish,
    });
    handleMessage(socketB, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish,
    });

    expect(published.filter((message) => message.type === "user.joined")).toHaveLength(1);
    expect(rooms.get("lobby")?.getConnectionId("user_db_1")).toBe("socket_b");
    expect(rooms.get("lobby")?.getUsers()).toHaveLength(1);
  });

  test("ignores movement from a socket superseded by a newer connection", async () => {
    const rooms = await RoomManager.create();
    const socketA = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_a",
    });
    const socketB = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_b",
    });

    handleMessage(socketA, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    handleMessage(socketB, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    socketA.sent.length = 0;

    handleMessage(
      socketA,
      JSON.stringify({ type: "avatar.move.request", target: { x: 2, y: 1 } }),
      {
        rooms,
        publish() {},
      },
    );

    expect(socketA.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before moving" },
    ]);
  });

  test("does not broadcast an empty path when moving to the current tile", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    const spawn = rooms.get("lobby")?.getUsers()[0]?.position;
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "avatar.move.request", target: spawn }), {
      rooms,
      publish(_topic, message) {
        published.push(message);
      },
    });

    expect(published).toEqual([]);
    expect(ws.sent).toEqual([]);
  });
});

describe("direct messages", () => {
  const sent = {
    id: "dm_1",
    fromUserId: "user_db_1",
    toUserId: "user_db_2",
    text: "hello",
    sentAt: "2026-06-13T00:00:00.000Z",
  };

  test("delivers a direct message to the recipient and sender topics", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];
    const directMessages = {
      async send(from: string, to: string, text: string) {
        return { ...sent, fromUserId: from, toUserId: to, text };
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.send", toUserId: "user_db_2", text: "hello" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
      directMessages,
    });
    await flushAsyncMessages();

    const message: ServerMessage = { type: "dm.message", ...sent };
    expect(published).toContainEqual({ topic: "user:user_db_2", message });
    expect(published).toContainEqual({ topic: "user:user_db_1", message });
  });

  test("surfaces a friendship rejection as an error", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async send() {
        throw new DirectMessageError("NOT_FRIENDS", "You can only message your friends");
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.send", toUserId: "user_db_2", text: "hi" }), {
      rooms,
      publish() {},
      directMessages,
    });
    await flushAsyncMessages();

    expect(ws.sent).toContainEqual({
      type: "error",
      code: "NOT_FRIENDS",
      message: "You can only message your friends",
    });
  });
});

describe("consumeRateLimit", () => {
  test("exhausts the burst then refills over time", () => {
    const ws = { data: {} } as unknown as ServerWebSocket<SocketData>;
    const { burst, refillPerSecond } = RATE_LIMITS.chat;
    let now = 1000;

    for (let index = 0; index < burst; index += 1) {
      expect(consumeRateLimit(ws, "chat", now)).toBe(true);
    }

    // Burst is exhausted at the same instant.
    expect(consumeRateLimit(ws, "chat", now)).toBe(false);

    // After enough elapsed time for one token to refill, a single message is allowed.
    now += Math.ceil(1000 / refillPerSecond);
    expect(consumeRateLimit(ws, "chat", now)).toBe(true);
    expect(consumeRateLimit(ws, "chat", now)).toBe(false);
  });

  test("tracks message kinds independently", () => {
    const ws = { data: {} } as unknown as ServerWebSocket<SocketData>;
    const now = 0;

    for (let index = 0; index < RATE_LIMITS.movement.burst; index += 1) {
      expect(consumeRateLimit(ws, "movement", now)).toBe(true);
    }

    expect(consumeRateLimit(ws, "movement", now)).toBe(false);
    // The chat bucket is independent and still full.
    expect(consumeRateLimit(ws, "chat", now)).toBe(true);
  });

  test("can share buckets across sockets for the same user", () => {
    const socketA = { data: { userId: "user_1" } } as unknown as ServerWebSocket<SocketData>;
    const socketB = { data: { userId: "user_1" } } as unknown as ServerWebSocket<SocketData>;
    const otherUser = { data: { userId: "user_2" } } as unknown as ServerWebSocket<SocketData>;
    const store = new Map();
    const now = 0;

    for (let index = 0; index < RATE_LIMITS.dm.burst; index += 1) {
      expect(consumeRateLimit(socketA, "dm", now, store)).toBe(true);
    }

    expect(consumeRateLimit(socketB, "dm", now, store)).toBe(false);
    expect(consumeRateLimit(otherUser, "dm", now, store)).toBe(true);
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

function createTestLayout(id: string, name: string) {
  return createRectRoomLayout(id, name, 3, 3, { x: 1, y: 1 });
}

async function flushAsyncMessages(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
