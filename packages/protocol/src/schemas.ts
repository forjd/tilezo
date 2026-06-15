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
export const MAX_RAW_SERVER_MESSAGE_BYTES = 64 * 1024;
export const USERNAME_MAX_LENGTH = 24;
export const USER_ID_MAX_LENGTH = 64;
export const ROOM_ID_MAX_LENGTH = 64;
export const ITEM_ID_MAX_LENGTH = 128;
export const ITEM_TYPE_MAX_LENGTH = 64;
export const ITEM_ACTION_MAX_LENGTH = 64;
export const MESSAGE_ID_MAX_LENGTH = 128;
export const CHAT_MAX_LENGTH = 240;
export const DIRECT_MESSAGE_MAX_LENGTH = 600;
export const SERVER_ERROR_MAX_LENGTH = 300;
export const SERVER_TIMESTAMP_MAX_LENGTH = 128;
export const SERVER_ROOM_LIST_MAX = 100;
export const SERVER_ROOM_USERS_MAX = 200;
export const SERVER_ROOM_TILES_MAX = 10_000;
export const SERVER_ROOM_ITEMS_MAX = 2_000;
export const SERVER_MOVEMENT_PATH_MAX = 256;
export const SERVER_INVENTORY_ITEMS_MAX = 500;
export const SERVER_DM_READ_RECEIPT_MAX = 200;
export const DOLLARS_MAX = 999_999_999;
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
const furnitureRotation = z.number().int().min(0).max(3);
export const dollarsSchema = z.number().int().min(0).max(DOLLARS_MAX);

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

export const dmTypingMessageSchema = z.object({
  type: z.literal("dm.typing"),
  toUserId: trimmedString(USER_ID_MAX_LENGTH),
  isTyping: z.boolean(),
});

export const dmReadMessageSchema = z.object({
  type: z.literal("dm.read"),
  friendId: trimmedString(USER_ID_MAX_LENGTH),
});

export const dmEditMessageSchema = z.object({
  type: z.literal("dm.edit"),
  messageId: trimmedString(MESSAGE_ID_MAX_LENGTH),
  text: directMessageText,
});

