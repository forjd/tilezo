import { describe, expect, test } from "bun:test";
import { createDatabase, getDatabaseUrl } from "./db";

describe("database configuration", () => {
  test("reads database URLs from the environment", () => {
    expect(getDatabaseUrl({ DATABASE_URL: "postgres://localhost/tilezo" })).toBe(
      "postgres://localhost/tilezo",
    );
  });

  test("skips database creation without a URL", () => {
    expect(createDatabase(undefined)).toBeUndefined();
  });

  test("creates a drizzle database when a URL is configured", () => {
    expect(createDatabase("postgres://user:pass@localhost:5432/tilezo")).toBeDefined();
  });
});
