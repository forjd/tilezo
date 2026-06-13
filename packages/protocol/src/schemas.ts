import { z } from "zod";
import {
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_PANTS_COLORS,
  AVATAR_PANTS_STYLES,
  AVATAR_SHIRT_COLORS,
  AVATAR_SHIRT_STYLES,
  AVATAR_SHOE_COLORS,
  AVATAR_SHOE_STYLES,
  AVATAR_SKIN_TONES,
} from "./appearance";

export const MAX_RAW_MESSAGE_BYTES = 8 * 1024;
export const USERNAME_MAX_LENGTH = 24;
export const USER_ID_MAX_LENGTH = 64;
export const ROOM_ID_MAX_LENGTH = 64;
export const CHAT_MAX_LENGTH = 240;
export const DIRECT_MESSAGE_MAX_LENGTH = 600;
// Tile coordinates are bounded at the trust boundary so untrusted clients cannot
// send absurd integers (e.g. near MAX_SAFE_INTEGER). The bound is far larger than
// any real room while keeping every value comfortably within safe-integer math.
export const MAX_TILE_COORDINATE = 100_000;

const trimmedString = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .transform((value) => value.trim());

const chatText = z
  .string()
  .transform((value) => sanitizeChatText(value).trim())
  .pipe(z.string().min(1).max(CHAT_MAX_LENGTH));

const directMessageText = z
  .string()
  .transform((value) => sanitizeChatText(value).trim())
  .pipe(z.string().min(1).max(DIRECT_MESSAGE_MAX_LENGTH));

const tileCoordinate = z.number().int().min(-MAX_TILE_COORDINATE).max(MAX_TILE_COORDINATE);

export const tilePositionSchema = z.object({
  x: tileCoordinate,
  y: tileCoordinate,
});

export const roomJoinMessageSchema = z.object({
  type: z.literal("room.join"),
  roomId: trimmedString(ROOM_ID_MAX_LENGTH),
});

export const roomListRequestMessageSchema = z.object({
  type: z.literal("room.list.request"),
});

export const avatarMoveRequestMessageSchema = z.object({
  type: z.literal("avatar.move.request"),
  target: tilePositionSchema,
});

export const chatSayMessageSchema = z.object({
  type: z.literal("chat.say"),
  text: chatText,
});

export const chatTypingMessageSchema = z.object({
  type: z.literal("chat.typing"),
  isTyping: z.boolean(),
});

export const dmSendMessageSchema = z.object({
  type: z.literal("dm.send"),
  toUserId: trimmedString(USER_ID_MAX_LENGTH),
  text: directMessageText,
});

export const avatarAppearanceSchema = z.object({
  hair: z.enum(AVATAR_HAIR_STYLES),
  hairColor: z.enum(AVATAR_HAIR_COLORS),
  skinTone: z.enum(AVATAR_SKIN_TONES),
  shirt: z.enum(AVATAR_SHIRT_STYLES),
  shirtColor: z.enum(AVATAR_SHIRT_COLORS),
  pants: z.enum(AVATAR_PANTS_STYLES),
  pantsColor: z.enum(AVATAR_PANTS_COLORS),
  shoes: z.enum(AVATAR_SHOE_STYLES),
  shoesColor: z.enum(AVATAR_SHOE_COLORS),
});

export const avatarAppearanceUpdateMessageSchema = z.object({
  type: z.literal("avatar.appearance.update"),
  appearance: avatarAppearanceSchema,
});

export const pingMessageSchema = z.object({
  type: z.literal("ping"),
  sentAt: trimmedString(128),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  roomJoinMessageSchema,
  roomListRequestMessageSchema,
  avatarMoveRequestMessageSchema,
  chatSayMessageSchema,
  chatTypingMessageSchema,
  dmSendMessageSchema,
  avatarAppearanceUpdateMessageSchema,
  pingMessageSchema,
]);

const roomTileSchema = z.object({
  x: tileCoordinate,
  y: tileCoordinate,
  z: z.number().int(),
  walkable: z.boolean(),
});

const roomUserSnapshotSchema = z.object({
  id: z.string(),
  username: z.string(),
  position: tilePositionSchema,
  appearance: avatarAppearanceSchema,
});

const publicRoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  userCount: z.number(),
  joined: z.boolean(),
});

// Server -> client messages are validated on the client so a malformed or skewed
// payload surfaces as a clean "invalid server message" instead of throwing deep in
// the scene/avatar code and silently dropping that state update (client desync).
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connected"), userId: z.string() }),
  z.object({
    type: z.literal("room.snapshot"),
    roomId: z.string(),
    users: z.array(roomUserSnapshotSchema),
    tiles: z.array(roomTileSchema),
  }),
  z.object({ type: z.literal("room.list"), rooms: z.array(publicRoomSummarySchema) }),
  z.object({ type: z.literal("user.joined"), user: roomUserSnapshotSchema }),
  z.object({ type: z.literal("user.left"), userId: z.string() }),
  z.object({
    type: z.literal("avatar.moved"),
    userId: z.string(),
    path: z.array(tilePositionSchema),
  }),
  z.object({
    type: z.literal("avatar.appearance.updated"),
    userId: z.string(),
    appearance: avatarAppearanceSchema,
  }),
  z.object({
    type: z.literal("chat.message"),
    userId: z.string(),
    username: z.string(),
    text: z.string(),
    sentAt: z.string(),
  }),
  z.object({
    type: z.literal("dm.message"),
    id: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    text: z.string(),
    sentAt: z.string(),
  }),
  z.object({
    type: z.literal("chat.typing"),
    userId: z.string(),
    username: z.string(),
    isTyping: z.boolean(),
  }),
  z.object({ type: z.literal("pong"), sentAt: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

// Keep only characters that are safe to broadcast and render as plain text. Unlike the
// previous ASCII-only filter, this preserves international text (accents, CJK, emoji)
// while stripping C0/C1 control characters, zero-width characters, and Unicode bidi
// overrides (e.g. U+202E) that can hide or spoof text. Whitespace is collapsed to a
// single ASCII space so tabs/newlines cannot break the layout.
function sanitizeChatText(value: string): string {
  let sanitized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (isStrippedChatCodePoint(codePoint)) {
      continue;
    }

    sanitized += isWhitespaceCharacter(character) ? " " : character;
  }

  return sanitized.replace(/ {2,}/g, " ");
}

function isStrippedChatCodePoint(codePoint: number): boolean {
  // C0 control characters that are not whitespace (tab/newline are collapsed below).
  if (codePoint <= 0x1f && !isWhitespaceControlCodePoint(codePoint)) {
    return true;
  }

  // DEL and C1 control characters.
  if (codePoint >= 0x7f && codePoint <= 0x9f) {
    return true;
  }

  // Zero-width characters and bidi/directional overrides used to hide or spoof text.
  return (
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    (codePoint >= 0x200e && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

function isWhitespaceControlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 || // tab
    codePoint === 0x0a || // line feed
    codePoint === 0x0b || // vertical tab
    codePoint === 0x0c || // form feed
    codePoint === 0x0d // carriage return
  );
}

function isWhitespaceCharacter(character: string): boolean {
  return /\s/u.test(character);
}
