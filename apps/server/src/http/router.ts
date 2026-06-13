import { avatarAppearanceSchema } from "@tilezo/protocol";
import { AuthError, type AuthService, normalizeUsername } from "../auth/auth";
import type { FixedWindowRateLimiter } from "../auth/rateLimit";
import type { ServerConfig } from "../config";
import type { PersistenceStore } from "../db/persistence";
import { FriendError, type FriendService } from "../friends/friends";
import { DirectMessageError, type DirectMessageService } from "../messaging/messaging";
import type { Logger, LogLevel } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
import type { RoomManager } from "../rooms/RoomManager";
import {
  createRoomLayoutFromTemplate,
  listRoomCreationTemplates,
  parseCreateRoomInput,
} from "../rooms/roomCreation";
import { createId } from "../util/ids";

export type RouterDeps = {
  config: ServerConfig;
  logger: Logger;
  metrics: Metrics;
  auth?: AuthService;
  friends?: FriendService;
  directMessages?: DirectMessageService;
  persistence?: PersistenceStore;
  rooms: RoomManager;
  registerRateLimiter: FixedWindowRateLimiter;
  loginRateLimiter: FixedWindowRateLimiter;
  roomCreateRateLimiter: FixedWindowRateLimiter;
  friendRateLimiter: FixedWindowRateLimiter;
};

type RouteContext = RouterDeps & {
  request: Request;
  url: URL;
  clientKey: string;
  requestLogger: Logger;
};

type AuthMode = "login" | "register";

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Builds the HTTP request handler for every route except the WebSocket upgrade. The
 * handler is dependency-injected and free of `Bun.serve`, so it can be unit-tested with
 * plain `Request` objects and is visible to the coverage gate (unlike `index.ts`).
 */
export function createHttpRouter(
  deps: RouterDeps,
): (request: Request, clientKey: string) => Promise<Response> {
  return async function route(request: Request, clientKey: string): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") ?? createId("req");
    const requestLogger = deps.logger.child({
      requestId,
      method: request.method,
      path: url.pathname,
    });
    const ctx: RouteContext = { ...deps, request, url, clientKey, requestLogger };
    const response = await dispatch(ctx);
    // Set the final, origin-aware CORS headers (allowing credentialed cookie requests
    // from configured origins) on whatever the handler returned.
    applyCors(response, ctx);
    return response;
  };
}

async function dispatch(ctx: RouteContext): Promise<Response> {
  const { request, url, requestLogger, clientKey } = ctx;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (url.pathname === "/auth/session" && request.method === "GET") {
    return handleSessionRequest(ctx);
  }

  if (url.pathname === "/auth/register" && request.method === "POST") {
    const limited = enforceRateLimit(
      ctx,
      ctx.registerRateLimiter,
      clientKey,
      "auth.register.rate_limited",
      "Too many account registrations, try again shortly",
    );
    if (limited) {
      return limited;
    }
    return handleAuthRequest(ctx, "register");
  }

  if (url.pathname === "/auth/login" && request.method === "POST") {
    const limited = enforceRateLimit(
      ctx,
      ctx.loginRateLimiter,
      `ip:${clientKey}`,
      "auth.login.rate_limited",
      "Too many login attempts, try again shortly",
    );
    if (limited) {
      return limited;
    }
    return handleAuthRequest(ctx, "login");
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    return handleLogoutRequest(ctx);
  }

  if (url.pathname === "/me/appearance") {
    return handleAppearanceRequest(ctx);
  }

  if (url.pathname === "/client-events" && request.method === "POST") {
    return handleClientEventRequest(ctx);
  }

  if (
    url.pathname.startsWith("/friends/") &&
    url.pathname.endsWith("/messages") &&
    request.method === "GET"
  ) {
    return handleDirectMessageHistoryRequest(ctx);
  }

  if (url.pathname === "/friends" || url.pathname.startsWith("/friends/")) {
    return handleFriendsRequest(ctx);
  }

  if (url.pathname === "/room-templates" && request.method === "GET") {
    requestLogger.info("room_templates.listed");
    return authJson({ templates: listRoomCreationTemplates() }, 200);
  }

  if (url.pathname === "/rooms" && request.method === "POST") {
    return handleCreateRoomRequest(ctx);
  }

  if (url.pathname === "/health") {
    return Response.json({ ok: true }, { headers: corsHeaders() });
  }

  if (url.pathname === "/debug/metrics" && request.method === "GET") {
    if (!metricsAccessAllowed(ctx)) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    }
    // Operational endpoint: no wildcard CORS so arbitrary web origins cannot scrape it.
    return Response.json(ctx.metrics.snapshot(ctx.rooms.getMetrics()));
  }

  if (url.pathname === "/debug/metrics/reset" && request.method === "POST") {
    if (ctx.config.nodeEnv === "production") {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        { status: 404, headers: corsHeaders() },
      );
    }

    ctx.metrics.reset();
    requestLogger.info("metrics.reset");
    return Response.json({ ok: true }, { headers: corsHeaders() });
  }

  return new Response("Tilezo room server", {
    headers: {
      ...corsHeaders(),
      "content-type": "text/plain;charset=utf-8",
    },
  });
}

