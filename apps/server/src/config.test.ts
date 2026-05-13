import { describe, expect, test } from "bun:test";
import { getConfig } from "./config";

describe("getConfig", () => {
  test("uses Docker-friendly host and local defaults", () => {
    expect(getConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      databaseUrl: undefined,
      authSecret: "tilezo-development-secret",
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
        NODE_ENV: "production",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: "postgres://postgres:postgres@localhost:5432/tilezo",
      authSecret: "0123456789abcdef0123456789abcdef",
      nodeEnv: "production",
    });
  });

  test("rejects invalid ports", () => {
    expect(() => getConfig({ PORT: "nan" })).toThrow("PORT must be an integer");
    expect(() => getConfig({ PORT: "70000" })).toThrow("PORT must be an integer");
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
