import type { ServerMessage } from "@tilezo/protocol";

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
