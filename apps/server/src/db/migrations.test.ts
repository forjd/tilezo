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

  test("has a chained metadata snapshot for every journal entry", async () => {
    const metaDirectory = new URL("./migrations/meta/", import.meta.url);
    const journal = (await Bun.file(new URL("_journal.json", metaDirectory)).json()) as {
      version: string;
      dialect: string;
      entries: { idx: number }[];
    };
    const snapshotFiles = (await readdir(metaDirectory))
      .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
      .sort();

    expect(snapshotFiles).toEqual(
      journal.entries.map((entry) => `${String(entry.idx).padStart(4, "0")}_snapshot.json`),
    );

    let previousId = "00000000-0000-0000-0000-000000000000";

    for (const entry of journal.entries) {
      const snapshot = (await Bun.file(
        new URL(`${String(entry.idx).padStart(4, "0")}_snapshot.json`, metaDirectory),
      ).json()) as {
        id: string;
        prevId: string;
        version: string;
        dialect: string;
      };

      expect(snapshot.version).toBe(journal.version);
      expect(snapshot.dialect).toBe(journal.dialect);
      expect(snapshot.prevId).toBe(previousId);
      previousId = snapshot.id;
    }
  });
});
