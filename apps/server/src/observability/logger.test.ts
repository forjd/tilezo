import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createLogger, type LogEntry, parseLogLevel } from "./logger";

describe("Logger", () => {
  afterEach(() => {
    (console.log as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

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

  test("writes default console entries by severity and sanitizes errors", () => {
    const logs: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));
    spyOn(console, "warn").mockImplementation((line) => warnings.push(String(line)));
    spyOn(console, "error").mockImplementation((line) => errors.push(String(line)));
    const logger = createLogger({
      level: "debug",
      now: () => new Date("2026-05-13T20:00:00.000Z"),
    });

    logger.debug("debug.visible");
    logger.warn("warn.visible");
    logger.error("error.visible", { error: new Error("boom") });

    expect(logs.map((line) => JSON.parse(line).event)).toEqual(["debug.visible"]);
    expect(warnings.map((line) => JSON.parse(line).event)).toEqual(["warn.visible"]);
    const parsedError = JSON.parse(errors[0] ?? "") as LogEntry;
    expect(parsedError.event).toBe("error.visible");
    expect(parsedError.fields.error).toMatchObject({ name: "Error", message: "boom" });
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
