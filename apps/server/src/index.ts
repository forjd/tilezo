import type { ServerMessage } from "@tilezo/protocol";
import { MAX_RAW_MESSAGE_BYTES } from "@tilezo/protocol";
import type { Server } from "bun";
import { AuthPasswordLimiter, AuthService, DrizzleAuthStore } from "./auth/auth";
import { FixedWindowRateLimiter } from "./auth/rateLimit";
import { getConfig, type ServerConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore, type PersistenceStore } from "./db/persistence";
import { DrizzleFriendStore, FriendService } from "./friends/friends";
import { corsHeaders, createHttpRouter } from "./http/router";
import { DirectMessageService, DrizzleDirectMessageStore } from "./messaging/messaging";
import { handleClose, handleMessage, handleOpen, type UserRateLimitStore } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { isAllowedWebSocketOrigin, readWebSocketSessionToken } from "./net/webSocketSecurity";
import { createLogger, parseLogLevel } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { PresenceTracker } from "./presence/presence";
import { DEFAULT_ROOM_BOTS, RoomBotController } from "./rooms/bots";
import { RoomManager } from "./rooms/RoomManager";
import { createId } from "./util/ids";
import { encodeServerMessage } from "./util/safeJson";

const config = getConfig();
const logger = createLogger({
  service: "tilezo-server",
  level: parseLogLevel(Bun.env.LOG_LEVEL),
});
const metrics = new Metrics();
metrics.startEventLoopMonitor();

const registerRateLimiter = new FixedWindowRateLimiter({
  limit: config.authRegisterRateLimitMax,
  windowMs: config.authRegisterRateLimitWindowMs,
});
const loginRateLimiter = new FixedWindowRateLimiter({
  limit: config.authLoginRateLimitMax,
  windowMs: config.authLoginRateLimitWindowMs,
});
const roomCreateRateLimiter = new FixedWindowRateLimiter({
  limit: config.roomCreateRateLimitMax,
  windowMs: config.roomCreateRateLimitWindowMs,
});
const friendRateLimiter = new FixedWindowRateLimiter({
  limit: config.friendRateLimitMax,
  windowMs: config.friendRateLimitWindowMs,
});
const clientEventRateLimiter = new FixedWindowRateLimiter({
  limit: config.clientEventRateLimitMax,
  windowMs: config.clientEventRateLimitWindowMs,
});
const rateLimiters = [
  registerRateLimiter,
  loginRateLimiter,
  roomCreateRateLimiter,
  friendRateLimiter,
  clientEventRateLimiter,
];
const rateLimiterPruneTimer = setInterval(() => {
  for (const limiter of rateLimiters) {
    limiter.prune();
  }
}, config.authRegisterRateLimitWindowMs);
rateLimiterPruneTimer.unref?.();

const database = createDatabase(config.databaseUrl);
const persistence = database ? new DrizzlePersistenceStore(database) : undefined;
const presence = new PresenceTracker();
const rooms = await RoomManager.create({ persistence, bots: DEFAULT_ROOM_BOTS });
const friends = database
  ? new FriendService(
      new DrizzleFriendStore(database),
      (userId) => presence.get(userId),
      {
        canJoinRoom: (userId, roomId) => rooms.canJoinRoom(roomId, userId).ok,
        maxFriends: config.maxFriendsPerUser,
      },
    )
  : undefined;
const directMessages =
  database && friends
    ? new DirectMessageService(new DrizzleDirectMessageStore(database), (a, b) =>
        friends.areFriends(a, b),
      )
    : undefined;
const auth = database
  ? new AuthService(new DrizzleAuthStore(database), {
      secret: config.authSecret,
      metrics,
      passwordLimiter: new AuthPasswordLimiter({
        concurrency: config.authPasswordConcurrency,
        maxQueue: config.authPasswordQueueLimit,
        timeoutMs: config.authPasswordWaitTimeoutMs,
      }),
    })
  : undefined;
const websocketRateLimits: UserRateLimitStore = new Map();
const joinVersions = new Map<string, number>();
const joinTargets = new Map<string, string>();

