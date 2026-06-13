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
  maxRoomsPerUser: number;
  maxFriendsPerUser: number;
  maxAuthBodyBytes: number;
  trustProxy: boolean;
  metricsToken?: string;
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
export const DEFAULT_MAX_ROOMS_PER_USER = 50;
export const DEFAULT_MAX_FRIENDS_PER_USER = 500;
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
  const maxAuthBodyBytes = parsePositiveInteger(
    "MAX_AUTH_BODY_BYTES",
    env.MAX_AUTH_BODY_BYTES,
    DEFAULT_MAX_AUTH_BODY_BYTES,
  );
  const trustProxy = parseBoolean("TRUST_PROXY", env.TRUST_PROXY, false);
  const metricsToken = env.METRICS_TOKEN?.trim() || undefined;

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
    maxRoomsPerUser,
    maxFriendsPerUser,
    maxAuthBodyBytes,
    trustProxy,
    metricsToken,
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
