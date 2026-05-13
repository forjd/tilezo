import {
  DEFAULT_AVATAR_APPEARANCE,
  parseRawClientMessage,
  type ServerMessage,
} from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import type { PersistenceStore } from "../db/persistence";
import type { RoomManager } from "../rooms/RoomManager";
import { encodeServerMessage } from "../util/safeJson";
import type { SocketData } from "./socketTypes";

type Context = {
  rooms: RoomManager;
  publish: (topic: string, message: ServerMessage) => void;
  persistence?: PersistenceStore;
};

export function handleMessage(
  ws: ServerWebSocket<SocketData>,
  raw: string | Buffer,
  context: Context,
) {
  const parsed = parseRawClientMessage(raw);

  if (!parsed.ok) {
    sendError(ws, "INVALID_MESSAGE", parsed.error);
    return;
  }

  switch (parsed.value.type) {
    case "room.list.request":
      send(ws, {
        type: "room.list",
        rooms: context.rooms.listPublicRooms(ws.data.roomId, ws.data.userId),
      });
      break;

    case "room.join": {
      if (!ws.data.username) {
        sendError(ws, "UNAUTHENTICATED", "Log in before joining a room");
        return;
      }

      const room = context.rooms.getOrCreate(parsed.value.roomId, ws.data.userId);

      if (!room) {
        sendError(ws, "ROOM_NOT_FOUND", "Room is not available");
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
        return;
      }

      if (previousRoomId) {
        context.rooms.get(previousRoomId)?.leave(ws.data.userId);
        ws.unsubscribe(roomTopic(previousRoomId));
        context.publish(roomTopic(previousRoomId), {
          type: "user.left",
          userId: ws.data.userId,
        });
        context.rooms.removeIfEmpty(previousRoomId);
      }

      const user = room.join({
        id: ws.data.userId,
        username: ws.data.username,
        appearance: ws.data.appearance ?? DEFAULT_AVATAR_APPEARANCE,
      });

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
        user,
      });
      send(ws, {
        type: "room.list",
        rooms: context.rooms.listPublicRooms(room.id, ws.data.userId),
      });
      break;
    }

    case "avatar.move.request": {
      if (!consumeRateLimit(ws, "movement")) {
        sendError(ws, "RATE_LIMITED", "Slow down before moving again");
        return;
      }

      const room = getJoinedRoom(ws, context.rooms);

      if (!room) {
        sendError(ws, "NOT_IN_ROOM", "Join a room before moving");
        return;
      }

      const path = room.moveUser(ws.data.userId, parsed.value.target);

      if (!path) {
        sendError(ws, "INVALID_TILE", "Target tile is not walkable");
        return;
      }

      context.publish(roomTopic(room.id), {
        type: "avatar.moved",
        userId: ws.data.userId,
        path,
      });
      break;
    }

    case "avatar.appearance.update": {
      if (!consumeRateLimit(ws, "default")) {
        sendError(ws, "RATE_LIMITED", "Slow down before updating your character again");
        return;
      }

      const room = getJoinedRoom(ws, context.rooms);

      if (!room) {
        sendError(ws, "NOT_IN_ROOM", "Join a room before updating your character");
        return;
      }

      ws.data.appearance = parsed.value.appearance;

      if (!room.updateAppearance(ws.data.userId, parsed.value.appearance)) {
        sendError(ws, "NOT_IN_ROOM", "Join a room before updating your character");
        return;
      }

      context.publish(roomTopic(room.id), {
        type: "avatar.appearance.updated",
        userId: ws.data.userId,
        appearance: parsed.value.appearance,
      });
      break;
    }

    case "chat.say": {
      if (!consumeRateLimit(ws, "chat")) {
        sendError(ws, "RATE_LIMITED", "Slow down before chatting again");
        return;
      }

      const room = getJoinedRoom(ws, context.rooms);

      if (!room || !ws.data.username) {
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
      break;
    }

    case "chat.typing": {
      if (!consumeRateLimit(ws, "typing")) {
        return;
      }

      const room = getJoinedRoom(ws, context.rooms);

      if (!room || !ws.data.username) {
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
      break;
    }

    case "ping":
      if (!consumeRateLimit(ws, "default")) {
        sendError(ws, "RATE_LIMITED", "Slow down before pinging again");
        return;
      }

      send(ws, {
        type: "pong",
        sentAt: parsed.value.sentAt,
      });
      break;
  }
}

export function handleClose(
  ws: ServerWebSocket<SocketData>,
  rooms: RoomManager,
  publish: Context["publish"],
) {
  const { roomId, userId } = ws.data;

  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  room?.leave(userId);
  ws.unsubscribe(roomTopic(roomId));
  publish(roomTopic(roomId), {
    type: "user.left",
    userId,
  });
  rooms.removeIfEmpty(roomId);
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
