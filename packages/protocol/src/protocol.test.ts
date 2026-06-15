import { describe, expect, test } from "bun:test";
import {
  AVATAR_HAIR_STYLES,
  createRandomAvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
  MAX_RAW_MESSAGE_BYTES,
  MAX_RAW_SERVER_MESSAGE_BYTES,
  parseClientMessage,
  parseRawClientMessage,
  parseRawServerMessage,
  parseServerMessage,
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

  test("preserves international chat text while collapsing whitespace", () => {
    expect(parseClientMessage({ type: "chat.say", text: " hi 👋 café 世界\tok\n " })).toEqual({
      ok: true,
      value: { type: "chat.say", text: "hi 👋 café 世界 ok" },
    });
    expect(parseClientMessage({ type: "chat.say", text: "😀✨" })).toEqual({
      ok: true,
      value: { type: "chat.say", text: "😀✨" },
    });
  });

  test("strips control, zero-width, and bidi-override characters from chat", () => {
    // Right-to-left override (U+202E) and zero-width space (U+200B) are removed; the
    // surrounding visible characters and a normal space survive.
    expect(parseClientMessage({ type: "chat.say", text: "ab\u202Ecd\u200B ef" })).toEqual({
      ok: true,
      value: { type: "chat.say", text: "abcd ef" },
    });
    expect(parseClientMessage({ type: "chat.say", text: "a\u0001b\u007Fc\u0085d" })).toEqual({
      ok: true,
      value: { type: "chat.say", text: "abcd" },
    });
    // A message that is only zero-width/control characters collapses to empty and is rejected.
    expect(parseClientMessage({ type: "chat.say", text: "\u200B\u202E\t" }).ok).toBe(false);
  });

  test("accepts and sanitizes direct messages", () => {
    expect(
      parseClientMessage({ type: "dm.send", toUserId: " user_2 ", text: "  hey there  " }),
    ).toEqual({
      ok: true,
      value: { type: "dm.send", toUserId: "user_2", text: "hey there" },
    });
    expect(parseClientMessage({ type: "dm.send", toUserId: "user_2", text: "" }).ok).toBe(false);
    expect(parseClientMessage({ type: "dm.send", toUserId: "", text: "hi" }).ok).toBe(false);
  });

  test("accepts direct message typing status updates", () => {
    expect(parseClientMessage({ type: "dm.typing", toUserId: " user_2 ", isTyping: true })).toEqual(
      {
        ok: true,
        value: { type: "dm.typing", toUserId: "user_2", isTyping: true },
      },
    );
    expect(parseClientMessage({ type: "dm.typing", toUserId: "user_2", isTyping: "yes" }).ok).toBe(
      false,
    );
    expect(parseClientMessage({ type: "dm.typing", toUserId: "", isTyping: true }).ok).toBe(false);
  });

  test("accepts direct message read acknowledgements", () => {
    expect(parseClientMessage({ type: "dm.read", friendId: " user_2 " })).toEqual({
      ok: true,
      value: { type: "dm.read", friendId: "user_2" },
    });
    expect(parseClientMessage({ type: "dm.read", friendId: "" }).ok).toBe(false);
  });

  test("accepts direct message edits and deletes", () => {
    expect(
      parseClientMessage({ type: "dm.edit", messageId: " dm_1 ", text: "  updated  " }),
    ).toEqual({
      ok: true,
      value: { type: "dm.edit", messageId: "dm_1", text: "updated" },
    });
    expect(parseClientMessage({ type: "dm.edit", messageId: "dm_1", text: "" }).ok).toBe(false);
    expect(parseClientMessage({ type: "dm.edit", messageId: "", text: "updated" }).ok).toBe(false);
    expect(parseClientMessage({ type: "dm.delete", messageId: " dm_1 " })).toEqual({
      ok: true,
      value: { type: "dm.delete", messageId: "dm_1" },
    });
    expect(parseClientMessage({ type: "dm.delete", messageId: "" }).ok).toBe(false);
  });

  test("rejects malformed raw messages", () => {
    expect(parseRawClientMessage("{bad json").ok).toBe(false);
    expect(parseRawClientMessage("x".repeat(MAX_RAW_MESSAGE_BYTES + 1))).toEqual({
      ok: false,
      error: "Message is too large",
    });
  });

  test("parses raw string messages without a Buffer global", () => {
    const originalBuffer = Object.getOwnPropertyDescriptor(globalThis, "Buffer");

    try {
      Reflect.deleteProperty(globalThis, "Buffer");

      expect(parseRawClientMessage(JSON.stringify({ type: "ping", sentAt: "now" }))).toEqual({
        ok: true,
        value: { type: "ping", sentAt: "now" },
      });
      expect(
        parseRawServerMessage(
          JSON.stringify({ type: "connected", userId: "user_1", dollars: 500 }),
        ),
      ).toEqual({
        ok: true,
        value: { type: "connected", userId: "user_1", dollars: 500 },
      });
      expect(parseRawServerMessage("😀".repeat(MAX_RAW_SERVER_MESSAGE_BYTES / 4 + 1))).toEqual({
        ok: false,
        error: "Server message is too large",
      });
    } finally {
      if (originalBuffer) {
        Object.defineProperty(globalThis, "Buffer", originalBuffer);
      }
    }
  });

  test("rejects invalid payloads", () => {
    expect(
      parseClientMessage({
        type: "avatar.move.request",
        target: { x: 1.5, y: 2 },
      }).ok,
    ).toBe(false);
  });

  test("rejects move targets with out-of-range coordinates", () => {
    expect(
      parseClientMessage({
        type: "avatar.move.request",
        target: { x: Number.MAX_SAFE_INTEGER, y: 0 },
      }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        type: "avatar.move.request",
        target: { x: 5, y: 12 },
      }).ok,
    ).toBe(true);
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

  test("accepts furniture edit messages", () => {
    expect(
      parseClientMessage({
        type: "room.item.place.request",
        itemType: " crate_table ",
        position: { x: 2, y: 1 },
        rotation: 0,
      }),
    ).toEqual({
      ok: true,
      value: {
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 2, y: 1 },
        rotation: 0,
      },
    });
    expect(
      parseClientMessage({
        type: "room.item.move.request",
        itemId: " item_1 ",
        position: { x: 1, y: 2 },
        rotation: 3,
      }).ok,
    ).toBe(true);
    expect(
      parseClientMessage({
        type: "room.item.pickup.request",
        itemId: " item_1 ",
      }),
    ).toEqual({
      ok: true,
      value: { type: "room.item.pickup.request", itemId: "item_1" },
    });
    expect(
      parseClientMessage({
        type: "room.item.interact.request",
        itemId: "item_1",
        action: "toggle",
      }).ok,
    ).toBe(true);
    expect(
      parseClientMessage({
        type: "room.item.place.request",
        itemType: "crate_table",
        position: { x: 1, y: 1 },
        rotation: 4,
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

describe("parseServerMessage", () => {
  test("accepts well-formed server messages", () => {
    expect(parseServerMessage({ type: "connected", userId: "user_1", dollars: 500 })).toEqual({
      ok: true,
      value: { type: "connected", userId: "user_1", dollars: 500 },
    });
    expect(
      parseServerMessage({
        type: "avatar.moved",
        userId: "user_1",
        path: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      }).ok,
    ).toBe(true);
    expect(
      parseServerMessage({
        type: "user.joined",
        user: {
          id: "user_1",
          username: "Dan",
          position: { x: 0, y: 0 },
          appearance: DEFAULT_AVATAR_APPEARANCE,
          movementPath: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      }).ok,
    ).toBe(true);
    expect(
      parseServerMessage({
        type: "room.snapshot",
        roomId: "lobby",
        users: [],
        tiles: [],
        items: [
          {
            id: "item_1",
            itemType: "crate_table",
            x: 1,
            y: 1,
            z: 0,
            rotation: 0,
            state: {},
          },
        ],
        canEditItems: true,
      }).ok,
    ).toBe(true);
    expect(
      parseServerMessage({
        type: "room.item.placed",
        item: {
          id: "item_1",
          itemType: "crate_table",
          x: 1,
          y: 1,
          z: 0,
          rotation: 0,
          state: {},
        },
      }).ok,
    ).toBe(true);
  });

  test("rejects malformed or skewed server messages", () => {
    // path must be an array of tile positions, not a string.
    expect(parseServerMessage({ type: "avatar.moved", userId: "user_1", path: "nope" }).ok).toBe(
      false,
    );
    expect(parseServerMessage({ type: "unknown.kind" }).ok).toBe(false);
    expect(parseServerMessage(null).ok).toBe(false);
  });

  test("rejects oversized and unbounded server payload fields", () => {
    expect(parseRawServerMessage("x".repeat(MAX_RAW_SERVER_MESSAGE_BYTES + 1))).toEqual({
      ok: false,
      error: "Server message is too large",
    });
    expect(parseRawServerMessage("{bad json")).toEqual({
      ok: false,
      error: "Malformed server JSON",
    });
    expect(
      parseServerMessage({
        type: "chat.message",
        userId: "user_1",
        username: "Dan",
        text: "x".repeat(241),
        sentAt: new Date().toISOString(),
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        type: "room.list",
        rooms: Array.from({ length: 101 }, (_, index) => ({
          id: `room_${index}`,
          name: `Room ${index}`,
          userCount: 0,
          joined: false,
        })),
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        type: "dm.read",
        readerUserId: "user_1",
        otherUserId: "user_2",
        messageIds: Array.from({ length: 201 }, (_, index) => `dm_${index}`),
        readAt: new Date().toISOString(),
      }).ok,
    ).toBe(false);
  });
});

function createSequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}
