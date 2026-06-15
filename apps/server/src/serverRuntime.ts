import type { ServerMessage } from "@tilezo/protocol";
import { MAX_RAW_MESSAGE_BYTES } from "@tilezo/protocol";
import type { Server, ServerWebSocket } from "bun";
import { AuthPasswordLimiter, AuthService, DrizzleAuthStore } from "./auth/auth";
import { FixedWindowRateLimiter } from "./auth/rateLimit";
import { BlockService, DrizzleBlockStore } from "./blocks/blocks";
import { getConfig, type ServerConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore, type PersistenceStore } from "./db/persistence";
import { DrizzleEconomyStore, type EconomyStore } from "./economy/economy";
import { DrizzleFriendStore, FriendService } from "./friends/friends";
import { corsHeaders, createHttpRouter } from "./http/router";
import { DirectMessageService, DrizzleDirectMessageStore } from "./messaging/messaging";
import {
  handleClose,
  handleMessage,
  handleOpen,
  type UserRateLimitStore,
  type UserSocketStore,
  userTopic,
} from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { isAllowedWebSocketOrigin, readWebSocketSessionToken } from "./net/webSocketSecurity";
import { createLogger, parseLogLevel } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { PresenceTracker } from "./presence/presence";
import { DEFAULT_ROOM_BOTS, RoomBotController } from "./rooms/bots";
import { RoomManager } from "./rooms/RoomManager";
import { createId } from "./util/ids";
import { encodeServerMessage } from "./util/safeJson";

type RuntimeTimer = number | { unref?: () => void };
type RuntimeDatabase = NonNullable<ReturnType<typeof createDatabase>>;

type RuntimeProcess = {
  exit: (code?: number) => never;
  on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
};

type RuntimeServeOptions = {
  hostname: string;
  port: number;
  fetch: (
    request: Request,
    server: Server<SocketData>,
  ) => Promise<Response | undefined> | Response | undefined;
  websocket: {
    backpressureLimit: number;
    close: (ws: ServerWebSocket<SocketData>) => void;
    closeOnBackpressureLimit: boolean;
    maxPayloadLength: number;
    message: (ws: ServerWebSocket<SocketData>, message: unknown) => void;
    open: (ws: ServerWebSocket<SocketData>) => void;
  };
};

export type ServerRuntimeDeps = {
  auth?: AuthService;
  clearInterval?: (timer: RuntimeTimer) => void;
  createSocketId?: (prefix: string) => string;
  database?: RuntimeDatabase;
  env?: Record<string, string | undefined>;
  persistence?: PersistenceStore;
  process?: RuntimeProcess;
  serve?: (options: RuntimeServeOptions) => Server<SocketData>;
  setInterval?: (callback: () => void, ms: number) => RuntimeTimer;
};

export type ServerRuntime = {
  config: ServerConfig;
  server: Server<SocketData>;
  shutdown: (signal: string) => Promise<void>;
};

