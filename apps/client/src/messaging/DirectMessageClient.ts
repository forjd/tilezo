import type { DirectMessage } from "@tilezo/protocol/messages";
import { apiUrl } from "../config";

export type { DirectMessage };

export type DirectMessageUnreadCount = {
  friendId: string;
  count: number;
};

export async function loadConversation(friendId: string): Promise<DirectMessage[]> {
  const response = await fetch(apiUrl(`/friends/${encodeURIComponent(friendId)}/messages`), {
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

export async function loadUnreadCounts(): Promise<DirectMessageUnreadCount[]> {
  const response = await fetch(apiUrl("/direct-messages/unread"), {
    credentials: "include",
  });
  const body = await readJson<
    { unread?: DirectMessageUnreadCount[] } | { error?: { message?: string } }
  >(response);

  if (!response.ok) {
    const message =
      body && "error" in body ? body.error?.message : "Could not load unread messages";
    throw new Error(message);
  }

  return Array.isArray((body as { unread?: unknown }).unread)
    ? (body as { unread: DirectMessageUnreadCount[] }).unread
    : [];
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