async function handleAuthRequest(ctx: RouteContext, mode: AuthMode): Promise<Response> {
  const { auth, requestLogger } = ctx;

  if (!auth) {
    requestLogger.warn("auth.database_required", { mode });
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for login" } },
      503,
    );
  }

  const body = await readJsonWithLimit(ctx.request, ctx.config.maxAuthBodyBytes);

  if (!body.ok) {
    return badBody(body.reason);
  }

  const { username, password } = body.value as { username?: unknown; password?: unknown };

  if (typeof username !== "string" || typeof password !== "string") {
    return authJson(
      { error: { code: "INVALID_AUTH_INPUT", message: "Username and password are required" } },
      400,
    );
  }

  if (mode === "login") {
    const limited = enforceRateLimit(
      ctx,
      ctx.loginRateLimiter,
      `user:${normalizeUsername(username)}`,
      "auth.login.rate_limited",
      "Too many login attempts, try again shortly",
    );
    if (limited) {
      return limited;
    }
  }

  try {
    const session =
      mode === "register"
        ? await auth.createUser(username, password)
        : await auth.login(username, password);

    requestLogger.info("auth.succeeded", { mode, userId: session.user.id });
    // Deliver the token only as an HttpOnly session cookie so the SPA never receives a
    // JS-readable bearer token in the response body.
    return authJson({ user: session.user }, mode === "register" ? 201 : 200, {
      "set-cookie": sessionCookie(session.token, ctx.config),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      requestLogger.warn("auth.failed", { mode, code: error.code });
      return authJson(
        { error: { code: error.code, message: error.message } },
        authStatus(error),
        authHeaders(error),
      );
    }

    // A non-AuthError here is an unexpected backend failure (e.g. database outage
    // surfaced by createUser). Surface it as 503 and log it instead of masking it.
    requestLogger.error("auth.unexpected_error", { mode, error });
    return authJson(
      {
        error: { code: "AUTH_UNAVAILABLE", message: "Authentication is temporarily unavailable" },
      },
      503,
    );
  }
}

async function handleLogoutRequest(ctx: RouteContext): Promise<Response> {
  const { auth, requestLogger } = ctx;

  if (!auth) {
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for logout" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (user) {
    await auth.logout(user.id);
    requestLogger.info("auth.logout", { userId: user.id });
  }

  // Idempotent: succeeds whether or not the token was still valid. Always clear the cookie.
  return authJson({ ok: true }, 200, { "set-cookie": clearedSessionCookie(ctx.config) });
}

async function handleSessionRequest(ctx: RouteContext): Promise<Response> {
  const { auth } = ctx;

  if (!auth) {
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for sessions" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (!user) {
    return authJson({ error: { code: "UNAUTHENTICATED", message: "Not signed in" } }, 401);
  }

  return authJson({ user }, 200);
}

async function handleAppearanceRequest(ctx: RouteContext): Promise<Response> {
  const { auth, requestLogger } = ctx;

  if (!auth) {
    requestLogger.warn("appearance.database_required");
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for profiles" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (!user) {
    requestLogger.warn("appearance.unauthenticated");
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before editing your character" } },
      401,
    );
  }

  if (ctx.request.method === "GET") {
    return authJson({ appearance: user.appearance }, 200);
  }

  if (ctx.request.method !== "PUT") {
    return authJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  }

  const body = await readJsonWithLimit(ctx.request, ctx.config.maxAuthBodyBytes);

  if (!body.ok) {
    return badBody(body.reason, "INVALID_APPEARANCE", "Invalid character appearance");
  }

  const parsed = avatarAppearanceSchema.safeParse(
    (body.value as { appearance?: unknown }).appearance,
  );

  if (!parsed.success) {
    return authJson(
      { error: { code: "INVALID_APPEARANCE", message: "Invalid character appearance" } },
      400,
    );
  }

  try {
    const updated = await auth.updateAppearance(user.id, parsed.data);
    requestLogger.info("appearance.updated", { userId: user.id });
    return authJson({ appearance: updated.appearance }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      requestLogger.warn("appearance.failed", { userId: user.id, code: error.code });
      return authJson({ error: { code: error.code, message: error.message } }, authStatus(error));
    }

    requestLogger.error("appearance.unexpected_error", { userId: user.id, error });
    return authJson(
      { error: { code: "APPEARANCE_UNAVAILABLE", message: "Unable to update character" } },
      503,
    );
  }
}

