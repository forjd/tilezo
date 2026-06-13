import type { ClientMessage, ServerMessage } from "./messages";
import { clientMessageSchema, MAX_RAW_MESSAGE_BYTES, serverMessageSchema } from "./schemas";

export type ParseResult = { ok: true; value: ClientMessage } | { ok: false; error: string };

export type ServerParseResult = { ok: true; value: ServerMessage } | { ok: false; error: string };

export function parseClientMessage(input: unknown): ParseResult {
  const parsed = clientMessageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }

  return { ok: true, value: parsed.data };
}

export function parseServerMessage(input: unknown): ServerParseResult {
  const parsed = serverMessageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid server message" };
  }

  return { ok: true, value: parsed.data as ServerMessage };
}

export function parseRawClientMessage(raw: string | Buffer): ParseResult {
  const byteLength = typeof raw === "string" ? Buffer.byteLength(raw) : raw.byteLength;

  if (byteLength > MAX_RAW_MESSAGE_BYTES) {
    return { ok: false, error: "Message is too large" };
  }

  try {
    return parseClientMessage(JSON.parse(raw.toString()));
  } catch {
    return { ok: false, error: "Malformed JSON" };
  }
}
