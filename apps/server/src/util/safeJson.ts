import type { ServerMessage } from "@habbo/protocol";

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
