import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { basename } from "node:path";

describe("user auth migration", () => {
  test("fails safely instead of deleting duplicate legacy username rows", async () => {
    const migration = await Bun.file(
      new URL("./migrations/0001_green_edwin_jarvis.sql", import.meta.url),
    ).text();

    const duplicateGuardIndex = migration.indexOf("Cannot add users_username_key_unique");
    const uniqueConstraintIndex = migration.indexOf('ADD CONSTRAINT "users_username_key_unique"');

    expect(migration).not.toContain('DELETE FROM "users"');
    expect(duplicateGuardIndex).toBeGreaterThan(-1);
    expect(duplicateGuardIndex).toBeLessThan(uniqueConstraintIndex);
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

  test("records check constraints introduced by manual SQL migrations", async () => {
    const metaDirectory = new URL("./migrations/meta/", import.meta.url);
    const friendshipSnapshot = (await Bun.file(
      new URL("0007_snapshot.json", metaDirectory),
    ).json()) as MigrationSnapshot;
    const directMessageSnapshot = (await Bun.file(
      new URL("0009_snapshot.json", metaDirectory),
    ).json()) as MigrationSnapshot;
    const requestSnapshot = (await Bun.file(
      new URL("0010_snapshot.json", metaDirectory),
    ).json()) as MigrationSnapshot;

    expect(
      friendshipSnapshot.tables["public.friendships"]?.checkConstraints.friendships_no_self_check,
    ).toEqual({
      name: "friendships_no_self_check",
      value: '"friendships"."user_id" <> "friendships"."friend_user_id"',
    });
    expect(
      directMessageSnapshot.tables["public.direct_messages"]?.checkConstraints
        .direct_messages_no_self_check,
    ).toEqual({
      name: "direct_messages_no_self_check",
      value: '"direct_messages"."sender_user_id" <> "direct_messages"."recipient_user_id"',
    });
    expect(
      requestSnapshot.tables["public.friendships"]?.checkConstraints.friendships_status_check,
    ).toEqual({
      name: "friendships_status_check",
      value: "\"friendships\".\"status\" IN ('pending', 'accepted')",
    });
  });
});

type MigrationSnapshot = {
  tables: Record<
    string,
    {
      checkConstraints: Record<string, { name: string; value: string }>;
    }
  >;
};