export const dmDeleteMessageSchema = z.object({
  type: z.literal("dm.delete"),
  messageId: trimmedString(MESSAGE_ID_MAX_LENGTH),
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

export const roomItemPlaceRequestMessageSchema = z.object({
  type: z.literal("room.item.place.request"),
  itemType: trimmedString(ITEM_TYPE_MAX_LENGTH),
  position: tilePositionSchema,
  rotation: furnitureRotation,
});

export const roomItemMoveRequestMessageSchema = z.object({
  type: z.literal("room.item.move.request"),
  itemId: trimmedString(ITEM_ID_MAX_LENGTH),
  position: tilePositionSchema,
  rotation: furnitureRotation,
});

export const roomItemPickupRequestMessageSchema = z.object({
  type: z.literal("room.item.pickup.request"),
  itemId: trimmedString(ITEM_ID_MAX_LENGTH),
});

export const roomItemInteractRequestMessageSchema = z.object({
  type: z.literal("room.item.interact.request"),
  itemId: trimmedString(ITEM_ID_MAX_LENGTH),
  action: trimmedString(ITEM_ACTION_MAX_LENGTH),
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
  dmTypingMessageSchema,
  dmReadMessageSchema,
  dmEditMessageSchema,
  dmDeleteMessageSchema,
  avatarAppearanceUpdateMessageSchema,
  roomItemPlaceRequestMessageSchema,
  roomItemMoveRequestMessageSchema,
  roomItemPickupRequestMessageSchema,
  roomItemInteractRequestMessageSchema,
  pingMessageSchema,
]);

const boundedServerString = (maxLength: number) => z.string().min(1).max(maxLength);
const boundedServerText = (maxLength: number) => z.string().max(maxLength);
const serverTimestamp = boundedServerString(SERVER_TIMESTAMP_MAX_LENGTH);

const roomTileSchema = z.object({
  x: tileCoordinate,
  y: tileCoordinate,
  z: z.number().int(),
  walkable: z.boolean(),
});

const roomUserSnapshotSchema = z.object({
  id: boundedServerString(USER_ID_MAX_LENGTH),
  username: boundedServerString(USERNAME_MAX_LENGTH),
  position: tilePositionSchema,
  appearance: avatarAppearanceSchema,
  movementPath: z.array(tilePositionSchema).max(SERVER_MOVEMENT_PATH_MAX).optional(),
});

const publicRoomSummarySchema = z.object({
  id: boundedServerString(ROOM_ID_MAX_LENGTH),
  name: boundedServerString(ROOM_ID_MAX_LENGTH),
  userCount: z.number().int().min(0).max(SERVER_ROOM_USERS_MAX),
  joined: z.boolean(),
});

const roomItemSchema = z.object({
  id: boundedServerString(ITEM_ID_MAX_LENGTH),
  itemType: boundedServerString(ITEM_TYPE_MAX_LENGTH),
  x: tileCoordinate,
  y: tileCoordinate,
  z: z.number().int(),
  rotation: furnitureRotation,
  state: z.record(boundedServerString(ITEM_ACTION_MAX_LENGTH), z.unknown()),
});

export const inventoryItemSchema = z.object({
  itemType: trimmedString(ITEM_TYPE_MAX_LENGTH),
  quantity: z.number().int().min(0),
});

// Server -> client messages are validated on the client so a malformed or skewed
// payload surfaces as a clean "invalid server message" instead of throwing deep in
// the scene/avatar code and silently dropping that state update (client desync).
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connected"),
    userId: boundedServerString(USER_ID_MAX_LENGTH),
    dollars: dollarsSchema,
  }),
  z.object({
    type: z.literal("room.snapshot"),
    roomId: boundedServerString(ROOM_ID_MAX_LENGTH),
    users: z.array(roomUserSnapshotSchema).max(SERVER_ROOM_USERS_MAX),
    tiles: z.array(roomTileSchema).max(SERVER_ROOM_TILES_MAX),
    items: z.array(roomItemSchema).max(SERVER_ROOM_ITEMS_MAX),
    canEditItems: z.boolean(),
  }),
  z.object({
    type: z.literal("room.list"),
    rooms: z.array(publicRoomSummarySchema).max(SERVER_ROOM_LIST_MAX),
  }),
  z.object({ type: z.literal("user.joined"), user: roomUserSnapshotSchema }),
  z.object({ type: z.literal("user.left"), userId: boundedServerString(USER_ID_MAX_LENGTH) }),
  z.object({
    type: z.literal("avatar.moved"),
    userId: boundedServerString(USER_ID_MAX_LENGTH),
    path: z.array(tilePositionSchema).max(SERVER_MOVEMENT_PATH_MAX),
  }),
  z.object({
    type: z.literal("avatar.appearance.updated"),
    userId: boundedServerString(USER_ID_MAX_LENGTH),
    appearance: avatarAppearanceSchema,
  }),
  z.object({
    type: z.literal("chat.message"),
    userId: boundedServerString(USER_ID_MAX_LENGTH),
    username: boundedServerString(USERNAME_MAX_LENGTH),
    text: boundedServerText(CHAT_MAX_LENGTH),
    sentAt: serverTimestamp,
  }),
  z.object({
    type: z.literal("dm.message"),
    id: boundedServerString(MESSAGE_ID_MAX_LENGTH),
    fromUserId: boundedServerString(USER_ID_MAX_LENGTH),
    toUserId: boundedServerString(USER_ID_MAX_LENGTH),
    text: boundedServerText(DIRECT_MESSAGE_MAX_LENGTH),
    sentAt: serverTimestamp,
    readAt: serverTimestamp.optional(),
    editedAt: serverTimestamp.optional(),
    deletedAt: serverTimestamp.optional(),
  }),
  z.object({
    type: z.literal("dm.typing"),
    fromUserId: boundedServerString(USER_ID_MAX_LENGTH),
    toUserId: boundedServerString(USER_ID_MAX_LENGTH),
    isTyping: z.boolean(),
  }),
  z.object({
    type: z.literal("dm.read"),
    readerUserId: boundedServerString(USER_ID_MAX_LENGTH),
    otherUserId: boundedServerString(USER_ID_MAX_LENGTH),
    messageIds: z.array(boundedServerString(MESSAGE_ID_MAX_LENGTH)).max(SERVER_DM_READ_RECEIPT_MAX),
    readAt: serverTimestamp,
  }),
  z.object({
    type: z.literal("dm.edited"),
    id: boundedServerString(MESSAGE_ID_MAX_LENGTH),
    fromUserId: boundedServerString(USER_ID_MAX_LENGTH),
    toUserId: boundedServerString(USER_ID_MAX_LENGTH),
    text: boundedServerText(DIRECT_MESSAGE_MAX_LENGTH),
    editedAt: serverTimestamp,
  }),
  z.object({
    type: z.literal("dm.deleted"),
    id: boundedServerString(MESSAGE_ID_MAX_LENGTH),
    fromUserId: boundedServerString(USER_ID_MAX_LENGTH),
    toUserId: boundedServerString(USER_ID_MAX_LENGTH),
    deletedAt: serverTimestamp,
  }),
  z.object({
    type: z.literal("chat.typing"),
    userId: boundedServerString(USER_ID_MAX_LENGTH),
    username: boundedServerString(USERNAME_MAX_LENGTH),
    isTyping: z.boolean(),
  }),
  z.object({ type: z.literal("room.item.placed"), item: roomItemSchema }),
  z.object({ type: z.literal("room.item.moved"), item: roomItemSchema }),
  z.object({
    type: z.literal("room.item.picked_up"),
    itemId: boundedServerString(ITEM_ID_MAX_LENGTH),
  }),
  z.object({ type: z.literal("room.item.state_updated"), item: roomItemSchema }),
  z.object({ type: z.literal("balance.updated"), dollars: dollarsSchema }),
  z.object({
    type: z.literal("inventory.updated"),
    items: z.array(inventoryItemSchema).max(SERVER_INVENTORY_ITEMS_MAX),
  }),
  z.object({ type: z.literal("pong"), sentAt: serverTimestamp }),
  z.object({
    type: z.literal("error"),
    code: boundedServerString(ITEM_ACTION_MAX_LENGTH),
    message: boundedServerText(SERVER_ERROR_MAX_LENGTH),
  }),
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
