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
  nodeEnv: string;
};

export const DEFAULT_AUTH_PASSWORD_CONCURRENCY = Math.max(
  1,
  Math.min(12, availableParallelism() - 1),
);
export const DEFAULT_AUTH_PASSWORD_QUEUE_LIMIT = DEFAULT_AUTH_PASSWORD_CONCURRENCY * 32;
export const DEFAULT_AUTH_PASSWORD_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW_MS = 60_000;

export function getConfig(env = Bun.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
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
    nodeEnv === "production" ? 30 : 1000,
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  if (nodeEnv === "production") {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in production");
    }

    if (!env.AUTH_SECRET || authSecret === "tilezo-development-secret" || authSecret.length < 32) {
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
