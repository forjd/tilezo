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
export const ROOM_ID_MAX_LENGTH = 64;
export const CHAT_MAX_LENGTH = 240;

const trimmedString = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .transform((value) => value.trim());

export const tilePositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
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
  text: trimmedString(CHAT_MAX_LENGTH),
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
  avatarAppearanceUpdateMessageSchema,
  pingMessageSchema,
]);
