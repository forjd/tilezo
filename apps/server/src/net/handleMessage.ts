import {
  DEFAULT_AVATAR_APPEARANCE,
  parseRawClientMessage,
  type ServerMessage,
} from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import type { PersistenceStore } from "../db/persistence";
import { DirectMessageError, type DirectMessageService } from "../messaging/messaging";
import type { Logger } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
import type { PresenceTracker } from "../presence/presence";
import { ensurePersonalRoom, personalRoomId } from "../rooms/personalRoom";
import type { RoomManager } from "../rooms/RoomManager";
import { encodeServerMessage } from "../util/safeJson";
import type { SocketData } from "./socketTypes";

type Context = {
  rooms: RoomManager;
  publish: (topic: string, message: ServerMessage) => void;
  persistence?: PersistenceStore;
  directMessages?: DirectMessageService;
  logger?: Logger;
  metrics?: Metrics;
  presence?: PresenceTracker;
  userRateLimits?: UserRateLimitStore;
  joinVersions?: Map<string, number>;
  joinTargets?: Map<string, string>;
};

type RateLimitKind = keyof typeof RATE_LIMITS;
type RateLimitBucket = { tokens: number; updatedAt: number };
type RateLimitState = Partial<Record<RateLimitKind, RateLimitBucket>>;
export type UserRateLimitStore = Map<string, RateLimitState>;

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
        if (!consumeRateLimit(ws, "default", undefined, context.userRateLimits)) {
          context.metrics?.increment("rate_limited.room_list");
          sendError(ws, "RATE_LIMITED", "Slow down before refreshing rooms again");
          return;
        }

        void sendRoomList(ws, context);
        break;

      case "room.join": {
        if (!consumeRateLimit(ws, "default", undefined, context.userRateLimits)) {
          context.metrics?.increment("rate_limited.room_join");
          sendError(ws, "RATE_LIMITED", "Slow down before changing rooms again");
          return;
        }

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
        if (!consumeRateLimit(ws, "movement", undefined, context.userRateLimits)) {
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

        if (path.length < 2) {
          // Target is the avatar's current tile: nothing to move, so do not broadcast an
          // empty path to the whole room (matches the bot mover's guard).
          context.metrics?.increment("movement.noop");
          break;
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
        if (!consumeRateLimit(ws, "default", undefined, context.userRateLimits)) {
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

        if (!room.updateAppearance(ws.data.userId, parsed.value.appearance)) {
          context.metrics?.increment("appearance.rejected.not_in_room");
          context.logger?.warn("room.appearance.rejected", socketFields(ws));
          sendError(ws, "NOT_IN_ROOM", "Join a room before updating your character");
          return;
        }

        // Only mirror the appearance onto the socket after the authoritative room update
        // succeeds, so a rejected update cannot leave the local copy out of sync.
        ws.data.appearance = parsed.value.appearance;

        context.publish(roomTopic(room.id), {
          type: "avatar.appearance.updated",
          userId: ws.data.userId,
          appearance: parsed.value.appearance,
        });
        context.metrics?.increment("appearance.accepted");
        break;
      }

      case "chat.say": {
        if (!consumeRateLimit(ws, "chat", undefined, context.userRateLimits)) {
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
        if (!consumeRateLimit(ws, "typing", undefined, context.userRateLimits)) {
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

      case "dm.send": {
        if (!consumeRateLimit(ws, "dm", undefined, context.userRateLimits)) {
          context.metrics?.increment("rate_limited.dm");
          sendError(ws, "RATE_LIMITED", "Slow down before sending another message");
          return;
        }

        if (!ws.data.username) {
          sendError(ws, "UNAUTHENTICATED", "Log in before sending messages");
          return;
        }

        void sendDirectMessage(ws, parsed.value.toUserId, parsed.value.text, context);
        break;
      }

      case "ping":
        if (!consumeRateLimit(ws, "default", undefined, context.userRateLimits)) {
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
  if (ws.data.connectionId) {
    context.presence?.connect(ws.data.userId, ws.data.connectionId);
  }
  context.metrics?.socketOpened();
  context.logger?.info("websocket.opened", socketFields(ws));
  // Subscribe to a per-user topic so direct messages can be delivered to this user's
  // sockets regardless of which room (if any) they are in.
  ws.subscribe(userTopic(ws.data.userId));
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
  presence?: PresenceTracker,
) {
  metrics?.socketClosed();
  const { roomId, userId } = ws.data;
  if (ws.data.connectionId) {
    presence?.disconnect(userId, ws.data.connectionId);
  }

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
    if (roomId === personalRoomId(ws.data.userId)) {
      await ensureOwnPersonalRoom(ws, context);
    }

    const access = context.rooms.canJoinRoom(roomId, ws.data.userId);

    if (!access.ok) {
      context.metrics?.increment(
        access.code === "ROOM_ACCESS_REQUIRED"
          ? "room.join.access_required"
          : "room.join.unavailable",
      );
      context.logger?.warn("room.join.rejected", {
        ...socketFields(ws),
        requestedRoomId: roomId,
        code: access.code,
      });
      if (options.sendUnavailableError) {
        sendError(ws, access.code, access.message);
      }
      // Clear the persisted last room when a resume is rejected for any reason (including
      // a now knock-gated room), otherwise the user is silently dropped to no room on
      // every reconnect. On the interactive path only clear when the room is truly gone.
      if (access.code === "ROOM_NOT_FOUND" || !options.sendUnavailableError) {
        await clearLastRoomId(context, ws.data.userId);
      }
      return;
    }

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
      // Same socket re-joining its current room: just resend the snapshot. The last-room
      // session row is already persisted from the original join, so skip the DB write to
      // avoid an upsert per frame when a client spams room.join for its current room.
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
      context.metrics?.increment("room.join.snapshot_resent");
      context.logger?.info("room.join.snapshot_resent", {
        ...socketFields(ws),
        roomId: room.id,
      });
      return;
    }

    const joinVersion = nextJoinVersion(context, ws.data.userId, room.id);

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

    for (const removedRoomId of context.rooms.removeUserFromOtherRooms(ws.data.userId, room.id)) {
      context.publish(roomTopic(removedRoomId), {
        type: "user.left",
        userId: ws.data.userId,
      });
      context.rooms.removeIfEmpty(removedRoomId);
      context.metrics?.increment("room.left");
      context.logger?.info("room.left.superseded", {
        ...socketFields(ws),
        roomId: removedRoomId,
      });
    }

    // If this user already has an avatar in the room, a newer socket is replacing an
    // earlier connection (duplicate connection / reconnect). Re-point the existing avatar
    // at this socket instead of overwriting it and broadcasting a second user.joined.
    const isReconnect = room.hasUser(ws.data.userId);
    const joinPayload = {
      id: ws.data.userId,
      username: ws.data.username ?? ws.data.userId,
      connectionId: ws.data.connectionId,
      appearance: ws.data.appearance ?? DEFAULT_AVATAR_APPEARANCE,
    };
    const user = isReconnect ? room.reattach(joinPayload) : room.join(joinPayload);
    const userSnapshot = {
      id: user.id,
      username: user.username,
      position: user.position,
      appearance: user.appearance,
    };

    ws.data.roomId = room.id;
    if (ws.data.connectionId) {
      context.presence?.moveUserToRoom(ws.data.userId, ws.data.connectionId, room.id);
    }
    ws.subscribe(roomTopic(room.id));
    send(ws, {
      type: "room.snapshot",
      roomId: room.id,
      users: room.getUsers(),
      tiles: room.getSnapshot().tiles,
    });

    if (isReconnect) {
      context.metrics?.increment("room.reconnected");
      context.logger?.info("room.reconnected", {
        ...socketFields(ws),
        roomId: room.id,
      });
    } else {
      context.publish(roomTopic(room.id), {
        type: "user.joined",
        user: userSnapshot,
      });
    }

    send(ws, {
      type: "room.list",
      rooms: context.rooms.listPublicRooms(room.id, ws.data.userId),
    });
    await saveLastRoomId(context, ws.data.userId, room.id, joinVersion);
    context.metrics?.increment("room.joined");
    context.logger?.info("room.joined", {
      ...socketFields(ws),
      roomId: room.id,
    });
  } finally {
    context.metrics?.observe("room.join.duration", performance.now() - startedAt);
  }
}

async function sendRoomList(ws: ServerWebSocket<SocketData>, context: Context): Promise<void> {
  const startedAt = performance.now();

  try {
    await ensureOwnPersonalRoom(ws, context);
    send(ws, {
      type: "room.list",
      rooms: context.rooms.listPublicRooms(ws.data.roomId, ws.data.userId),
    });
  } finally {
    context.metrics?.observe("room.list.duration", performance.now() - startedAt);
  }
}

async function ensureOwnPersonalRoom(
  ws: ServerWebSocket<SocketData>,
  context: Context,
): Promise<void> {
  if (!ws.data.username) {
    return;
  }

  await ensurePersonalRoom(
    { id: ws.data.userId, username: ws.data.username },
    {
      logger: context.logger,
      metrics: context.metrics,
      persistence: context.persistence,
      rooms: context.rooms,
    },
  );
}

async function saveLastRoomId(
  context: Context,
  userId: string,
  roomId: string,
  joinVersion: number,
): Promise<void> {
  if (!isCurrentJoinVersion(context, userId, joinVersion)) {
    context.metrics?.increment("room_session.save_stale");
    return;
  }

  try {
    await context.persistence?.saveLastRoomIdForUser?.(userId, roomId);
    if (!isCurrentJoinVersion(context, userId, joinVersion)) {
      const latestRoomId = context.joinTargets?.get(userId);

      if (latestRoomId && latestRoomId !== roomId) {
        await context.persistence?.saveLastRoomIdForUser?.(userId, latestRoomId);
      }
    }
  } catch (error) {
    context.logger?.warn("persistence.room_session.save_failed", { userId, roomId, error });
  }
}

function nextJoinVersion(context: Context, userId: string, roomId: string): number {
  if (!context.joinVersions) {
    return 0;
  }

  const next = (context.joinVersions.get(userId) ?? 0) + 1;
  context.joinVersions.set(userId, next);
  context.joinTargets?.set(userId, roomId);
  return next;
}

function isCurrentJoinVersion(context: Context, userId: string, version: number): boolean {
  return !context.joinVersions || context.joinVersions.get(userId) === version;
}

async function clearLastRoomId(context: Context, userId: string): Promise<void> {
  try {
    await context.persistence?.clearLastRoomIdForUser?.(userId);
  } catch (error) {
    context.logger?.warn("persistence.room_session.clear_failed", { userId, error });
  }
}

function getJoinedRoom(ws: ServerWebSocket<SocketData>, rooms: RoomManager) {
  if (!ws.data.roomId) {
    return undefined;
  }

  const room = rooms.get(ws.data.roomId);

  if (!room) {
    return undefined;
  }

  // A socket that has been superseded by a newer connection for the same user must no
  // longer drive that user's avatar (movement, chat, appearance, typing).
  const currentConnectionId = room.getConnectionId(ws.data.userId);

  if (
    currentConnectionId !== undefined &&
    ws.data.connectionId !== undefined &&
    currentConnectionId !== ws.data.connectionId
  ) {
    return undefined;
  }

  return room;
}

async function sendDirectMessage(
  ws: ServerWebSocket<SocketData>,
  toUserId: string,
  text: string,
  context: Context,
): Promise<void> {
  if (!context.directMessages) {
    sendError(ws, "DM_UNAVAILABLE", "Direct messages are unavailable");
    return;
  }

  try {
    const record = await context.directMessages.send(ws.data.userId, toUserId, text);
    const message: ServerMessage = {
      type: "dm.message",
      id: record.id,
      fromUserId: record.fromUserId,
      toUserId: record.toUserId,
      text: record.text,
      sentAt: record.sentAt,
    };
    // Deliver to the recipient's sockets and echo to the sender's (so every tab and the
    // server-assigned id/timestamp stay in sync).
    context.publish(userTopic(record.toUserId), message);
    context.publish(userTopic(record.fromUserId), message);
    context.metrics?.increment("dm.sent");
  } catch (error) {
    if (error instanceof DirectMessageError) {
      context.metrics?.increment(`dm.rejected.${error.code}`);
      sendError(ws, error.code, error.message);
      return;
    }

    context.logger?.warn("dm.send.failed", { ...socketFields(ws), error });
    sendError(ws, "DM_FAILED", "Could not send your message");
  }
}

function roomTopic(roomId: string): string {
  return `room:${roomId}`;
}

function userTopic(userId: string): string {
  return `user:${userId}`;
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

export const RATE_LIMITS = {
  movement: { burst: 12, refillPerSecond: 8 },
  chat: { burst: 5, refillPerSecond: 2 },
  typing: { burst: 8, refillPerSecond: 4 },
  dm: { burst: 5, refillPerSecond: 1 },
  default: { burst: 20, refillPerSecond: 10 },
} satisfies Record<string, { burst: number; refillPerSecond: number }>;

export function consumeRateLimit(
  ws: ServerWebSocket<SocketData>,
  kind: keyof typeof RATE_LIMITS,
  now = Date.now(),
  userRateLimits?: UserRateLimitStore,
): boolean {
  const state = getRateLimitState(ws, userRateLimits);
  const limit = RATE_LIMITS[kind];
  const current = state[kind] ?? { tokens: limit.burst, updatedAt: now };
  const elapsedSeconds = Math.max(0, (now - current.updatedAt) / 1000);
  const tokens = Math.min(limit.burst, current.tokens + elapsedSeconds * limit.refillPerSecond);

  if (tokens < 1) {
    state[kind] = { tokens, updatedAt: now };
    return false;
  }

  state[kind] = { tokens: tokens - 1, updatedAt: now };
  return true;
}

function getRateLimitState(
  ws: ServerWebSocket<SocketData>,
  userRateLimits?: UserRateLimitStore,
): RateLimitState {
  if (!userRateLimits) {
    ws.data.rateLimits ??= {};
    return ws.data.rateLimits;
  }

  const existing = userRateLimits.get(ws.data.userId);

  if (existing) {
    return existing;
  }

  const created: RateLimitState = {};
  userRateLimits.set(ws.data.userId, created);
  return created;
}
