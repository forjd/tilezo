import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { basename } from "node:path";

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

describe("migration journal", () => {
  test("tracks every SQL migration file", async () => {
    const migrationDirectory = new URL("./migrations/", import.meta.url);
    const journal = (await Bun.file(
      new URL("./migrations/meta/_journal.json", import.meta.url),
    ).json()) as {
      entries: { tag: string }[];
    };
    const migrationTags = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .map((file) => basename(file, ".sql"))
      .sort();
    const journalTags = journal.entries.map((entry) => entry.tag).sort();

    expect(journalTags).toEqual(migrationTags);
  });
});
