import { describe, expect, test } from "bun:test";
import { parseArgs, parseStressSummary } from "./benchmark";

describe("benchmark CLI", () => {
  test("applies standard defaults", () => {
    expect(parseArgs([])).toMatchObject({
      authBots: 100,
      cleanupAfter: true,
      profile: "standard",
      roomBots: 500,
      roomDurationSeconds: 60,
    });
  });

  test("applies quick profile defaults unless explicitly overridden", () => {
    expect(parseArgs(["--profile", "quick"])).toMatchObject({
      authBots: 25,
      roomBots: 50,
      roomDurationSeconds: 10,
    });
    expect(parseArgs(["--profile", "quick", "--room-bots", "75"])).toMatchObject({
      authBots: 25,
      roomBots: 75,
      roomDurationSeconds: 10,
    });
  });

  test("rejects invalid profile and numeric values", () => {
    expect(() => parseArgs(["--profile", "slow"])).toThrow("--profile must be quick or standard");
    expect(() => parseArgs(["--room-bots", "0"])).toThrow("--room-bots must be a positive integer");
  });

  test("parses stress summaries and latency rows", () => {
    expect(
      parseStressSummary(`Tilezo stress test
Scenario: full
Bots: 100 (99 ok, 1 failed)
Actions: 900 moves, 180 messages
Average: 1100.5ms
P95: 1500.7ms
Latency (ms):
operation          count      avg      p50      p95      p99      max
move.request        900      1.2      1.0      2.5      3.0      5.0
`),
    ).toEqual({
      actions: { moves: 900, messages: 180 },
      averageMs: 1100.5,
      bots: { total: 100, succeeded: 99, failed: 1 },
      operations: {
        "move.request": {
          averageMs: 1.2,
          count: 900,
          maxMs: 5,
          p50Ms: 1,
          p95Ms: 2.5,
          p99Ms: 3,
        },
      },
      p95Ms: 1500.7,
    });
  });
});
