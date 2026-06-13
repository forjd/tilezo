import type { DirectMessage } from "@tilezo/protocol/messages";
import { DEFAULT_API_URL } from "../assets";

export type { DirectMessage };

export async function loadConversation(friendId: string): Promise<DirectMessage[]> {
  const response = await fetch(`${getApiUrl()}/friends/${encodeURIComponent(friendId)}/messages`, {
    credentials: "include",
  });
  const body = await readJson<{ messages?: DirectMessage[] } | { error?: { message?: string } }>(
    response,
  );

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Could not load messages");
  }

  return Array.isArray((body as { messages?: unknown }).messages)
    ? (body as { messages: DirectMessage[] }).messages
    : [];
}

function getApiUrl(): string {
  const runtimeConfigured =
    typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.PUBLIC_API_URL;
  const buildConfigured = typeof process === "undefined" ? undefined : process.env.PUBLIC_API_URL;
  return runtimeConfigured ?? buildConfigured ?? DEFAULT_API_URL;
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
