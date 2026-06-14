import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import { apiUrl } from "../config";

export type FriendSummary = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
  online: boolean;
  roomId?: string;
  canJoinRoom: boolean;
};

export type FriendAddResult = {
  friend: FriendSummary;
  status: "pending" | "accepted";
};

export async function listFriends(): Promise<FriendSummary[]> {
  const response = await fetch(apiUrl("/friends"), { credentials: "include" });
  const body = await readJson<{ friends?: FriendSummary[] } | { error?: { message?: string } }>(
    response,
  );

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Friends failed");
  }

  return Array.isArray((body as { friends?: unknown }).friends)
    ? (body as { friends: FriendSummary[] }).friends
    : [];
}

export async function addFriend(username: string): Promise<FriendAddResult> {
  const response = await fetch(apiUrl("/friends"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const body = await readJson<FriendAddResult | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Friend add failed");
  }

  return body as FriendAddResult;
}

export async function removeFriend(friendId: string): Promise<void> {
  const response = await fetch(apiUrl(`/friends/${encodeURIComponent(friendId)}`), {
    method: "DELETE",
    credentials: "include",
  });
  const body = await readJson<{ ok?: boolean } | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Friend remove failed");
  }
}


async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
