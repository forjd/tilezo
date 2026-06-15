import { describe, expect, test } from "bun:test";
import { createRectRoomLayout } from "@tilezo/engine";
import {
  type AvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
  type RoomItem,
  type ServerMessage,
} from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import type { PersistenceStore } from "../db/persistence";
import type { EconomyStore } from "../economy/economy";
import { DirectMessageError, type DirectMessageService } from "../messaging/messaging";
import type { Logger } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
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

  test("skips personal room provisioning when the socket has no username", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1" });
    let seeded = false;

    handleMessage(ws, JSON.stringify({ type: "room.list.request" }), {
      rooms,
      publish() {},
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {
          seeded = true;
        },
      },
    });
    await flushAsyncMessages();

    expect(seeded).toBe(false);
    expect(ws.sent[0]?.type).toBe("room.list");
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
    const metrics = createMetricsDouble();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "private-room" }), {
      rooms,
      publish() {},
      metrics,
    });

    expect(ws.data.roomId).toBe("lobby");
    expect(ws.unsubscribed).toEqual([]);
    expect(ws.sent).toEqual([
      { type: "error", code: "ROOM_NOT_FOUND", message: "Room is not available" },
    ]);
    expect(metrics.seenCounters).toContain("room.join.unavailable");
  });

  test("rejects rooms that disappear between access check and join", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("unstable", "Unstable"));
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const cleared: string[] = [];
    const originalGetOrCreate = rooms.getOrCreate.bind(rooms);
    rooms.getOrCreate = ((roomId: string, userId?: string) =>
      roomId === "unstable"
        ? undefined
        : originalGetOrCreate(roomId, userId)) as typeof rooms.getOrCreate;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "unstable" }), {
      rooms,
      publish() {},
      logger: createLoggerDouble(),
      metrics: createMetricsDouble(),
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async clearLastRoomIdForUser(userId: string) {
          cleared.push(userId);
        },
      } as unknown as PersistenceStore,
    });
    await flushAsyncMessages();

    expect(ws.sent).toEqual([
      { type: "error", code: "ROOM_NOT_FOUND", message: "Room is not available" },
    ]);
    expect(cleared).toEqual(["user_db_1"]);
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

  test("lets room owners place persisted furniture that blocks movement", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];
    const saved: Array<{ roomId: string; item: RoomItem }> = [];
    const economy = createEconomyStore();
    await economy.refundItem(ws.data.userId, "crate_table");

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    expect(ws.sent[0]).toMatchObject({ type: "room.snapshot", canEditItems: true });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
      {
        rooms,
        economy,
        publish(_topic, message) {
          published.push(message);
        },
        persistence: {
          async getRoom() {
            return undefined;
          },
          async seedRoom() {},
          async saveRoomItem(roomId, item) {
            saved.push({ roomId, item });
          },
        },
      },
    );
    await flushAsyncMessages();

    const item = saved[0]?.item;
    if (!item) {
      throw new Error("expected furniture item to be saved");
    }

    expect(saved[0]?.roomId).toBe("owned_room");
    expect(item).toMatchObject({ itemType: "crate_table", x: 2, y: 1, z: 0, rotation: 0 });
    expect(published).toContainEqual({ type: "room.item.placed", item });

    handleMessage(ws, JSON.stringify({ type: "avatar.move.request", target: { x: 2, y: 1 } }), {
      rooms,
      publish() {},
    });

    expect(ws.sent).toEqual([
      { type: "error", code: "INVALID_TILE", message: "Target tile is not walkable" },
    ]);
  });

  test("rejects placement when the inventory item is not owned", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const economy = createEconomyStore();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    expect(ws.sent[0]).toMatchObject({ type: "room.snapshot", canEditItems: true });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
      {
        rooms,
        economy,
        publish() {},
      },
    );
    await flushAsyncMessages();

    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "INSUFFICIENT_INVENTORY",
        message: "You do not have that item in your inventory",
      },
    ]);
  });

  test("refunds inventory when the owner picks up a placed item", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const economy = createEconomyStore();
    await economy.refundItem(ws.data.userId, "crate_table");
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
      {
        rooms,
        economy,
        publish(_topic, message) {
          published.push(message);
        },
        persistence: {
          async getRoom() {
            return undefined;
          },
          async seedRoom() {},
          async saveRoomItem() {},
        },
      },
    );
    await flushAsyncMessages();

    const placedItem = published.find((message) => message.type === "room.item.placed")?.item;
    expect(placedItem).toBeDefined();
    expect(await economy.getInventory(ws.data.userId)).toEqual([]);

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.pickup.request",
        itemId: placedItem?.id ?? "",
      }),
      {
        rooms,
        economy,
        publish(_topic, message) {
          published.push(message);
        },
        persistence: {
          async getRoom() {
            return undefined;
          },
          async seedRoom() {},
          async deleteRoomItem() {},
        },
      },
    );
    await flushAsyncMessages();

    expect(published.some((message) => message.type === "room.item.picked_up")).toBe(true);
    expect(await economy.getInventory(ws.data.userId)).toEqual([
      { itemType: "crate_table", quantity: 1 },
    ]);
  });

  test("rejects furniture edits from non-owners", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_2",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
      {
        rooms,
        publish() {},
      },
    );

    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "ROOM_EDIT_FORBIDDEN",
        message: "Only the room owner can edit furniture",
      },
    ]);
  });

  test("covers furniture edit and interaction rejection/rollback paths", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const notJoined = createSocket({ userId: "user_db_1", username: "Dan" });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const economy = createEconomyStore();
    const metrics = createMetricsDouble();
    await economy.refundItem(ws.data.userId, "crate_table");
    await economy.refundItem(ws.data.userId, "crate_table");

    handleMessage(
      notJoined,
      JSON.stringify({
        type: "room.item.move.request",
        itemId: "item_1",
        position: { x: 1, y: 1 },
        rotation: 0,
      }),
      { rooms, publish() {}, metrics },
    );
    handleMessage(
      notJoined,
      JSON.stringify({ type: "room.item.interact.request", itemId: "item_1", action: "toggle" }),
      { rooms, publish() {}, metrics },
    );

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "missing_furniture",
        position: { x: 1, y: 1 },
        rotation: 0,
      }),
      { rooms, economy, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 99, y: 99 },
        rotation: 0,
      }),
      { rooms, economy, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
      {
        rooms,
        economy,
        publish() {},
        logger: createLoggerDouble(),
        metrics,
        persistence: failingFurniturePersistence("save"),
      },
    );
    await flushAsyncMessages();

    const room = rooms.get("owned_room");
    expect(room?.getItems()).toEqual([]);
    expect(await economy.getInventory(ws.data.userId)).toEqual([
      { itemType: "crate_table", quantity: 2 },
    ]);

    room?.placeItem({
      id: "item_1",
      itemType: "crate_table",
      x: 2,
      y: 1,
      z: 0,
      rotation: 0,
      state: {},
    });
    room?.placeItem({
      id: "lamp_1",
      itemType: "glass_lamp",
      x: 0,
      y: 1,
      z: 0,
      rotation: 0,
      state: { on: false },
    });

    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.move.request",
        itemId: "missing",
        position: { x: 1, y: 1 },
        rotation: 0,
      }),
      { rooms, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.move.request",
        itemId: "item_1",
        position: { x: 99, y: 99 },
        rotation: 0,
      }),
      { rooms, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.move.request",
        itemId: "item_1",
        position: { x: 0, y: 0 },
        rotation: 0,
      }),
      {
        rooms,
        publish() {},
        logger: createLoggerDouble(),
        metrics,
        persistence: failingFurniturePersistence("save"),
      },
    );
    await flushAsyncMessages();
    handleMessage(ws, JSON.stringify({ type: "room.item.pickup.request", itemId: "missing" }), {
      rooms,
      publish() {},
      metrics,
    });
    handleMessage(ws, JSON.stringify({ type: "room.item.pickup.request", itemId: "item_1" }), {
      rooms,
      publish() {},
      logger: createLoggerDouble(),
      metrics,
      persistence: failingFurniturePersistence("delete"),
    });
    await flushAsyncMessages();
    handleMessage(
      ws,
      JSON.stringify({ type: "room.item.interact.request", itemId: "missing", action: "toggle" }),
      { rooms, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({ type: "room.item.interact.request", itemId: "item_1", action: "toggle" }),
      { rooms, publish() {}, metrics },
    );
    handleMessage(
      ws,
      JSON.stringify({ type: "room.item.interact.request", itemId: "lamp_1", action: "toggle" }),
      {
        rooms,
        publish() {},
        logger: createLoggerDouble(),
        metrics,
        persistence: failingFurniturePersistence("save"),
      },
    );
    await flushAsyncMessages();
    expect(room?.getItem("lamp_1")?.state).toEqual({ on: false });

    expect(notJoined.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before editing furniture" },
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before using furniture" },
    ]);
    expect(
      ws.sent.map((message) => (message.type === "error" ? message.code : message.type)),
    ).toEqual([
      "UNKNOWN_ITEM_TYPE",
      "INVALID_ITEM_PLACEMENT",
      "FURNITURE_PERSISTENCE_FAILED",
      "ITEM_NOT_FOUND",
      "INVALID_ITEM_PLACEMENT",
      "FURNITURE_PERSISTENCE_FAILED",
      "ITEM_NOT_FOUND",
      "FURNITURE_PERSISTENCE_FAILED",
      "ITEM_NOT_FOUND",
      "UNSUPPORTED_ITEM_ACTION",
      "FURNITURE_PERSISTENCE_FAILED",
    ]);
    expect(room?.getItem("item_1")).toBeDefined();
    expect(room?.getItem("lamp_1")?.state).toEqual({ on: false });
    expect(metrics.seenCounters).toEqual(
      expect.arrayContaining([
        "room_item.edit.rejected.not_in_room",
        "room_item.interact.rejected.not_in_room",
        "room_item.place.rejected.unknown_type",
        "room_item.place.rejected.invalid_placement",
        "room_item.move.rejected.not_found",
        "room_item.move.rejected.invalid_placement",
        "room_item.pickup.rejected.not_found",
        "room_item.interact.rejected.not_found",
        "room_item.interact.rejected.unsupported",
        "room_item.persistence.save_failed",
        "room_item.persistence.delete_failed",
      ]),
    );
  });

  test("publishes furniture move and toggle updates", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("owned_room", "Owned Room"), {
      ownerUserId: "user_db_1",
      visibility: "public",
    });
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const metrics = createMetricsDouble();
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "owned_room" }), {
      rooms,
      publish() {},
    });
    rooms.get("owned_room")?.placeItem({
      id: "item_1",
      itemType: "crate_table",
      x: 2,
      y: 1,
      z: 0,
      rotation: 0,
      state: {},
    });
    rooms.get("owned_room")?.placeItem({
      id: "lamp_1",
      itemType: "glass_lamp",
      x: 0,
      y: 1,
      z: 0,
      rotation: 0,
      state: { on: false },
    });
    ws.sent.length = 0;

    const context = {
      rooms,
      publish(_topic: string, message: ServerMessage) {
        published.push(message);
      },
      metrics,
      persistence: workingFurniturePersistence(),
    };
    handleMessage(
      ws,
      JSON.stringify({
        type: "room.item.move.request",
        itemId: "item_1",
        position: { x: 1, y: 0 },
        rotation: 0,
      }),
      context,
    );
    handleMessage(
      ws,
      JSON.stringify({ type: "room.item.interact.request", itemId: "lamp_1", action: "toggle" }),
      context,
    );
    await flushAsyncMessages();

    expect(ws.sent).toEqual([]);
    expect(published).toEqual([
      {
        type: "room.item.moved",
        item: { id: "item_1", itemType: "crate_table", x: 1, y: 0, z: 0, rotation: 0, state: {} },
      },
      {
        type: "room.item.state_updated",
        item: {
          id: "lamp_1",
          itemType: "glass_lamp",
          x: 0,
          y: 1,
          z: 0,
          rotation: 0,
          state: { on: true },
        },
      },
    ]);
    expect(metrics.seenCounters).toEqual(
      expect.arrayContaining(["room_item.move.accepted", "room_item.interact.accepted"]),
    );
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

  test("does not republish unchanged chat typing states", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });

    for (let index = 0; index < 2; index += 1) {
      handleMessage(ws, JSON.stringify({ type: "chat.typing", isTyping: true }), {
        rooms,
        publish(_topic, message) {
          published.push(message);
        },
      });
    }

    expect(published).toHaveLength(1);
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
    await flushAsyncMessages();

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
    await flushAsyncMessages();

    expect(ws.data.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "Join a room before updating your character",
      },
    ]);
  });

  test("rejects appearance updates when the authoritative room refuses them", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    const room = rooms.get("lobby") as unknown as {
      updateAppearance: () => boolean;
    };
    room.updateAppearance = () => false;

    handleMessage(
      ws,
      JSON.stringify({
        type: "avatar.appearance.update",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" },
      }),
      {
        rooms,
        publish() {},
        logger: createLoggerDouble(),
        metrics: createMetricsDouble(),
      },
    );
    await flushAsyncMessages();

    expect(ws.data.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "Join a room before updating your character",
      },
    ]);
  });

  test("persists the appearance over the socket path before broadcasting", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });
    const saved: { userId: string; appearance: AvatarAppearance }[] = [];
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });

    const nextAppearance: AvatarAppearance = { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" };
    handleMessage(
      ws,
      JSON.stringify({ type: "avatar.appearance.update", appearance: nextAppearance }),
      {
        rooms,
        publish(_topic, message) {
          published.push(message);
        },
        auth: {
          async updateAppearance(userId, appearance) {
            saved.push({ userId, appearance });
            return { id: userId, username: "Dan", appearance, dollars: 0 };
          },
        },
      },
    );
    await flushAsyncMessages();

    expect(saved).toEqual([{ userId: "user_db_1", appearance: nextAppearance }]);
    expect(ws.data.appearance).toEqual(nextAppearance);
    expect(published).toContainEqual({
      type: "avatar.appearance.updated",
      userId: "user_db_1",
      appearance: nextAppearance,
    });
  });

  test("does not broadcast or mirror the appearance when persistence fails", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });
    const published: ServerMessage[] = [];

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(
      ws,
      JSON.stringify({
        type: "avatar.appearance.update",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" },
      }),
      {
        rooms,
        publish(_topic, message) {
          published.push(message);
        },
        logger: createLoggerDouble(),
        metrics: createMetricsDouble(),
        auth: {
          async updateAppearance() {
            throw new Error("db down");
          },
        },
      },
    );
    await flushAsyncMessages();

    expect(ws.data.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
    expect(published).toEqual([]);
    expect(ws.sent).toEqual([
      {
        type: "error",
        code: "APPEARANCE_PERSISTENCE_FAILED",
        message: "Could not save your character",
      },
    ]);
  });

  test("does not broadcast an appearance update when the socket is superseded during the persist await", async () => {
    const rooms = await RoomManager.create();
    const socketA = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_a",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });
    const socketB = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_b",
    });
    const published: ServerMessage[] = [];
    const context = {
      rooms,
      publish(_topic: string, message: ServerMessage) {
        published.push(message);
      },
      logger: createLoggerDouble(),
      metrics: createMetricsDouble(),
    };

    handleMessage(socketA, JSON.stringify({ type: "room.join", roomId: "lobby" }), context);
    socketA.sent.length = 0;
    published.length = 0;

    handleMessage(
      socketA,
      JSON.stringify({
        type: "avatar.appearance.update",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" },
      }),
      {
        ...context,
        auth: {
          async updateAppearance(userId, appearance) {
            // A newer connection for the same user takes over the room mid-write.
            handleMessage(socketB, JSON.stringify({ type: "room.join", roomId: "lobby" }), context);
            return { id: userId, username: "Dan", appearance, dollars: 0 };
          },
        },
      },
    );
    await flushAsyncMessages();

    // The persist still stood, but the now-superseded socket must not drive a broadcast or
    // mirror its own (stale) socket state.
    expect(published).not.toContainEqual(
      expect.objectContaining({ type: "avatar.appearance.updated", userId: "user_db_1" }),
    );
    expect(socketA.sent).toContainEqual({
      type: "error",
      code: "NOT_IN_ROOM",
      message: "Join a room before updating your character",
    });
    expect(socketA.data.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
  });

  test("rate limits each websocket message kind before doing work", async () => {
    const cases: Array<{
      kind: keyof typeof RATE_LIMITS;
      message: Record<string, unknown>;
      counter: string;
      errorMessage?: string;
    }> = [
      {
        kind: "default",
        message: { type: "room.list.request" },
        counter: "rate_limited.room_list",
        errorMessage: "Slow down before refreshing rooms again",
      },
      {
        kind: "default",
        message: { type: "room.join", roomId: "lobby" },
        counter: "rate_limited.room_join",
        errorMessage: "Slow down before changing rooms again",
      },
      {
        kind: "movement",
        message: { type: "avatar.move.request", target: { x: 1, y: 1 } },
        counter: "rate_limited.movement",
        errorMessage: "Slow down before moving again",
      },
      {
        kind: "default",
        message: { type: "avatar.appearance.update", appearance: DEFAULT_AVATAR_APPEARANCE },
        counter: "rate_limited.appearance",
        errorMessage: "Slow down before updating your character again",
      },
      {
        kind: "default",
        message: {
          type: "room.item.place.request",
          itemType: "crate_table",
          position: { x: 1, y: 1 },
          rotation: 0,
        },
        counter: "rate_limited.room_item_place",
        errorMessage: "Slow down before editing furniture again",
      },
      {
        kind: "default",
        message: {
          type: "room.item.move.request",
          itemId: "item_1",
          position: { x: 1, y: 1 },
          rotation: 0,
        },
        counter: "rate_limited.room_item_move",
        errorMessage: "Slow down before editing furniture again",
      },
      {
        kind: "default",
        message: { type: "room.item.pickup.request", itemId: "item_1" },
        counter: "rate_limited.room_item_pickup",
        errorMessage: "Slow down before editing furniture again",
      },
      {
        kind: "default",
        message: { type: "room.item.interact.request", itemId: "item_1", action: "toggle" },
        counter: "rate_limited.room_item_interact",
        errorMessage: "Slow down before using furniture again",
      },
      {
        kind: "chat",
        message: { type: "chat.say", text: "hello" },
        counter: "rate_limited.chat",
        errorMessage: "Slow down before chatting again",
      },
      {
        kind: "typing",
        message: { type: "chat.typing", isTyping: true },
        counter: "rate_limited.typing",
      },
      {
        kind: "dm",
        message: { type: "dm.send", toUserId: "user_db_2", text: "hi" },
        counter: "rate_limited.dm",
        errorMessage: "Slow down before sending another message",
      },
      {
        kind: "typing",
        message: { type: "dm.typing", toUserId: "user_db_2", isTyping: true },
        counter: "rate_limited.dm_typing",
        errorMessage: "Slow down before sending typing updates",
      },
      {
        kind: "default",
        message: { type: "dm.read", friendId: "user_db_2" },
        counter: "rate_limited.dm_read",
        errorMessage: "Slow down before marking messages read",
      },
      {
        kind: "dm",
        message: { type: "dm.edit", messageId: "dm_1", text: "updated" },
        counter: "rate_limited.dm_edit",
        errorMessage: "Slow down before editing another message",
      },
      {
        kind: "dm",
        message: { type: "dm.delete", messageId: "dm_1" },
        counter: "rate_limited.dm_delete",
        errorMessage: "Slow down before deleting another message",
      },
      {
        kind: "default",
        message: { type: "ping", sentAt: "2026-05-10T00:00:00.000Z" },
        counter: "rate_limited.ping",
        errorMessage: "Slow down before pinging again",
      },
    ];

    for (const item of cases) {
      const rooms = await RoomManager.create();
      const ws = createSocket({ userId: "user_db_1", username: "Dan" });
      const metrics = createMetricsDouble();

      handleMessage(ws, JSON.stringify(item.message), {
        rooms,
        publish() {},
        logger: createLoggerDouble(),
        metrics,
        userRateLimits: exhaustedRateLimitStore(ws.data.userId, item.kind),
      });

      expect(metrics.seenCounters).toContain(item.counter);
      if (item.errorMessage) {
        expect(ws.sent).toContainEqual({
          type: "error",
          code: "RATE_LIMITED",
          message: item.errorMessage,
        });
      } else {
        expect(ws.sent).toEqual([]);
      }
    }
  });

  test("resends a snapshot when the same socket rejoins its current room", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const metrics = createMetricsDouble();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
    });
    ws.sent.length = 0;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
      logger: createLoggerDouble(),
      metrics,
    });

    expect(ws.sent.map((message) => message.type)).toEqual(["room.snapshot", "room.list"]);
    expect(metrics.seenCounters).toContain("room.join.snapshot_resent");
  });

  test("rejects stale or missing room references on socket data", async () => {
    const rooms = await RoomManager.create();
    const missingRoom = createSocket({
      userId: "user_db_1",
      username: "Dan",
      roomId: "missing",
    });
    const missingUser = createSocket({
      userId: "user_db_1",
      username: "Dan",
      roomId: "lobby",
    });
    rooms.getOrCreate("lobby");

    handleMessage(missingRoom, JSON.stringify({ type: "chat.say", text: "hello" }), {
      rooms,
      publish() {},
      logger: createLoggerDouble(),
      metrics: createMetricsDouble(),
    });
    handleMessage(missingUser, JSON.stringify({ type: "chat.say", text: "hello" }), {
      rooms,
      publish() {},
      logger: createLoggerDouble(),
      metrics: createMetricsDouble(),
    });

    expect(missingRoom.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before chatting" },
    ]);
    expect(missingUser.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before chatting" },
    ]);
  });

  test("closes the socket when sending hits backpressure", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    let closed = false;
    ws.send = () => -1;
    ws.close = () => {
      closed = true;
    };

    handleMessage(ws, JSON.stringify({ type: "ping", sentAt: "2026-05-10T00:00:00.000Z" }), {
      rooms,
      publish() {},
    });

    expect(closed).toBe(true);
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
      { type: "connected", userId: "user_db_1", dollars: 0 },
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
        items: [],
        canEditItems: false,
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

  test("registers and unregisters sockets in the per-user socket store", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_1",
    });
    const userSockets = new Map();

    handleOpen(ws, {
      rooms,
      publish() {},
      userSockets,
    });
    handleClose(ws, rooms, () => {}, undefined, undefined, undefined, userSockets);

    expect(userSockets.has("user_db_1")).toBe(false);
  });

  test("silently drops rejected resume rooms and logs clear failures", async () => {
    const rooms = await RoomManager.create();
    rooms.addRoom(createTestLayout("room_knock", "Knock Room"), {
      access: "knock",
      ownerUserId: "user_db_2",
      visibility: "public",
    });
    const ws = createSocket({
      userId: "user_db_1",
      username: "Dan",
      connectionId: "socket_1",
      resumeRoomId: "room_knock",
    });
    let warning: string | undefined;

    handleOpen(ws, {
      rooms,
      publish() {},
      logger: {
        ...createLoggerDouble(),
        warn(event: string) {
          warning = event;
        },
      } as unknown as Logger,
      metrics: createMetricsDouble(),
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async clearLastRoomIdForUser() {
          throw new Error("db down");
        },
      } as unknown as PersistenceStore,
    });
    await flushAsyncMessages();

    expect(ws.sent).toEqual([{ type: "connected", userId: "user_db_1", dollars: 0 }]);
    expect(ws.data.roomId).toBeUndefined();
    expect(warning).toBe("persistence.room_session.clear_failed");
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

  test("moves a user to only one room across multiple sockets", async () => {
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
    const published: { topic: string; message: ServerMessage }[] = [];
    const publish = (topic: string, message: ServerMessage) => published.push({ topic, message });

    handleMessage(socketA, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish,
    });
    handleMessage(socketB, JSON.stringify({ type: "room.join", roomId: "studio" }), {
      rooms,
      publish,
    });

    expect(rooms.get("lobby")).toBeUndefined();
    expect(
      rooms
        .get("studio")
        ?.getUsers()
        .map((user) => user.id),
    ).toEqual(["user_db_1"]);
    expect(published).toContainEqual({
      topic: "room:lobby",
      message: { type: "user.left", userId: "user_db_1" },
    });
  });

  test("disconnects stale room sockets after another socket moves rooms", async () => {
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
    const published: { topic: string; message: ServerMessage }[] = [];
    const context = {
      rooms,
      publish(topic: string, message: ServerMessage) {
        published.push({ topic, message });
      },
      userSockets: new Map([["user_db_1", new Set([socketA, socketB])]]),
    };

    handleMessage(socketA, JSON.stringify({ type: "room.join", roomId: "lobby" }), context);
    handleMessage(socketB, JSON.stringify({ type: "room.join", roomId: "studio" }), context);
    socketA.sent.length = 0;

    handleMessage(socketA, JSON.stringify({ type: "chat.say", text: "stale room" }), context);

    expect(socketA.unsubscribed).toEqual(["room:lobby"]);
    expect(socketA.data.roomId).toBeUndefined();
    expect(socketA.sent).toEqual([
      { type: "error", code: "NOT_IN_ROOM", message: "Join a room before chatting" },
    ]);
    expect(published).not.toContainEqual({
      topic: "room:lobby",
      message: expect.objectContaining({ type: "chat.message", text: "stale room" }),
    });
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

  test("keeps the newest room as the persisted resume room when saves finish out of order", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    let releaseLobbySave: (() => void) | undefined;
    const saved: string[] = [];
    const context = {
      rooms,
      publish() {},
      joinVersions: new Map<string, number>(),
      joinTargets: new Map<string, string>(),
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async saveLastRoomIdForUser(_userId: string, roomId: string) {
          if (roomId === "lobby" && !releaseLobbySave) {
            await new Promise<void>((resolve) => {
              releaseLobbySave = resolve;
            });
          }

          saved.push(roomId);
        },
      },
    };

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), context);
    await flushAsyncMessages();
    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "studio" }), context);
    await flushAsyncMessages();
    releaseLobbySave?.();
    await flushAsyncMessages();

    expect(saved).toEqual(["studio", "lobby", "studio"]);
  });

  test("skips stale room session saves before touching persistence", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    let saveAttempts = 0;
    const joinVersions = new Map<string, number>();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {
        joinVersions.set("user_db_1", 99);
      },
      joinVersions,
      metrics: createMetricsDouble(),
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async saveLastRoomIdForUser() {
          saveAttempts += 1;
        },
      },
    });
    await flushAsyncMessages();

    expect(saveAttempts).toBe(0);
  });

  test("logs room session save failures without failing the join", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    let warning: string | undefined;

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby" }), {
      rooms,
      publish() {},
      logger: {
        ...createLoggerDouble(),
        warn(event: string) {
          warning = event;
        },
      } as unknown as Logger,
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async saveLastRoomIdForUser() {
          throw new Error("db down");
        },
      },
    });
    await flushAsyncMessages();

    expect(ws.sent[0]).toMatchObject({ type: "room.snapshot", roomId: "lobby" });
    expect(warning).toBe("persistence.room_session.save_failed");
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

  test("publishes direct message typing status to the recipient topic", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];
    const directMessages = {
      async assertCanMessage() {},
    } as unknown as DirectMessageService;

    handleMessage(
      ws,
      JSON.stringify({ type: "dm.typing", toUserId: "user_db_2", isTyping: true }),
      {
        rooms,
        publish(topic, message) {
          published.push({ topic, message });
        },
        directMessages,
      },
    );
    await flushAsyncMessages();

    expect(published).toEqual([
      {
        topic: "user:user_db_2",
        message: {
          type: "dm.typing",
          fromUserId: "user_db_1",
          toUserId: "user_db_2",
          isTyping: true,
        },
      },
    ]);
  });

  test("does not republish unchanged direct message typing states", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];
    const directMessages = {
      async assertCanMessage() {},
    } as unknown as DirectMessageService;

    for (let index = 0; index < 2; index += 1) {
      handleMessage(
        ws,
        JSON.stringify({ type: "dm.typing", toUserId: "user_db_2", isTyping: true }),
        {
          rooms,
          publish(_topic, message) {
            published.push(message);
          },
          directMessages,
        },
      );
      await flushAsyncMessages();
    }

    expect(published).toHaveLength(1);
  });

  test("rejects unauthenticated direct message operations", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1" });
    const messages = [
      { type: "dm.send", toUserId: "user_db_2", text: "hi" },
      { type: "dm.typing", toUserId: "user_db_2", isTyping: true },
      { type: "dm.read", friendId: "user_db_2" },
      { type: "dm.edit", messageId: "dm_1", text: "updated" },
      { type: "dm.delete", messageId: "dm_1" },
    ];

    for (const message of messages) {
      handleMessage(ws, JSON.stringify(message), { rooms, publish() {} });
    }

    expect(ws.sent.map((message) => (message.type === "error" ? message.code : undefined))).toEqual(
      [
        "UNAUTHENTICATED",
        "UNAUTHENTICATED",
        "UNAUTHENTICATED",
        "UNAUTHENTICATED",
        "UNAUTHENTICATED",
      ],
    );
  });

  test("reports unavailable direct message services", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const messages = [
      { type: "dm.send", toUserId: "user_db_2", text: "hi" },
      { type: "dm.typing", toUserId: "user_db_2", isTyping: true },
      { type: "dm.read", friendId: "user_db_2" },
      { type: "dm.edit", messageId: "dm_1", text: "updated" },
      { type: "dm.delete", messageId: "dm_1" },
    ];

    for (const message of messages) {
      handleMessage(ws, JSON.stringify(message), { rooms, publish() {} });
      await flushAsyncMessages();
    }

    expect(ws.sent).toEqual(
      messages.map(() => ({
        type: "error",
        code: "DM_UNAVAILABLE",
        message: "Direct messages are unavailable",
      })),
    );
  });

  test("surfaces unexpected direct message service failures as generic errors", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async send() {
        throw new Error("send failed");
      },
      async assertCanMessage() {
        throw new Error("typing failed");
      },
      async markRead() {
        throw new Error("read failed");
      },
      async edit() {
        throw new Error("edit failed");
      },
      async delete() {
        throw new Error("delete failed");
      },
    } as unknown as DirectMessageService;
    const messages = [
      { type: "dm.send", toUserId: "user_db_2", text: "hi" },
      { type: "dm.typing", toUserId: "user_db_2", isTyping: true },
      { type: "dm.read", friendId: "user_db_2" },
      { type: "dm.edit", messageId: "dm_1", text: "updated" },
      { type: "dm.delete", messageId: "dm_1" },
    ];

    for (const message of messages) {
      handleMessage(ws, JSON.stringify(message), {
        rooms,
        publish() {},
        directMessages,
        logger: createLoggerDouble(),
      });
      await flushAsyncMessages();
    }

    expect(
      ws.sent.map((message) => (message.type === "error" ? message.message : undefined)),
    ).toEqual([
      "Could not send your message",
      "Could not send typing update",
      "Could not mark messages read",
      "Could not edit message",
      "Could not delete message",
    ]);
  });

  test("surfaces direct message typing policy rejections as errors", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async assertCanMessage() {
        throw new DirectMessageError("BLOCKED", "You cannot message this player");
      },
    } as unknown as DirectMessageService;

    handleMessage(
      ws,
      JSON.stringify({ type: "dm.typing", toUserId: "user_db_2", isTyping: true }),
      {
        rooms,
        publish() {},
        directMessages,
      },
    );
    await flushAsyncMessages();

    expect(ws.sent).toContainEqual({
      type: "error",
      code: "BLOCKED",
      message: "You cannot message this player",
    });
  });

  test("marks direct messages read and publishes receipts to both users", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];
    const directMessages = {
      async markRead(readerUserId: string, otherUserId: string) {
        return {
          readerUserId,
          otherUserId,
          messageIds: ["dm_1", "dm_2"],
          readAt: "2026-06-13T10:02:00.000Z",
        };
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.read", friendId: "user_db_2" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
      directMessages,
    });
    await flushAsyncMessages();

    const message: ServerMessage = {
      type: "dm.read",
      readerUserId: "user_db_1",
      otherUserId: "user_db_2",
      messageIds: ["dm_1", "dm_2"],
      readAt: "2026-06-13T10:02:00.000Z",
    };
    expect(published).toContainEqual({ topic: "user:user_db_1", message });
    expect(published).toContainEqual({ topic: "user:user_db_2", message });
  });

  test("does not publish empty direct message read receipts", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: ServerMessage[] = [];
    const directMessages = {
      async markRead(readerUserId: string, otherUserId: string) {
        return {
          readerUserId,
          otherUserId,
          messageIds: [],
          readAt: "2026-06-13T10:02:00.000Z",
        };
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.read", friendId: "user_db_2" }), {
      rooms,
      publish(_topic, message) {
        published.push(message);
      },
      directMessages,
    });
    await flushAsyncMessages();

    expect(published).toEqual([]);
  });

  test("edits direct messages and publishes updates to both users", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];
    const directMessages = {
      async edit(fromUserId: string, id: string, text: string) {
        return {
          id,
          fromUserId,
          toUserId: "user_db_2",
          text,
          sentAt: "2026-06-13T10:00:00.000Z",
          editedAt: "2026-06-13T10:03:00.000Z",
        };
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.edit", messageId: "dm_1", text: "updated" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
      directMessages,
    });
    await flushAsyncMessages();

    const message: ServerMessage = {
      type: "dm.edited",
      id: "dm_1",
      fromUserId: "user_db_1",
      toUserId: "user_db_2",
      text: "updated",
      editedAt: "2026-06-13T10:03:00.000Z",
    };
    expect(published).toContainEqual({ topic: "user:user_db_1", message });
    expect(published).toContainEqual({ topic: "user:user_db_2", message });
  });

  test("deletes direct messages and publishes tombstones to both users", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const published: { topic: string; message: ServerMessage }[] = [];
    const directMessages = {
      async delete(fromUserId: string, id: string) {
        return {
          id,
          fromUserId,
          toUserId: "user_db_2",
          deletedAt: "2026-06-13T10:04:00.000Z",
        };
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.delete", messageId: "dm_1" }), {
      rooms,
      publish(topic, message) {
        published.push({ topic, message });
      },
      directMessages,
    });
    await flushAsyncMessages();

    const message: ServerMessage = {
      type: "dm.deleted",
      id: "dm_1",
      fromUserId: "user_db_1",
      toUserId: "user_db_2",
      deletedAt: "2026-06-13T10:04:00.000Z",
    };
    expect(published).toContainEqual({ topic: "user:user_db_1", message });
    expect(published).toContainEqual({ topic: "user:user_db_2", message });
  });

  test("surfaces direct message edit rejections as errors", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async edit() {
        throw new DirectMessageError("DM_NOT_OWNED", "You can only change your own messages");
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.edit", messageId: "dm_1", text: "updated" }), {
      rooms,
      publish() {},
      directMessages,
    });
    await flushAsyncMessages();

    expect(ws.sent).toContainEqual({
      type: "error",
      code: "DM_NOT_OWNED",
      message: "You can only change your own messages",
    });
  });

  test("surfaces direct message delete rejections as errors", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async delete() {
        throw new DirectMessageError("DM_NOT_OWNED", "You can only delete your own messages");
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.delete", messageId: "dm_1" }), {
      rooms,
      publish() {},
      directMessages,
      metrics: createMetricsDouble(),
    });
    await flushAsyncMessages();

    expect(ws.sent).toContainEqual({
      type: "error",
      code: "DM_NOT_OWNED",
      message: "You can only delete your own messages",
    });
  });

  test("surfaces direct message read rejections as errors", async () => {
    const rooms = await RoomManager.create();
    const ws = createSocket({ userId: "user_db_1", username: "Dan" });
    const directMessages = {
      async markRead() {
        throw new DirectMessageError("NOT_FRIENDS", "You can only read friend messages");
      },
    } as unknown as DirectMessageService;

    handleMessage(ws, JSON.stringify({ type: "dm.read", friendId: "user_db_2" }), {
      rooms,
      publish() {},
      directMessages,
      metrics: createMetricsDouble(),
    });
    await flushAsyncMessages();

    expect(ws.sent).toContainEqual({
      type: "error",
      code: "NOT_FRIENDS",
      message: "You can only read friend messages",
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

function createEconomyStore(): EconomyStore {
  const inventory = new Map<string, number>();

  return {
    async getBalance() {
      return 500;
    },
    async getInventory(_userId: string) {
      return [...inventory.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([itemType, quantity]) => ({ itemType, quantity }));
    },
    async purchase() {
      return { balance: 500, inventory: [] };
    },
    async spend() {
      return { balance: 500 };
    },
    async credit() {
      return { balance: 500 };
    },
    async reserveItem(_userId: string, itemType: string) {
      const quantity = inventory.get(itemType) ?? 0;
      if (quantity === 0) {
        return false;
      }
      inventory.set(itemType, quantity - 1);
      return true;
    },
    async refundItem(_userId: string, itemType: string) {
      inventory.set(itemType, (inventory.get(itemType) ?? 0) + 1);
    },
  };
}

function createSocket(data: SocketData = { userId: "user_1", dollars: 0 }) {
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
    close() {},
  } as unknown as ServerWebSocket<SocketData> & {
    sent: ServerMessage[];
    subscribed: string[];
    unsubscribed: string[];
  };
}

function exhaustedRateLimitStore(userId: string, kind: keyof typeof RATE_LIMITS) {
  return new Map([
    [
      userId,
      {
        [kind]: { tokens: 0, updatedAt: Date.now() },
      },
    ],
  ]);
}

function createMetricsDouble() {
  const seenCounters: string[] = [];

  return {
    seenCounters,
    increment(counter: string) {
      seenCounters.push(counter);
    },
    observe() {},
    socketOpened() {},
    socketClosed() {},
  } as unknown as Metrics & { seenCounters: string[] };
}

function createLoggerDouble(): Logger {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  } as unknown as Logger;
}

function workingFurniturePersistence(): PersistenceStore {
  return {
    async getRoom() {
      return undefined;
    },
    async seedRoom() {},
    async saveRoomItem() {},
    async deleteRoomItem() {},
  } as unknown as PersistenceStore;
}

function failingFurniturePersistence(operation: "save" | "delete"): PersistenceStore {
  return {
    async getRoom() {
      return undefined;
    },
    async seedRoom() {},
    async saveRoomItem() {
      if (operation === "save") {
        throw new Error("save failed");
      }
    },
    async deleteRoomItem() {
      if (operation === "delete") {
        throw new Error("delete failed");
      }
    },
  } as unknown as PersistenceStore;
}

function createTestLayout(id: string, name: string) {
  return createRectRoomLayout(id, name, 3, 3, { x: 1, y: 1 });
}

async function flushAsyncMessages(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
