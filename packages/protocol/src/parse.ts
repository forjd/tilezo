import type { ClientMessage, ServerMessage } from "./messages";
import {
  clientMessageSchema,
  MAX_RAW_MESSAGE_BYTES,
  MAX_RAW_SERVER_MESSAGE_BYTES,
  serverMessageSchema,
} from "./schemas";

export type ParseResult = { ok: true; value: ClientMessage } | { ok: false; error: string };

export type ServerParseResult = { ok: true; value: ServerMessage } | { ok: false; error: string };

type RawMessage = string | Buffer;

const rawTextEncoder = new TextEncoder();

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

export function parseRawClientMessage(raw: RawMessage): ParseResult {
  const byteLength = getRawMessageByteLength(raw);

  if (byteLength > MAX_RAW_MESSAGE_BYTES) {
    return { ok: false, error: "Message is too large" };
  }

  try {
    return parseClientMessage(JSON.parse(getRawMessageText(raw)));
  } catch {
    return { ok: false, error: "Malformed JSON" };
  }
}

export function parseRawServerMessage(raw: RawMessage): ServerParseResult {
  const byteLength = getRawMessageByteLength(raw);

  if (byteLength > MAX_RAW_SERVER_MESSAGE_BYTES) {
    return { ok: false, error: "Server message is too large" };
  }

  try {
    return parseServerMessage(JSON.parse(getRawMessageText(raw)));
  } catch {
    return { ok: false, error: "Malformed server JSON" };
  }
}

function getRawMessageByteLength(raw: RawMessage): number {
  return typeof raw === "string" ? rawTextEncoder.encode(raw).byteLength : raw.byteLength;
}

function getRawMessageText(raw: RawMessage): string {
  return typeof raw === "string" ? raw : raw.toString("utf8");
}
