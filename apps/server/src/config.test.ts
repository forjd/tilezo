import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_PASSWORD_CONCURRENCY,
  DEFAULT_AUTH_PASSWORD_QUEUE_LIMIT,
  DEFAULT_AUTH_PASSWORD_WAIT_TIMEOUT_MS,
  DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
  getConfig,
} from "./config";

describe("getConfig", () => {
  test("uses Docker-friendly host and local defaults", () => {
    expect(getConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      databaseUrl: undefined,
      authSecret: "tilezo-development-secret",
      authPasswordConcurrency: DEFAULT_AUTH_PASSWORD_CONCURRENCY,
      authPasswordQueueLimit: DEFAULT_AUTH_PASSWORD_QUEUE_LIMIT,
      authPasswordWaitTimeoutMs: DEFAULT_AUTH_PASSWORD_WAIT_TIMEOUT_MS,
      authRegisterRateLimitMax: 1000,
      authRegisterRateLimitWindowMs: DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
      nodeEnv: "development",
    });
  });

  test("reads server environment overrides", () => {
    expect(
      getConfig({
        HOST: "127.0.0.1",
        PORT: "4000",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/tilezo",
        AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        AUTH_PASSWORD_CONCURRENCY: "2",
        AUTH_PASSWORD_QUEUE_LIMIT: "8",
        AUTH_PASSWORD_WAIT_TIMEOUT_MS: "1500",
        AUTH_REGISTER_RATE_LIMIT_MAX: "12",
        AUTH_REGISTER_RATE_LIMIT_WINDOW_MS: "30000",
        NODE_ENV: "production",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: "postgres://postgres:postgres@localhost:5432/tilezo",
      authSecret: "0123456789abcdef0123456789abcdef",
      authPasswordConcurrency: 2,
      authPasswordQueueLimit: 8,
      authPasswordWaitTimeoutMs: 1500,
      authRegisterRateLimitMax: 12,
      authRegisterRateLimitWindowMs: 30000,
      nodeEnv: "production",
    });
  });

  test("rejects invalid ports", () => {
    expect(() => getConfig({ PORT: "nan" })).toThrow("PORT must be an integer");
    expect(() => getConfig({ PORT: "70000" })).toThrow("PORT must be an integer");
  });

  test("rejects invalid auth password backpressure settings", () => {
    expect(() => getConfig({ AUTH_PASSWORD_CONCURRENCY: "0" })).toThrow(
      "AUTH_PASSWORD_CONCURRENCY must be a positive integer",
    );
    expect(() => getConfig({ AUTH_PASSWORD_QUEUE_LIMIT: "-1" })).toThrow(
      "AUTH_PASSWORD_QUEUE_LIMIT must be a non-negative integer",
    );
    expect(() => getConfig({ AUTH_PASSWORD_WAIT_TIMEOUT_MS: "0" })).toThrow(
      "AUTH_PASSWORD_WAIT_TIMEOUT_MS must be a positive integer",
    );
    expect(() => getConfig({ AUTH_REGISTER_RATE_LIMIT_MAX: "0" })).toThrow(
      "AUTH_REGISTER_RATE_LIMIT_MAX must be a positive integer",
    );
    expect(() => getConfig({ AUTH_REGISTER_RATE_LIMIT_WINDOW_MS: "0" })).toThrow(
      "AUTH_REGISTER_RATE_LIMIT_WINDOW_MS must be a positive integer",
    );
  });

  test("requires production database and strong auth secret", () => {
    expect(() => getConfig({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required in production",
    );
    expect(() =>
      getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/tilezo",
        AUTH_SECRET: "short",
      }),
    ).toThrow("AUTH_SECRET must be set to a strong production secret");
  });
});