async function handleClientEventRequest(ctx: RouteContext): Promise<Response> {
  const { auth, requestLogger } = ctx;

  const body = await readJsonWithLimit(ctx.request, ctx.config.maxAuthBodyBytes);

  if (!body.ok) {
    return badBody(body.reason, "INVALID_CLIENT_EVENT", "Invalid client event");
  }

  const user = await auth?.verifyToken(readSessionToken(ctx.request) ?? "");
  const payload = body.value as { event?: unknown; fields?: unknown; level?: unknown };
  const eventName = sanitizeClientEventName(payload.event);
  const level = sanitizeClientLogLevel(payload.level);
  const fields = sanitizeClientFields(payload.fields);
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
}

async function handleFriendsRequest(ctx: RouteContext): Promise<Response> {
  const { auth, friends, requestLogger, url } = ctx;

  if (!auth || !friends) {
    requestLogger.warn("friends.database_required");
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for friends" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (!user) {
    requestLogger.warn("friends.unauthenticated");
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before managing friends" } },
      401,
    );
  }

  try {
    if (url.pathname === "/friends" && ctx.request.method === "GET") {
      return authJson({ friends: await friends.list(user.id) }, 200);
    }

    if (url.pathname === "/friends" && ctx.request.method === "POST") {
      const limited = enforceRateLimit(
        ctx,
        ctx.friendRateLimiter,
        `user:${user.id}`,
        "friends.rate_limited",
        "Too many friend requests, try again shortly",
      );
      if (limited) {
        return limited;
      }

      const body = await readJsonWithLimit(ctx.request, ctx.config.maxAuthBodyBytes);

      if (!body.ok) {
        return badBody(body.reason, "INVALID_FRIEND", "Friend username is required");
      }

      const username = (body.value as { username?: unknown }).username;

      if (typeof username !== "string" || !username.trim()) {
        return authJson(
          { error: { code: "INVALID_FRIEND", message: "Friend username is required" } },
          400,
        );
      }

      const friend = await friends.add(user.id, username);
      requestLogger.info("friends.added", { userId: user.id, friendUserId: friend.id });
      return authJson({ friend }, 201);
    }

    if (url.pathname.startsWith("/friends/") && ctx.request.method === "DELETE") {
      const friendUserId = decodeURIComponent(url.pathname.slice("/friends/".length));

      if (!friendUserId) {
        return authJson(
          { error: { code: "INVALID_FRIEND", message: "Friend id is required" } },
          400,
        );
      }

      await friends.remove(user.id, friendUserId);
      requestLogger.info("friends.removed", { userId: user.id, friendUserId });
      return authJson({ ok: true }, 200);
    }

    return authJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  } catch (error) {
    if (error instanceof FriendError) {
      return authJson({ error: { code: error.code, message: error.message } }, 400);
    }

    requestLogger.error("friends.failed", { userId: user.id, error });
    return authJson({ error: { code: "FRIENDS_FAILED", message: "Friends request failed" } }, 400);
  }
}

async function handleDirectMessageHistoryRequest(ctx: RouteContext): Promise<Response> {
  const { auth, directMessages, requestLogger, url } = ctx;

  if (!auth || !directMessages) {
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for messages" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (!user) {
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before reading messages" } },
      401,
    );
  }

  const friendId = decodeURIComponent(url.pathname.slice("/friends/".length, -"/messages".length));

  if (!friendId) {
    return authJson({ error: { code: "INVALID_FRIEND", message: "Friend id is required" } }, 400);
  }

  try {
    const requestedLimit = Number(url.searchParams.get("limit"));
    const messages = await directMessages.history(
      user.id,
      friendId,
      Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
    );
    return authJson({ messages }, 200);
  } catch (error) {
    if (error instanceof DirectMessageError) {
      return authJson({ error: { code: error.code, message: error.message } }, 400);
    }

    requestLogger.error("dm.history.failed", { userId: user.id, friendId, error });
    return authJson({ error: { code: "DM_FAILED", message: "Could not load messages" } }, 400);
  }
}

