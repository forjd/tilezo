import { describe, expect, test } from "bun:test";
import { createLogger, type LogEntry, parseLogLevel } from "./logger";

describe("Logger", () => {
  test("writes structured entries with inherited fields", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      service: "server",
      level: "debug",
      fields: { requestId: "req_1" },
      now: () => new Date("2026-05-13T20:00:00.000Z"),
      sink(entry) {
        entries.push(entry);
      },
    });

    logger.child({ userId: "user_1" }).info("room.joined", {
      roomId: "lobby",
      ignored: undefined,
    });

    expect(entries).toEqual([
      {
        timestamp: "2026-05-13T20:00:00.000Z",
        level: "info",
        service: "server",
        event: "room.joined",
        fields: {
          requestId: "req_1",
          userId: "user_1",
          roomId: "lobby",
        },
      },
    ]);
  });

  test("filters entries below the configured level", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      level: "warn",
      sink(entry) {
        entries.push(entry);
      },
    });

    logger.info("quiet");
    logger.warn("visible");

    expect(entries.map((entry) => entry.event)).toEqual(["visible"]);
  });
});

describe("parseLogLevel", () => {
  test("accepts supported levels and falls back to info", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("warn")).toBe("warn");
    expect(parseLogLevel("verbose")).toBe("info");
    expect(parseLogLevel(undefined)).toBe("info");
  });
});
