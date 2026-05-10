import { z } from "zod";

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
  username: trimmedString(USERNAME_MAX_LENGTH),
});

export const avatarMoveRequestMessageSchema = z.object({
  type: z.literal("avatar.move.request"),
  target: tilePositionSchema,
});

export const chatSayMessageSchema = z.object({
  type: z.literal("chat.say"),
  text: trimmedString(CHAT_MAX_LENGTH),
});

export const pingMessageSchema = z.object({
  type: z.literal("ping"),
  sentAt: trimmedString(128),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  roomJoinMessageSchema,
  avatarMoveRequestMessageSchema,
  chatSayMessageSchema,
  pingMessageSchema,
]);