async function handleCreateRoomRequest(ctx: RouteContext): Promise<Response> {
  const { auth, persistence, rooms, requestLogger } = ctx;

  if (!auth || !persistence) {
    requestLogger.warn("room.create.database_required");
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required to create rooms" } },
      503,
    );
  }

  const user = await auth.verifyToken(readSessionToken(ctx.request) ?? "");

  if (!user) {
    requestLogger.warn("room.create.unauthenticated");
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before creating a room" } },
      401,
    );
  }

  const limited = enforceRateLimit(
    ctx,
    ctx.roomCreateRateLimiter,
    `user:${user.id}`,
    "room.create.rate_limited",
    "Too many rooms created, try again shortly",
  );
  if (limited) {
    return limited;
  }

  // Hard per-user cap on owned rooms so a single account cannot grow the rooms table
  // and the in-memory room directory without bound.
  const ownedRooms = (await persistence.listOwnedRooms?.(user.id)) ?? [];

  if (ownedRooms.length >= ctx.config.maxRoomsPerUser) {
    requestLogger.warn("room.create.limit_reached", {
      userId: user.id,
      ownedRooms: ownedRooms.length,
    });
    return authJson(
      {
        error: {
          code: "ROOM_LIMIT_REACHED",
          message: `You can own at most ${ctx.config.maxRoomsPerUser.toString()} rooms`,
        },
      },
      409,
    );
  }

  const body = await readJsonWithLimit(ctx.request, ctx.config.maxAuthBodyBytes);

  if (!body.ok) {
    return badBody(body.reason, "INVALID_ROOM", "Unable to create room");
  }

  try {
    const parsed = parseCreateRoomInput(body.value);

    if (!parsed.ok) {
      requestLogger.warn("room.create.invalid_input", { userId: user.id, message: parsed.message });
      return authJson({ error: { code: "INVALID_ROOM", message: parsed.message } }, 400);
    }

    const roomId = createId("room");
    const layout = createRoomLayoutFromTemplate(roomId, parsed.value);

    await persistence.seedRoom(layout, {
      ownerUserId: user.id,
      visibility: parsed.value.visibility,
      description: parsed.value.description,
      capacity: parsed.value.capacity,
      access: parsed.value.access,
    });
    rooms.addRoom(layout, {
      access: parsed.value.access,
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
    requestLogger.error("room.create.failed", { userId: user.id, error });
    return authJson({ error: { code: "INVALID_ROOM", message: "Unable to create room" } }, 400);
  }
}

function metricsAccessAllowed(ctx: RouteContext): boolean {
  if (ctx.config.nodeEnv !== "production") {
    return true;
  }

  const token = ctx.config.metricsToken;

  if (!token) {
    return false;
  }

  const provided = ctx.url.searchParams.get("token") ?? readBearerToken(ctx.request);
  return provided === token;
}

function enforceRateLimit(
  ctx: RouteContext,
  limiter: FixedWindowRateLimiter,
  key: string,
  counter: string,
  message: string,
): Response | undefined {
  const result = limiter.consume(key);

  if (result.allowed) {
    return undefined;
  }

  ctx.metrics.increment(counter);
  ctx.requestLogger.warn(counter, { retryAfterSeconds: result.retryAfterSeconds });
  return authJson({ error: { code: "RATE_LIMITED", message } }, 429, {
    "retry-after": result.retryAfterSeconds.toString(),
  });
}

async function readJsonWithLimit(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (Buffer.byteLength(text) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

function badBody(
  reason: "too_large" | "invalid_json",
  code = "INVALID_AUTH_INPUT",
  message = "Invalid authentication request",
): Response {
  if (reason === "too_large") {
    return authJson(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } },
      413,
    );
  }

  return authJson({ error: { code, message } }, 400);
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

export const SESSION_COOKIE_NAME = "tilezo_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  return scheme?.toLocaleLowerCase("en-US") === "bearer" ? token : undefined;
}

// Resolve the session token from the Authorization header (non-browser/API clients) or
// the HttpOnly session cookie (the SPA, which never stores the token in JS).
export function readSessionToken(request: Request): string | undefined {
  return readBearerToken(request) ?? readCookie(request, SESSION_COOKIE_NAME);
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");

  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function sessionCookie(token: string, config: { cookieSecure: boolean }): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS.toString()}`,
    ...(config.cookieSecure ? ["Secure"] : []),
  ].join("; ");
}

export function clearedSessionCookie(config: { cookieSecure: boolean }): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    ...(config.cookieSecure ? ["Secure"] : []),
  ].join("; ");
}

// Sets the final CORS headers on a response. Requests from a configured allowed origin get
// that exact origin echoed plus allow-credentials (required for cookie-bearing fetches);
// everyone else keeps the wildcard from `corsHeaders()` (which forbids credentials).
function applyCors(response: Response, ctx: RouteContext): void {
  const origin = ctx.request.headers.get("origin");

  if (origin && ctx.config.corsAllowedOrigins.includes(origin)) {
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("access-control-allow-credentials", "true");
    response.headers.append("vary", "origin");
  }
}

function authJson(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(), ...headers } });
}

export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "authorization,content-type,x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-origin": "*",
  };
}
