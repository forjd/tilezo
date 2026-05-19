import { describe, expect, test } from "bun:test";
import {
  AVATAR_HAIR_STYLES,
  createRandomAvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
  parseClientMessage,
  parseRawClientMessage,
} from ".";

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

  test("filters room chat to printable ASCII text", () => {
    expect(parseClientMessage({ type: "chat.say", text: " hi 👋 café 世界\tok\n " })).toEqual({
      ok: true,
      value: { type: "chat.say", text: "hi caf ok" },
    });
    expect(parseClientMessage({ type: "chat.say", text: "😀✨" }).ok).toBe(false);
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
        hair: "curls",
        hairColor: "#8b4a24",
        shirt: "jacket",
        shirtColor: "#2f5f7f",
        pants: "skirt",
        shoes: "high-tops",
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          hair: "curls",
          hairColor: "#8b4a24",
          shirt: "jacket",
          shirtColor: "#2f5f7f",
          pants: "skirt",
          shoes: "high-tops",
        },
      },
    });
    expect(
      parseClientMessage({
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          hair: "locs",
          hairColor: "#2f6f6a",
          skinTone: "#f3dfc8",
          shirt: "workwear",
          shirtColor: "#f5f0e5",
          pants: "cuffed",
          pantsColor: "#efe6d5",
          shoes: "runners",
          shoesColor: "#9f4f3f",
        },
      }).ok,
    ).toBe(true);
    expect(
      parseClientMessage({
        type: "avatar.appearance.update",
        appearance: {
          ...DEFAULT_AVATAR_APPEARANCE,
          hair: "wizard",
        },
      }).ok,
    ).toBe(false);
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

  test("creates randomized avatar appearances from supported options", () => {
    const appearance = createRandomAvatarAppearance(
      createSequenceRandom([0.99, 0, 0.2, 0.75, 0.5, 0.99, 0, 0.8, 0.8]),
    );

    expect(appearance).toEqual({
      hair: "locs",
      hairColor: "#3b2418",
      skinTone: "#a86c4d",
      shirt: "overshirt",
      shirtColor: "#5a4b7f",
      pants: "cuffed",
      pantsColor: "#3f4d5c",
      shoes: "work-boots",
      shoesColor: "#9f4f3f",
    });
    expect(parseClientMessage({ type: "avatar.appearance.update", appearance }).ok).toBe(true);
  });

  test("keeps the expanded avatar catalog available to consumers", () => {
    expect(AVATAR_HAIR_STYLES).toContain("afro");
    expect(AVATAR_HAIR_STYLES).toContain("locs");
  });
});

function createSequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}
