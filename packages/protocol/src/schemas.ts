import { z } from "zod";
import {
  AVATAR_HAIR_STYLES,
  AVATAR_PANTS_STYLES,
  AVATAR_SHIRT_STYLES,
  AVATAR_SHOE_STYLES,
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

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const tilePositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export const roomJoinMessageSchema = z.object({
  type: z.literal("room.join"),
  roomId: trimmedString(ROOM_ID_MAX_LENGTH),
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
  hairColor: colorSchema,
  skinTone: colorSchema,
  shirt: z.enum(AVATAR_SHIRT_STYLES),
  shirtColor: colorSchema,
  pants: z.enum(AVATAR_PANTS_STYLES),
  pantsColor: colorSchema,
  shoes: z.enum(AVATAR_SHOE_STYLES),
  shoesColor: colorSchema,
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
  avatarMoveRequestMessageSchema,
  chatSayMessageSchema,
  avatarAppearanceUpdateMessageSchema,
  pingMessageSchema,
]);
