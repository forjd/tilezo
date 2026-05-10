import { describe, expect, test } from "bun:test";

describe("user auth migration", () => {
  test("removes duplicate legacy username keys before adding the unique constraint", async () => {
    const migration = await Bun.file(
      new URL("./migrations/0001_green_edwin_jarvis.sql", import.meta.url),
    ).text();

    const deleteDuplicatesIndex = migration.indexOf('DELETE FROM "users"');
    const uniqueConstraintIndex = migration.indexOf('ADD CONSTRAINT "users_username_key_unique"');

    expect(deleteDuplicatesIndex).toBeGreaterThan(-1);
    expect(deleteDuplicatesIndex).toBeLessThan(uniqueConstraintIndex);
  });
});