export async function startServerRuntime(deps: ServerRuntimeDeps = {}): Promise<ServerRuntime> {
  const env = deps.env ?? Bun.env;
  const setIntervalRef =
    deps.setInterval ??
    ((callback: () => void, ms: number) => setInterval(callback, ms) as RuntimeTimer);
  const clearIntervalRef =
    deps.clearInterval ??
    ((timer: RuntimeTimer) => clearInterval(timer as ReturnType<typeof setInterval>));
  const processRef = deps.process ?? process;
  const createSocketId = deps.createSocketId ?? createId;
  const serve =
    deps.serve ??
    ((options: RuntimeServeOptions) => {
      const bunServe = Bun.serve as unknown as (
        serveOptions: RuntimeServeOptions,
      ) => Server<SocketData>;
      return bunServe(options);
    });
  const config = getConfig(env);
  const logger = createLogger({
    service: "tilezo-server",
    level: parseLogLevel(env.LOG_LEVEL),
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
  const inventoryPurchaseRateLimiter = new FixedWindowRateLimiter({
    limit: config.inventoryPurchaseRateLimitMax,
    windowMs: config.inventoryPurchaseRateLimitWindowMs,
  });
  const websocketUpgradeRateLimiter = new FixedWindowRateLimiter({
    limit: config.websocketUpgradeRateLimitMax,
    windowMs: config.websocketUpgradeRateLimitWindowMs,
  });
  const rateLimiters = [
    registerRateLimiter,
    loginRateLimiter,
    roomCreateRateLimiter,
    friendRateLimiter,
    clientEventRateLimiter,
    inventoryPurchaseRateLimiter,
    websocketUpgradeRateLimiter,
  ];
  const rateLimiterPruneTimer = setIntervalRef(() => {
    for (const limiter of rateLimiters) {
      limiter.prune();
    }
  }, config.authRegisterRateLimitWindowMs);
  unrefTimer(rateLimiterPruneTimer);

  const database = deps.database ?? createDatabase(config.databaseUrl);
  const persistence =
    deps.persistence ?? (database ? new DrizzlePersistenceStore(database) : undefined);
  const economy: EconomyStore | undefined = database
    ? new DrizzleEconomyStore(database)
    : undefined;
  const presence = new PresenceTracker();
  const rooms = await RoomManager.create({ persistence, bots: DEFAULT_ROOM_BOTS });
  const blocks = database
    ? new BlockService(new DrizzleBlockStore(database), {
        maxBlockedUsers: config.maxBlockedUsersPerUser,
      })
    : undefined;
  const friends = database
    ? new FriendService(new DrizzleFriendStore(database), (userId) => presence.get(userId), {
        canJoinRoom: (userId, roomId) => rooms.canJoinRoom(roomId, userId).ok,
        maxFriends: config.maxFriendsPerUser,
      })
    : undefined;
  const directMessages =
    database && friends
      ? new DirectMessageService(
          new DrizzleDirectMessageStore(database),
          (a, b) => friends.areFriends(a, b),
          (a, b) => blocks?.isBlockedEitherDirection(a, b) ?? Promise.resolve(false),
        )
      : undefined;
  const auth =
    deps.auth ??
    (database
      ? new AuthService(new DrizzleAuthStore(database), {
          secret: config.authSecret,
          metrics,
          passwordLimiter: new AuthPasswordLimiter({
            concurrency: config.authPasswordConcurrency,
            maxQueue: config.authPasswordQueueLimit,
            timeoutMs: config.authPasswordWaitTimeoutMs,
          }),
        })
      : undefined);
  const websocketRateLimits: UserRateLimitStore = new Map();
  const userSockets: UserSocketStore = new Map();
  const joinVersions = new Map<string, number>();
  const joinTargets = new Map<string, string>();

  const router = createHttpRouter({
    config,
    logger,
    metrics,
    auth,
    friends,
    blocks,
    directMessages,
    persistence,
    rooms,
    economy,
    // c8 ignore next 3 -- router tests assert publication effects through route handlers; runtime only wires the topic helper.
    publishUserMessage(userId, message) {
      publish(userTopic(userId), message);
    },
    registerRateLimiter,
    loginRateLimiter,
    roomCreateRateLimiter,
    friendRateLimiter,
    clientEventRateLimiter,
    inventoryPurchaseRateLimiter,
  });

  const server = serve({
    hostname: config.host,
    port: config.port,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/ws") {
        return handleWebSocketUpgrade(request, server);
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
          userSockets,
          economy,
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
            userSockets,
            joinVersions,
            joinTargets,
            economy,
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
        handleClose(ws, rooms, publish, logger, metrics, presence, userSockets);
      },
    },
  });

  const botController = new RoomBotController({
    rooms,
    publish,
  });
  const botTimer = setIntervalRef(() => botController.tick(), 5_000);
  unrefTimer(botTimer);

  async function handleWebSocketUpgrade(
    request: Request,
    bunServer: Server<SocketData>,
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
    const clientKey = resolveClientKey(request, bunServer, config);
    const ipLimit = websocketUpgradeRateLimiter.consume(`ip:${clientKey}`);
    if (!ipLimit.allowed) {
      metrics.increment("websocket.upgrade.rate_limited");
      logger.warn("websocket.upgrade.rate_limited", {
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many websocket connection attempts" } },
        {
          status: 429,
          headers: { ...corsHeaders(), "retry-after": ipLimit.retryAfterSeconds.toString() },
        },
      );
    }

    const user = await auth?.verifyToken(readWebSocketSessionToken(request) ?? "");

    if (!user) {
      logger.warn("websocket.auth.rejected");
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Log in before connecting" } },
        { status: 401, headers: corsHeaders() },
      );
    }

    const userLimit = websocketUpgradeRateLimiter.consume(`user:${user.id}`);
    if (!userLimit.allowed) {
      metrics.increment("websocket.upgrade.rate_limited");
      logger.warn("websocket.upgrade.rate_limited", {
        userId: user.id,
        retryAfterSeconds: userLimit.retryAfterSeconds,
      });
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many websocket connection attempts" } },
        {
          status: 429,
          headers: { ...corsHeaders(), "retry-after": userLimit.retryAfterSeconds.toString() },
        },
      );
    }

    const existingSockets = userSockets.get(user.id)?.size ?? 0;
    if (existingSockets >= config.maxWebSocketConnectionsPerUser) {
      metrics.increment("websocket.upgrade.too_many_connections");
      logger.warn("websocket.upgrade.too_many_connections", {
        userId: user.id,
        sockets: existingSockets,
      });
      return Response.json(
        {
          error: { code: "TOO_MANY_CONNECTIONS", message: "Too many active websocket connections" },
        },
        { status: 429, headers: corsHeaders() },
      );
    }

    const upgraded = bunServer.upgrade(request, {
      data: {
        userId: user.id,
        username: user.username,
        connectionId: createSocketId("socket"),
        resumeRoomId: await readResumeRoomId(user.id, persistence),
        appearance: user.appearance,
        dollars: user.dollars,
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

  function unrefTimer(timer: RuntimeTimer): void {
    if (typeof timer === "object") {
      timer.unref?.();
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
    clearIntervalRef(botTimer);
    clearIntervalRef(rateLimiterPruneTimer);
    metrics.stopEventLoopMonitor();
    await server.stop(true);
    processRef.exit(0);
  }

  processRef.on("SIGINT", () => void shutdown("SIGINT"));
  processRef.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info("server.started", {
    host: config.host,
    port: server.port,
    persistence: Boolean(persistence),
  });

  return { config, server, shutdown };
}
