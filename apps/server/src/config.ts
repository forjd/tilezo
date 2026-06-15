import { availableParallelism } from "node:os";

export type ServerConfig = {
  host: string;
  port: number;
  databaseUrl?: string;
  authSecret: string;
  authPasswordConcurrency: number;
  authPasswordQueueLimit: number;
  authPasswordWaitTimeoutMs: number;
  authRegisterRateLimitMax: number;
  authRegisterRateLimitWindowMs: number;
  authLoginRateLimitMax: number;
  authLoginRateLimitWindowMs: number;
  roomCreateRateLimitMax: number;
  roomCreateRateLimitWindowMs: number;
  friendRateLimitMax: number;
  friendRateLimitWindowMs: number;
  clientEventRateLimitMax: number;
  clientEventRateLimitWindowMs: number;
  inventoryPurchaseRateLimitMax: number;
  inventoryPurchaseRateLimitWindowMs: number;
  websocketUpgradeRateLimitMax: number;
  websocketUpgradeRateLimitWindowMs: number;
  maxRoomsPerUser: number;
  maxFriendsPerUser: number;
  maxBlockedUsersPerUser: number;
  maxWebSocketConnectionsPerUser: number;
  maxAuthBodyBytes: number;
  trustProxy: boolean;
  metricsToken?: string;
  corsAllowedOrigins: string[];
  cookieSecure: boolean;
  nodeEnv: string;
};

export const DEFAULT_AUTH_PASSWORD_CONCURRENCY = Math.max(
  1,
  Math.min(12, availableParallelism() - 1),
);
export const DEFAULT_AUTH_PASSWORD_QUEUE_LIMIT = DEFAULT_AUTH_PASSWORD_CONCURRENCY * 32;
export const DEFAULT_AUTH_PASSWORD_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_ROOM_CREATE_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_FRIEND_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_CLIENT_EVENT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_INVENTORY_PURCHASE_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_WEBSOCKET_UPGRADE_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_MAX_ROOMS_PER_USER = 50;
export const DEFAULT_MAX_FRIENDS_PER_USER = 500;
export const DEFAULT_MAX_BLOCKED_USERS_PER_USER = 500;
export const DEFAULT_MAX_WEBSOCKET_CONNECTIONS_PER_USER = 5;
export const DEFAULT_MAX_AUTH_BODY_BYTES = 4 * 1024;

// Placeholder secrets that must never be accepted in production even if long enough.
const WEAK_SECRET_PATTERN = /change.?me|placeholder|example|^password|^secret|tilezo-development/i;

