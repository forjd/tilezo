import type { ServerMessage } from "@tilezo/protocol";
import { avatarAppearanceSchema, MAX_RAW_MESSAGE_BYTES } from "@tilezo/protocol";
import { AuthError, AuthPasswordLimiter, AuthService, DrizzleAuthStore } from "./auth/auth";
import { getConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore, type PersistenceStore } from "./db/persistence";
import { handleClose, handleMessage, handleOpen } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { createLogger, type Logger, type LogLevel, parseLogLevel } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { RoomManager } from "./rooms/RoomManager";
import {
  createRoomLayoutFromTemplate,
  listRoomCreationTemplates,
  parseCreateRoomInput,
} from "./rooms/roomCreation";
import { createId } from "./util/ids";
import { encodeServerMessage } from "./util/safeJson";

const config = getConfig();
const logger = createLogger({
  service: "tilezo-server",
  level: parseLogLevel(Bun.env.LOG_LEVEL),
});
const metrics = new Metrics();
metrics.startEventLoopMonitor();
const database = createDatabase(config.databaseUrl);
const persistence = database ? new DrizzlePersistenceStore(database) : undefined;
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
const rooms = await RoomManager.create({ persistence });

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  async fetch(request, server) {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") ?? createId("req");
    const requestLogger = logger.child({
      requestId,
      method: request.method,
      path: url.pathname,
    });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/auth/register" && request.method === "POST") {
      return handleAuthRequest(request, auth, "register", requestLogger);
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      return handleAuthRequest(request, auth, "login", requestLogger);
    }

    if (url.pathname === "/me/appearance") {
      return handleAppearanceRequest(request, auth, requestLogger);
    }

    if (url.pathname === "/client-events" && request.method === "POST") {
      return handleClientEventRequest(request, auth, requestLogger);
    }

    if (url.pathname === "/room-templates" && request.method === "GET") {
      requestLogger.info("room_templates.listed");
      return authJson({ templates: listRoomCreationTemplates() }, 200);
    }

    if (url.pathname === "/rooms" && request.method === "POST") {
      return handleCreateRoomRequest(request, auth, persistence, rooms, requestLogger);
    }

    if (url.pathname === "/ws") {
      const user = await auth?.verifyToken(url.searchParams.get("token") ?? "");

      if (!user) {
        requestLogger.warn("websocket.auth.rejected");
        return Response.json(
          { error: { code: "UNAUTHENTICATED", message: "Log in before connecting" } },
          { status: 401, headers: corsHeaders() },
        );
      }

      const upgraded = server.upgrade(request, {
        data: {
          userId: user.id,
          username: user.username,
          connectionId: createId("socket"),
          resumeRoomId: await readResumeRoomId(user.id, persistence),
          appearance: user.appearance,
        },
      });

      if (upgraded) {
        requestLogger.info("websocket.upgraded", { userId: user.id });
        return undefined;
      }
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

    if (url.pathname === "/debug/metrics") {
      return Response.json(metrics.snapshot(rooms.getMetrics()), { headers: corsHeaders() });
    }

    return new Response("Tilezo room server", {
      headers: {
        ...corsHeaders(),
        "content-type": "text/plain;charset=utf-8",
      },
    });
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
        logger,
        metrics,
      });
    },
    message(ws, message) {
      if (typeof message === "string" || Buffer.isBuffer(message)) {
        handleMessage(ws, message, {
          rooms,
          publish,
          persistence,
          logger,
          metrics,
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
      handleClose(ws, rooms, publish, logger, metrics);
    },
  },
});

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

logger.info("server.started", {
  host: config.host,
  port: server.port,
  persistence: Boolean(persistence),
});

type AuthMode = "login" | "register";

async function handleAuthRequest(
  request: Request,
  authService: AuthService | undefined,
  mode: AuthMode,
  requestLogger: Logger,
): Promise<Response> {
  if (!authService) {
    requestLogger.warn("auth.database_required", { mode });
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for login" } },
      503,
    );
  }

  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };

    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return authJson(
        { error: { code: "INVALID_AUTH_INPUT", message: "Username and password are required" } },
        400,
      );
    }

    const session =
      mode === "register"
        ? await authService.createUser(body.username, body.password)
        : await authService.login(body.username, body.password);

    requestLogger.info("auth.succeeded", { mode, userId: session.user.id });

    return authJson(session, mode === "register" ? 201 : 200);
  } catch (error) {
    if (error instanceof AuthError) {
      requestLogger.warn("auth.failed", { mode, code: error.code });
      return authJson(
        { error: { code: error.code, message: error.message } },
        authStatus(error),
        authHeaders(error),
      );
    }

    requestLogger.warn("auth.invalid_request", { mode, error });
    return authJson(
      { error: { code: "INVALID_AUTH_INPUT", message: "Invalid authentication request" } },
      400,
    );
  }
}