const router = createHttpRouter({
  config,
  logger,
  metrics,
  auth,
  friends,
  directMessages,
  persistence,
  rooms,
  registerRateLimiter,
  loginRateLimiter,
  roomCreateRateLimiter,
  friendRateLimiter,
  clientEventRateLimiter,
});

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  async fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return handleWebSocketUpgrade(request, server, url);
    }

    return router(request, resolveClientKey(request, server, config));
  },
  websocket: {
    maxPayloadLength: MAX_RAW_MESSAGE_BYTES,
    backpressureLimit: MAX_RAW_MESSAGE_BYTES * 4,
    closeOnBackpressureLimit: true,
    open(ws) {
      handleOpen(ws, {
        rooms,
        publish,
        persistence,
        directMessages,
        logger,
        metrics,
        presence,
      });
    },
    message(ws, message) {
      if (typeof message === "string" || Buffer.isBuffer(message)) {
        handleMessage(ws, message, {
          rooms,
          publish,
          persistence,
          directMessages,
          logger,
          metrics,
          presence,
          userRateLimits: websocketRateLimits,
          joinVersions,
          joinTargets,
        });
        return;
      }

      metrics.increment("messages.unsupported");
      logger.warn("websocket.message.unsupported", {
        userId: ws.data.userId,
        roomId: ws.data.roomId,
        connectionId: ws.data.connectionId,
      });
      ws.send(
        encodeServerMessage({
          type: "error",
          code: "INVALID_MESSAGE",
          message: "Unsupported message type",
        }),
      );
    },
    close(ws) {
      handleClose(ws, rooms, publish, logger, metrics, presence);
    },
  },
});

const botController = new RoomBotController({
  rooms,
  publish,
});
const botTimer = setInterval(() => botController.tick(), 5_000);
botTimer.unref?.();

async function handleWebSocketUpgrade(
  request: Request,
  bunServer: Server<SocketData>,
  url: URL,
): Promise<Response | undefined> {
  if (!isAllowedWebSocketOrigin(request, config)) {
    logger.warn("websocket.origin.rejected", { origin: request.headers.get("origin") });
    return Response.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "WebSocket origin is not allowed" } },
      { status: 403, headers: corsHeaders() },
    );
  }

  // Browsers send the HttpOnly session cookie on the WS handshake; API clients can use the
  // Authorization header. Do not accept query tokens because they leak through URLs/logs.
  const user = await auth?.verifyToken(readWebSocketSessionToken(request) ?? "");

  if (!user) {
    logger.warn("websocket.auth.rejected");
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Log in before connecting" } },
      { status: 401, headers: corsHeaders() },
    );
  }

  const upgraded = bunServer.upgrade(request, {
    data: {
      userId: user.id,
      username: user.username,
      connectionId: createId("socket"),
      resumeRoomId: await readResumeRoomId(user.id, persistence),
      appearance: user.appearance,
    },
  });

  if (upgraded) {
    logger.info("websocket.upgraded", { userId: user.id });
    return undefined;
  }

  return new Response("WebSocket upgrade failed", {
    status: 400,
    headers: corsHeaders(),
  });
}

function resolveClientKey(
  request: Request,
  bunServer: Server<SocketData>,
  serverConfig: ServerConfig,
): string {
  // Only trust client-supplied forwarding headers when explicitly running behind a
  // trusted proxy. Otherwise use the real socket peer address so an attacker cannot
  // bypass rate limits by rotating forged x-forwarded-for / x-real-ip values.
  if (serverConfig.trustProxy) {
    const forwarded =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    if (forwarded) {
      return forwarded;
    }
  }

  return bunServer.requestIP(request)?.address ?? "local";
}

function publish(topic: string, message: ServerMessage): void {
  const result = server.publish(topic, encodeServerMessage(message));
  metrics.increment(`publish.${message.type}`);

  if (result === -1) {
    metrics.increment("publish.dropped");
    logger.warn("websocket.publish.backpressure", { topic });
  }
}

async function readResumeRoomId(
  userId: string,
  store: PersistenceStore | undefined,
): Promise<string | undefined> {
  try {
    return await store?.getLastRoomIdForUser?.(userId);
  } catch (error) {
    logger.warn("persistence.room_session.read_failed", { userId, error });
    return undefined;
  }
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("server.shutdown", { signal });
  clearInterval(botTimer);
  clearInterval(rateLimiterPruneTimer);
  metrics.stopEventLoopMonitor();
  await server.stop(true);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info("server.started", {
  host: config.host,
  port: server.port,
  persistence: Boolean(persistence),
});
