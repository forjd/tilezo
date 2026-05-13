import {
  DEFAULT_AVATAR_APPEARANCE,
  parseRawClientMessage,
  type ServerMessage,
} from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import type { PersistenceStore } from "../db/persistence";
import type { Logger } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
import type { RoomManager } from "../rooms/RoomManager";
import { encodeServerMessage } from "../util/safeJson";
import type { SocketData } from "./socketTypes";

type Context = {
  rooms: RoomManager;
  publish: (topic: string, message: ServerMessage) => void;
  persistence?: PersistenceStore;
  logger?: Logger;
  metrics?: Metrics;
};

export function handleMessage(
  ws: ServerWebSocket<SocketData>,
  raw: string | Buffer,
  context: Context,
): void {
  const startedAt = performance.now();
  const parsed = parseRawClientMessage(raw);

  if (!parsed.ok) {
    context.metrics?.increment("messages.invalid");
    context.metrics?.observe("message.invalid.duration", performance.now() - startedAt);
    context.logger?.warn("websocket.message.invalid", socketFields(ws));
    sendError(ws, "INVALID_MESSAGE", parsed.error);
    return;
  }

  context.metrics?.increment(`messages.${parsed.value.type}`);

  try {
    switch (parsed.value.type) {
      case "room.list.request":
        send(ws, {
          type: "room.list",
          rooms: context.rooms.listPublicRooms(ws.data.roomId, ws.data.userId),
        });
        break;

      case "room.join": {
        if (!ws.data.username) {
          context.metrics?.increment("room.join.unauthenticated");
          context.logger?.warn("room.join.unauthenticated", socketFields(ws));
          sendError(ws, "UNAUTHENTICATED", "Log in before joining a room");
          return;
        }

        void joinRoom(ws, parsed.value.roomId, context, { sendUnavailableError: true });
        break;
      }

      case "avatar.move.request": {
        if (!consumeRateLimit(ws, "movement")) {
          context.metrics?.increment("rate_limited.movement");
          context.logger?.warn("websocket.rate_limited", {
            ...socketFields(ws),
            kind: "movement",
          });
          sendError(ws, "RATE_LIMITED", "Slow down before moving again");
          return;
        }

        const room = getJoinedRoom(ws, context.rooms);

        if (!room) {
          context.metrics?.increment("movement.rejected.not_in_room");
          context.logger?.warn("room.movement.not_in_room", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before moving");
          return;
        }

        const path = room.moveUser(ws.data.userId, parsed.value.target);

        if (!path) {
          context.metrics?.increment("movement.rejected.invalid_tile");
          context.logger?.warn("room.movement.rejected", {
            ...socketFields(ws),
            targetX: parsed.value.target.x,
            targetY: parsed.value.target.y,
          });
          sendError(ws, "INVALID_TILE", "Target tile is not walkable");
          return;
        }

        context.publish(roomTopic(room.id), {
          type: "avatar.moved",
          userId: ws.data.userId,
          path,
        });
        context.metrics?.increment("movement.accepted");
        context.logger?.debug("room.movement.accepted", {
          ...socketFields(ws),
          roomId: room.id,
          pathLength: path.length,
        });
        break;
      }

      case "avatar.appearance.update": {
        if (!consumeRateLimit(ws, "default")) {
          context.metrics?.increment("rate_limited.appearance");
          context.logger?.warn("websocket.rate_limited", {
            ...socketFields(ws),
            kind: "appearance",
          });
          sendError(ws, "RATE_LIMITED", "Slow down before updating your character again");
          return;
        }

        const room = getJoinedRoom(ws, context.rooms);

        if (!room) {
          context.metrics?.increment("appearance.rejected.not_in_room");
          context.logger?.warn("room.appearance.not_in_room", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before updating your character");
          return;
        }

        ws.data.appearance = parsed.value.appearance;

        if (!room.updateAppearance(ws.data.userId, parsed.value.appearance)) {
          context.metrics?.increment("appearance.rejected.not_in_room");
          context.logger?.warn("room.appearance.rejected", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before updating your character");
          return;
        }

        context.publish(roomTopic(room.id), {
          type: "avatar.appearance.updated",
          userId: ws.data.userId,
          appearance: parsed.value.appearance,
        });
        context.metrics?.increment("appearance.accepted");
        break;
      }

      case "chat.say": {
        if (!consumeRateLimit(ws, "chat")) {
          context.metrics?.increment("rate_limited.chat");
          context.logger?.warn("websocket.rate_limited", {
            ...socketFields(ws),
            kind: "chat",
          });
          sendError(ws, "RATE_LIMITED", "Slow down before chatting again");
          return;
        }

        const room = getJoinedRoom(ws, context.rooms);

        if (!room || !ws.data.username) {
          context.metrics?.increment("chat.rejected.not_in_room");
          context.logger?.warn("room.chat.not_in_room", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before chatting");
          return;
        }

        context.publish(roomTopic(room.id), {
          type: "chat.message",
          userId: ws.data.userId,
          username: ws.data.username,
          text: parsed.value.text,
          sentAt: new Date().toISOString(),
        });
        context.metrics?.increment("chat.accepted");
        context.logger?.debug("room.chat.accepted", {
          ...socketFields(ws),
          roomId: room.id,
          textLength: parsed.value.text.length,
        });
        break;
      }

      case "chat.typing": {
        if (!consumeRateLimit(ws, "typing")) {
          context.metrics?.increment("rate_limited.typing");
          return;
        }

        const room = getJoinedRoom(ws, context.rooms);

        if (!room || !ws.data.username) {
          context.metrics?.increment("typing.rejected.not_in_room");
          context.logger?.warn("room.typing.not_in_room", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before typing");
          return;
        }

        if (ws.data.lastTypingState === parsed.value.isTyping) {
          return;
        }

        ws.data.lastTypingState = parsed.value.isTyping;

        context.publish(roomTopic(room.id), {
          type: "chat.typing",
          userId: ws.data.userId,
          username: ws.data.username,
          isTyping: parsed.value.isTyping,
        });
        context.metrics?.increment("typing.accepted");
        break;
      }

      case "ping":
        if (!consumeRateLimit(ws, "default")) {
          context.metrics?.increment("rate_limited.ping");
          sendError(ws, "RATE_LIMITED", "Slow down before pinging again");
          return;
        }

        send(ws, {
          type: "pong",
          sentAt: parsed.value.sentAt,
        });
        break;
    }
  } finally {
    context.metrics?.observe(
      `message.${parsed.value.type}.duration`,
      performance.now() - startedAt,
    );
  }
}

export function handleOpen(ws: ServerWebSocket<SocketData>, context: Context): void {
  context.metrics?.socketOpened();
  context.logger?.info("websocket.opened", socketFields(ws));
  send(ws, {
    type: "connected",
    userId: ws.data.userId,
  });

  if (!ws.data.resumeRoomId) {
    return;
  }

  void joinRoom(ws, ws.data.resumeRoomId, context, { sendUnavailableError: false });
}

export function handleClose(
  ws: ServerWebSocket<SocketData>,
  rooms: RoomManager,
  publish: Context["publish"],
  logger?: Logger,
  metrics?: Metrics,
) {
  metrics?.socketClosed();
  const { roomId, userId } = ws.data;

  if (!roomId) {
    logger?.info("websocket.closed", socketFields(ws));
    return;
  }

  const room = rooms.get(roomId);
  if (!room?.leave(userId, ws.data.connectionId)) {
    logger?.info("websocket.closed.stale", socketFields(ws));
    return;
  }
  ws.unsubscribe(roomTopic(roomId));
  publish(roomTopic(roomId), {
    type: "user.left",
    userId,
  });
  rooms.removeIfEmpty(roomId);
  metrics?.increment("room.left");
  logger?.info("room.left", socketFields(ws));
}

async function joinRoom(
  ws: ServerWebSocket<SocketData>,
  roomId: string,
  context: Context,
  options: { sendUnavailableError: boolean },
): Promise<void> {
  const startedAt = performance.now();

  try {
    const room = context.rooms.getOrCreate(roomId, ws.data.userId);

    if (!room) {
      context.metrics?.increment("room.join.unavailable");
      context.logger?.warn("room.join.unavailable", {
        ...socketFields(ws),
        requestedRoomId: roomId,
      });
      if (options.sendUnavailableError) {
        sendError(ws, "ROOM_NOT_FOUND", "Room is not available");
      }
      await clearLastRoomId(context, ws.data.userId);
      return;
    }

    const previousRoomId = ws.data.roomId;

    if (previousRoomId === room.id) {
      send(ws, {
        type: "room.snapshot",
        roomId: room.id,
        users: room.getUsers(),
        tiles: room.getSnapshot().tiles,
      });
      send(ws, {
        type: "room.list",
        rooms: context.rooms.listPublicRooms(room.id, ws.data.userId),
      });
      await saveLastRoomId(context, ws.data.userId, room.id);
      context.metrics?.increment("room.join.snapshot_resent");
      context.logger?.info("room.join.snapshot_resent", {
        ...socketFields(ws),
        roomId: room.id,
      });
      return;
    }

    if (previousRoomId) {
      const previousRoom = context.rooms.get(previousRoomId);

      if (previousRoom?.leave(ws.data.userId, ws.data.connectionId)) {
        ws.unsubscribe(roomTopic(previousRoomId));
        context.publish(roomTopic(previousRoomId), {
          type: "user.left",
          userId: ws.data.userId,
        });
        context.rooms.removeIfEmpty(previousRoomId);
        context.metrics?.increment("room.left");
        context.logger?.info("room.left", {
          ...socketFields(ws),
          roomId: previousRoomId,
        });
      }
    }

    const user = room.join({
      id: ws.data.userId,
      username: ws.data.username ?? ws.data.userId,
      connectionId: ws.data.connectionId,
      appearance: ws.data.appearance ?? DEFAULT_AVATAR_APPEARANCE,
    });
    const userSnapshot = {
      id: user.id,
      username: user.username,
      position: user.position,
      appearance: user.appearance,
    };

    ws.data.roomId = room.id;
    ws.subscribe(roomTopic(room.id));
    send(ws, {
      type: "room.snapshot",
      roomId: room.id,
      users: room.getUsers(),
      tiles: room.getSnapshot().tiles,
    });
    context.publish(roomTopic(room.id), {
      type: "user.joined",
      user: userSnapshot,
    });
    send(ws, {
      type: "room.list",
      rooms: context.rooms.listPublicRooms(room.id, ws.data.userId),
    });
    await saveLastRoomId(context, ws.data.userId, room.id);
    context.metrics?.increment("room.joined");
    context.logger?.info("room.joined", {
      ...socketFields(ws),
      roomId: room.id,
    });
  } finally {
    context.metrics?.observe("room.join.duration", performance.now() - startedAt);
  }
}

async function saveLastRoomId(context: Context, userId: string, roomId: string): Promise<void> {
  try {
    await context.persistence?.saveLastRoomIdForUser?.(userId, roomId);
  } catch (error) {
    context.logger?.warn("persistence.room_session.save_failed", { userId, roomId, error });
  }
}

async function clearLastRoomId(context: Context, userId: string): Promise<void> {
  try {
    await context.persistence?.clearLastRoomIdForUser?.(userId);
  } catch (error) {
    context.logger?.warn("persistence.room_session.clear_failed", { userId, error });
  }
}

function getJoinedRoom(ws: ServerWebSocket<SocketData>, rooms: RoomManager) {
  return ws.data.roomId ? rooms.get(ws.data.roomId) : undefined;
}

function roomTopic(roomId: string): string {
  return `room:${roomId}`;
}

function send(ws: ServerWebSocket<SocketData>, message: ServerMessage): void {
  const result = ws.send(encodeServerMessage(message));

  if (result === -1) {
    ws.close();
  }
}

function sendError(ws: ServerWebSocket<SocketData>, code: string, message: string): void {
  send(ws, {
    type: "error",
    code,
    message,
  });
}

function socketFields(ws: ServerWebSocket<SocketData>): Record<string, unknown> {
  return {
    userId: ws.data.userId,
    username: ws.data.username,
    roomId: ws.data.roomId,
    connectionId: ws.data.connectionId,
  };
}

const RATE_LIMITS = {
  movement: { burst: 12, refillPerSecond: 8 },
  chat: { burst: 5, refillPerSecond: 2 },
  typing: { burst: 8, refillPerSecond: 4 },
  default: { burst: 20, refillPerSecond: 10 },
} satisfies Record<string, { burst: number; refillPerSecond: number }>;

function consumeRateLimit(
  ws: ServerWebSocket<SocketData>,
  kind: keyof typeof RATE_LIMITS,
  now = Date.now(),
): boolean {
  ws.data.rateLimits ??= {};
  const limit = RATE_LIMITS[kind];
  const current = ws.data.rateLimits[kind] ?? { tokens: limit.burst, updatedAt: now };
  const elapsedSeconds = Math.max(0, (now - current.updatedAt) / 1000);
  const tokens = Math.min(limit.burst, current.tokens + elapsedSeconds * limit.refillPerSecond);

  if (tokens < 1) {
    ws.data.rateLimits[kind] = { tokens, updatedAt: now };
    return false;
  }

  ws.data.rateLimits[kind] = { tokens: tokens - 1, updatedAt: now };
  return true;
}
