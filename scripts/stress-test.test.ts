import { describe, expect, test } from "bun:test";
import { parseArgs } from "./stress-test";

const decoder = new TextDecoder();

describe("stress-test CLI", () => {
  test("prints help without contacting the server", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = decoder.decode(result.stdout);

    expect(output).toContain("Usage: bun run stress -- [options]");
    expect(output).toContain("--duration <seconds>");
    expect(output).toContain("--preseed-users");
    expect(output).toContain("--request-timeout-ms <ms>");
    expect(output).toContain("--setup-concurrency <n>");
    expect(output).toContain("--seed <number>");
  });

  test("parses preseed setup options", () => {
    const options = parseArgs([
      "--bots",
      "3",
      "--concurrency",
      "9",
      "--preseed-users",
      "--setup-concurrency",
      "2",
    ]);

    expect(options.bots).toBe(3);
    expect(options.concurrency).toBe(3);
    expect(options.preseedUsers).toBe(true);
    expect(options.setupConcurrency).toBe(2);
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

  test("rejects invalid preseed flag values before running load", () => {
    expect(() => parseArgs(["--preseed-users=maybe"])).toThrow(
      "--preseed-users must be true or false",
    );
  });
});
