import { describe, expect, test } from "bun:test";
import { parseClientMessage, parseRawClientMessage } from ".";

describe("protocol parser", () => {
  test("accepts valid client messages and trims user strings", () => {
    const result = parseClientMessage({
      type: "room.join",
      roomId: " lobby ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        type: "room.join",
        roomId: "lobby",
      },
    });
  });

  test("rejects malformed raw messages", () => {
    expect(parseRawClientMessage("{bad json").ok).toBe(false);
  });

  test("rejects invalid payloads", () => {
    expect(
      parseClientMessage({
        type: "avatar.move.request",
        target: { x: 1.5, y: 2 },
      }).ok,
    ).toBe(false);
  });
});