async function handleAppearanceRequest(
  request: Request,
  authService: AuthService | undefined,
  requestLogger: Logger,
): Promise<Response> {
  if (!authService) {
    requestLogger.warn("appearance.database_required");
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for profiles" } },
      503,
    );
  }

  const user = await authService.verifyToken(readBearerToken(request) ?? "");

  if (!user) {
    requestLogger.warn("appearance.unauthenticated");
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before editing your character" } },
      401,
    );
  }

  if (request.method === "GET") {
    return authJson({ appearance: user.appearance }, 200);
  }

  if (request.method !== "PUT") {
    return authJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  }

  try {
    const body = (await request.json()) as { appearance?: unknown };
    const parsed = avatarAppearanceSchema.safeParse(body.appearance);

    if (!parsed.success) {
      return authJson(
        { error: { code: "INVALID_APPEARANCE", message: "Invalid character appearance" } },
        400,
      );
    }

    const updated = await authService.updateAppearance(user.id, parsed.data);
    requestLogger.info("appearance.updated", { userId: user.id });
    return authJson({ appearance: updated.appearance }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      requestLogger.warn("appearance.failed", { userId: user.id, code: error.code });
      return authJson({ error: { code: error.code, message: error.message } }, authStatus(error));
    }

    requestLogger.warn("appearance.invalid_request", { userId: user.id, error });
    return authJson(
      { error: { code: "INVALID_APPEARANCE", message: "Invalid character appearance" } },
      400,
    );
  }
}

async function handleClientEventRequest(
  request: Request,
  authService: AuthService | undefined,
  requestLogger: Logger,
): Promise<Response> {
  try {
    const user = await authService?.verifyToken(readBearerToken(request) ?? "");
    const body = (await request.json()) as {
      event?: unknown;
      fields?: unknown;
      level?: unknown;
    };
    const eventName = sanitizeClientEventName(body.event);
    const level = sanitizeClientLogLevel(body.level);
    const fields = sanitizeClientFields(body.fields);
    const logFields = {
      ...fields,
      userId: user?.id,
    };

    if (level === "debug") {
      requestLogger.debug(`client.${eventName}`, logFields);
    } else if (level === "warn") {
      requestLogger.warn(`client.${eventName}`, logFields);
    } else if (level === "error") {
      requestLogger.error(`client.${eventName}`, logFields);
    } else {
      requestLogger.info(`client.${eventName}`, logFields);
    }

    return authJson({ ok: true }, 202);
  } catch (error) {
    requestLogger.warn("client_event.invalid_request", { error });
    return authJson(
      { error: { code: "INVALID_CLIENT_EVENT", message: "Invalid client event" } },
      400,
    );
  }
}

async function handleCreateRoomRequest(
  request: Request,
  authService: AuthService | undefined,
  persistenceStore: PersistenceStore | undefined,
  roomManager: RoomManager,
  requestLogger: Logger,
): Promise<Response> {
  if (!authService || !persistenceStore) {
    requestLogger.warn("room.create.database_required");
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required to create rooms" } },
      503,
    );
  }

  const user = await authService.verifyToken(readBearerToken(request) ?? "");

  if (!user) {
    requestLogger.warn("room.create.unauthenticated");
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before creating a room" } },
      401,
    );
  }

  try {
    const parsed = parseCreateRoomInput(await request.json());

    if (!parsed.ok) {
      requestLogger.warn("room.create.invalid_input", { userId: user.id, message: parsed.message });
      return authJson({ error: { code: "INVALID_ROOM", message: parsed.message } }, 400);
    }

    const roomId = createId("room");
    const layout = createRoomLayoutFromTemplate(roomId, parsed.value);

    await persistenceStore.seedRoom(layout, {
      ownerUserId: user.id,
      visibility: parsed.value.visibility,
      description: parsed.value.description,
      capacity: parsed.value.capacity,
      access: parsed.value.access,
    });
    roomManager.addRoom(layout, {
      ownerUserId: user.id,
      visibility: parsed.value.visibility,
    });
    requestLogger.info("room.created", {
      userId: user.id,
      roomId,
      templateId: parsed.value.templateId,
      visibility: parsed.value.visibility,
      access: parsed.value.access,
      capacity: parsed.value.capacity,
    });

    return authJson(
      {
        roomId,
        room: {
          id: roomId,
          name: parsed.value.name,
          userCount: 0,
          joined: false,
        },
      },
      201,
    );
  } catch (error) {
    requestLogger.warn("room.create.failed", { userId: user.id, error });
    return authJson({ error: { code: "INVALID_ROOM", message: "Unable to create room" } }, 400);
  }
}

function sanitizeClientEventName(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown";
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return "unknown";
  }

  return trimmed.replace(/[^a-z0-9_.:-]/g, "_").slice(0, 96);
}

function sanitizeClientLogLevel(value: unknown): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error"
    ? value
    : "info";
}

function sanitizeClientFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const fields: Record<string, unknown> = {};

  for (const [key, fieldValue] of Object.entries(value).slice(0, 20)) {
    if (fieldValue === undefined) {
      continue;
    }

    fields[key.slice(0, 64)] =
      typeof fieldValue === "string" ? fieldValue.slice(0, 240) : fieldValue;
  }

  return fields;
}

function authStatus(error: AuthError): number {
  if (error.code === "AUTH_BUSY") {
    return 429;
  }

  if (error.code === "USERNAME_TAKEN") {
    return 409;
  }

  if (error.code === "INVALID_CREDENTIALS") {
    return 401;
  }

  if (error.code === "USER_NOT_FOUND") {
    return 404;
  }

  return 400;
}

function authHeaders(error: AuthError): Record<string, string> {
  return error.code === "AUTH_BUSY" ? { "retry-after": "1" } : {};
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  return scheme?.toLocaleLowerCase("en-US") === "bearer" ? token : undefined;
}

function authJson(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(), ...headers } });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "authorization,content-type,x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-origin": "*",
  };
}
