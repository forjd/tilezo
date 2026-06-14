import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import { DEFAULT_API_URL } from "../assets";

export type BlockedUserSummary = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
  blockedAt: string;
};

export async function listBlockedUsers(): Promise<BlockedUserSummary[]> {
  const response = await fetch(`${getApiUrl()}/blocked-users`, { credentials: "include" });
  const body = await readJson<
    { blockedUsers?: BlockedUserSummary[] } | { error?: { message?: string } }
  >(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Blocked users failed");
  }

  return Array.isArray((body as { blockedUsers?: unknown }).blockedUsers)
    ? (body as { blockedUsers: BlockedUserSummary[] }).blockedUsers
    : [];
}

export async function blockUser(userId: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/blocked-users`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const body = await readJson<{ ok?: boolean } | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Block failed");
  }
}

export async function unblockUser(userId: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/blocked-users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const body = await readJson<{ ok?: boolean } | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Unblock failed");
  }
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