export function getConfig(env = Bun.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";
  const port = Number(env.PORT ?? 3000);
  const authSecret = env.AUTH_SECRET ?? "tilezo-development-secret";
  const databaseUrl = env.DATABASE_URL;
  const authPasswordConcurrency = parsePositiveInteger(
    "AUTH_PASSWORD_CONCURRENCY",
    env.AUTH_PASSWORD_CONCURRENCY,
    DEFAULT_AUTH_PASSWORD_CONCURRENCY,
  );
  const authPasswordQueueLimit = parseNonNegativeInteger(
    "AUTH_PASSWORD_QUEUE_LIMIT",
    env.AUTH_PASSWORD_QUEUE_LIMIT,
    DEFAULT_AUTH_PASSWORD_QUEUE_LIMIT,
  );
  const authPasswordWaitTimeoutMs = parsePositiveInteger(
    "AUTH_PASSWORD_WAIT_TIMEOUT_MS",
    env.AUTH_PASSWORD_WAIT_TIMEOUT_MS,
    DEFAULT_AUTH_PASSWORD_WAIT_TIMEOUT_MS,
  );
  const authRegisterRateLimitWindowMs = parsePositiveInteger(
    "AUTH_REGISTER_RATE_LIMIT_WINDOW_MS",
    env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
    DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
  );
  const authRegisterRateLimitMax = parsePositiveInteger(
    "AUTH_REGISTER_RATE_LIMIT_MAX",
    env.AUTH_REGISTER_RATE_LIMIT_MAX,
    isProduction ? 30 : 1000,
  );
  const authLoginRateLimitWindowMs = parsePositiveInteger(
    "AUTH_LOGIN_RATE_LIMIT_WINDOW_MS",
    env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
    DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
  );
  const authLoginRateLimitMax = parsePositiveInteger(
    "AUTH_LOGIN_RATE_LIMIT_MAX",
    env.AUTH_LOGIN_RATE_LIMIT_MAX,
    isProduction ? 10 : 1000,
  );
  const roomCreateRateLimitWindowMs = parsePositiveInteger(
    "ROOM_CREATE_RATE_LIMIT_WINDOW_MS",
    env.ROOM_CREATE_RATE_LIMIT_WINDOW_MS,
    DEFAULT_ROOM_CREATE_RATE_LIMIT_WINDOW_MS,
  );
  const roomCreateRateLimitMax = parsePositiveInteger(
    "ROOM_CREATE_RATE_LIMIT_MAX",
    env.ROOM_CREATE_RATE_LIMIT_MAX,
    isProduction ? 20 : 1000,
  );
  const friendRateLimitWindowMs = parsePositiveInteger(
    "FRIEND_RATE_LIMIT_WINDOW_MS",
    env.FRIEND_RATE_LIMIT_WINDOW_MS,
    DEFAULT_FRIEND_RATE_LIMIT_WINDOW_MS,
  );
  const friendRateLimitMax = parsePositiveInteger(
    "FRIEND_RATE_LIMIT_MAX",
    env.FRIEND_RATE_LIMIT_MAX,
    isProduction ? 60 : 1000,
  );
  const clientEventRateLimitWindowMs = parsePositiveInteger(
    "CLIENT_EVENT_RATE_LIMIT_WINDOW_MS",
    env.CLIENT_EVENT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_CLIENT_EVENT_RATE_LIMIT_WINDOW_MS,
  );
  const clientEventRateLimitMax = parsePositiveInteger(
    "CLIENT_EVENT_RATE_LIMIT_MAX",
    env.CLIENT_EVENT_RATE_LIMIT_MAX,
    isProduction ? 120 : 1000,
  );
  const inventoryPurchaseRateLimitWindowMs = parsePositiveInteger(
    "INVENTORY_PURCHASE_RATE_LIMIT_WINDOW_MS",
    env.INVENTORY_PURCHASE_RATE_LIMIT_WINDOW_MS,
    DEFAULT_INVENTORY_PURCHASE_RATE_LIMIT_WINDOW_MS,
  );
  const inventoryPurchaseRateLimitMax = parsePositiveInteger(
    "INVENTORY_PURCHASE_RATE_LIMIT_MAX",
    env.INVENTORY_PURCHASE_RATE_LIMIT_MAX,
    isProduction ? 30 : 1000,
  );
  const websocketUpgradeRateLimitWindowMs = parsePositiveInteger(
    "WEBSOCKET_UPGRADE_RATE_LIMIT_WINDOW_MS",
    env.WEBSOCKET_UPGRADE_RATE_LIMIT_WINDOW_MS,
    DEFAULT_WEBSOCKET_UPGRADE_RATE_LIMIT_WINDOW_MS,
  );
  const websocketUpgradeRateLimitMax = parsePositiveInteger(
    "WEBSOCKET_UPGRADE_RATE_LIMIT_MAX",
    env.WEBSOCKET_UPGRADE_RATE_LIMIT_MAX,
    isProduction ? 20 : 1000,
  );
  const maxRoomsPerUser = parsePositiveInteger(
    "MAX_ROOMS_PER_USER",
    env.MAX_ROOMS_PER_USER,
    DEFAULT_MAX_ROOMS_PER_USER,
  );
  const maxFriendsPerUser = parsePositiveInteger(
    "MAX_FRIENDS_PER_USER",
    env.MAX_FRIENDS_PER_USER,
    DEFAULT_MAX_FRIENDS_PER_USER,
  );
  const maxBlockedUsersPerUser = parsePositiveInteger(
    "MAX_BLOCKED_USERS_PER_USER",
    env.MAX_BLOCKED_USERS_PER_USER,
    DEFAULT_MAX_BLOCKED_USERS_PER_USER,
  );
  const maxWebSocketConnectionsPerUser = parsePositiveInteger(
    "MAX_WEBSOCKET_CONNECTIONS_PER_USER",
    env.MAX_WEBSOCKET_CONNECTIONS_PER_USER,
    DEFAULT_MAX_WEBSOCKET_CONNECTIONS_PER_USER,
  );
  const maxAuthBodyBytes = parsePositiveInteger(
    "MAX_AUTH_BODY_BYTES",
    env.MAX_AUTH_BODY_BYTES,
    DEFAULT_MAX_AUTH_BODY_BYTES,
  );
  const trustProxy = parseBoolean("TRUST_PROXY", env.TRUST_PROXY, false);
  const metricsToken = env.METRICS_TOKEN?.trim() || undefined;
  // Origins permitted to make credentialed (cookie-bearing) cross-origin requests. The
  // dev client runs on :3001 against the API on :3000, so those are the defaults.
  const corsAllowedOrigins = (
    env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Session cookies are marked Secure in production (HTTPS); dev runs over plain HTTP.
  const cookieSecure = parseBoolean("COOKIE_SECURE", env.COOKIE_SECURE, isProduction);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  if (isProduction) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in production");
    }

    if (!env.AUTH_SECRET || authSecret.length < 32 || WEAK_SECRET_PATTERN.test(authSecret)) {
      throw new Error("AUTH_SECRET must be set to a strong production secret");
    }
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    databaseUrl,
    authSecret,
    authPasswordConcurrency,
    authPasswordQueueLimit,
    authPasswordWaitTimeoutMs,
    authRegisterRateLimitMax,
    authRegisterRateLimitWindowMs,
    authLoginRateLimitMax,
    authLoginRateLimitWindowMs,
    roomCreateRateLimitMax,
    roomCreateRateLimitWindowMs,
    friendRateLimitMax,
    friendRateLimitWindowMs,
    clientEventRateLimitMax,
    clientEventRateLimitWindowMs,
    inventoryPurchaseRateLimitMax,
    inventoryPurchaseRateLimitWindowMs,
    websocketUpgradeRateLimitMax,
    websocketUpgradeRateLimitWindowMs,
    maxRoomsPerUser,
    maxFriendsPerUser,
    maxBlockedUsersPerUser,
    maxWebSocketConnectionsPerUser,
    maxAuthBodyBytes,
    trustProxy,
    metricsToken,
    corsAllowedOrigins,
    cookieSecure,
    nodeEnv,
  };
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`${name} must be a boolean (true/false)`);
}
