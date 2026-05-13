import { describe, expect, test } from "bun:test";
import { parseArgs, summarizeResults } from "./stress-test";

describe("parseArgs", () => {
  test("parses stress test CLI options", () => {
    const options = parseArgs([
      "--api",
      "http://localhost:4000",
      "--ws=ws://localhost:4000/ws",
      "--bots",
      "100",
      "--concurrency",
      "25",
      "--scenario",
      "chat",
      "--username-prefix",
      "load",
      "--password",
      "secret",
      "--room",
      "studio",
      "--moves",
      "3",
      "--messages",
      "4",
    ]);

    expect(options).toMatchObject({
      apiUrl: "http://localhost:4000",
      wsUrl: "ws://localhost:4000/ws",
      bots: 100,
      concurrency: 25,
      scenario: "chat",
      usernamePrefix: "load",
      password: "secret",
      roomId: "studio",
      moves: 3,
      messages: 4,
    });
  });

  test("caps concurrency at the bot count and rejects invalid scenarios", () => {
    expect(parseArgs(["--bots", "2", "--concurrency", "10"]).concurrency).toBe(2);
    expect(() => parseArgs(["--scenario", "inventory"])).toThrow(
      "--scenario must be one of auth, room, movement, chat, full",
    );
  });
});

describe("summarizeResults", () => {
  test("counts failures and calculates average and p95 timings", () => {
    const summary = summarizeResults([
      {
        botId: 1,
        username: "load_1",
        ok: true,
        timings: { total: 100 },
      },
      {
        botId: 2,
        username: "load_2",
        ok: false,
        timings: { total: 300 },
        error: "failed",
      },
      {
        botId: 3,
        username: "load_3",
        ok: true,
        timings: { total: 200 },
      },
    ]);

    expect(summary).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      averageMs: 200,
      p95Ms: 300,
    });
  });
});
