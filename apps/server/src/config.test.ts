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
        AUTH_SECRET: "secret",
        NODE_ENV: "production",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: "postgres://postgres:postgres@localhost:5432/tilezo",
      authSecret: "secret",
      nodeEnv: "production",
    });
  });
});
