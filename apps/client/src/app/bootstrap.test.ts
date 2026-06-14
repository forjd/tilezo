import { describe, expect, test } from "bun:test";
import { bootstrapApp } from "./bootstrap";

describe("bootstrapApp", () => {
  test("loads runtime config before creating the app", async () => {
    const root = {} as HTMLElement;
    const events: string[] = [];

    await bootstrapApp({
      create(receivedRoot) {
        events.push("create");
        expect(receivedRoot).toBe(root);
      },
      document: documentDouble(root),
      async loadConfig() {
        events.push("load");
      },
    });

    expect(events).toEqual(["load", "create"]);
  });

  test("throws when the app root is missing", async () => {
    await expect(
      bootstrapApp({
        create() {},
        document: documentDouble(null),
        async loadConfig() {},
      }),
    ).rejects.toThrow("Missing #app root");
  });
});

function documentDouble(root: HTMLElement | null): Pick<Document, "querySelector"> {
  return {
    querySelector(selector: string) {
      expect(selector).toBe("#app");
      return root;
    },
  } as Pick<Document, "querySelector">;
}
