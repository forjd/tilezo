import { describe, expect, test } from "bun:test";

const decoder = new TextDecoder();

describe("stress-test CLI", () => {
  test("prints help without contacting the server", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = decoder.decode(result.stdout);

    expect(output).toContain("Usage: bun run stress -- [options]");
    expect(output).toContain("--duration <seconds>");
    expect(output).toContain("--seed <number>");
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

  test("rejects invalid timed-mode values before running load", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--duration", "-1"]);

    expect(result.exitCode).not.toBe(0);
    expect(decoder.decode(result.stderr)).toContain("--duration must be a non-negative number");
  });
});
