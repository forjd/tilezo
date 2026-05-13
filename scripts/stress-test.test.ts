import { describe, expect, test } from "bun:test";

const decoder = new TextDecoder();

describe("stress-test CLI", () => {
  test("prints help without contacting the server", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(decoder.decode(result.stdout)).toContain("Usage: bun run stress -- [options]");
  });

  test("rejects invalid scenarios before running load", () => {
    const result = Bun.spawnSync([
      "bun",
      "run",
      "scripts/stress-test.ts",
      "--scenario",
      "inventory",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(decoder.decode(result.stderr)).toContain(
      "--scenario must be one of auth, room, movement, chat, full",
    );
  });
});
