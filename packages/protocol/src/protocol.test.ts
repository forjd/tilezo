import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE, parseClientMessage, parseRawClientMessage } from ".";

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

  test("accepts room list requests", () => {
    expect(parseClientMessage({ type: "room.list.request" })).toEqual({
      ok: true,
      value: { type: "room.list.request" },
    });
  });

  test("accepts typing status updates", () => {
    expect(parseClientMessage({ type: "chat.typing", isTyping: true })).toEqual({
      ok: true,
      value: { type: "chat.typing", isTyping: true },
    });
    expect(parseClientMessage({ type: "chat.typing", isTyping: "yes" }).ok).toBe(false);
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

  test("accepts avatar appearance updates with only supported parts and colors", () => {
    const result = parseClientMessage({
      type: "avatar.appearance.update",
      appearance: {
        ...DEFAULT_AVATAR_APPEARANCE,
        hair: "side-part",
        hairColor: "#8b4a24",
        shirtColor: "#2f5f7f",
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          hair: "side-part",
          hairColor: "#8b4a24",
          shirtColor: "#2f5f7f",
        },
      },
    });
    expect(
      parseClientMessage({
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          shirtColor: "blue",
        },
      }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          shirtColor: "#123456",
        },
      }).ok,
    ).toBe(false);
  });
});
