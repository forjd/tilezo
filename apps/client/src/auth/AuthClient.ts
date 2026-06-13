import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import { DEFAULT_API_URL } from "../assets";

export type AuthMode = "login" | "register";

export type AuthUser = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
};

// The token is never returned to page JavaScript: the server delivers it as an HttpOnly
// session cookie, and every authenticated request below uses `credentials: "include"`.
export async function authenticate(options: {
  mode: AuthMode;
  username: string;
  password: string;
}): Promise<AuthUser> {
  const response = await fetch(`${getApiUrl()}/auth/${options.mode}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: options.username, password: options.password }),
  });

  const body = await readJson<{ user?: AuthUser } | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Login failed");
  }

  return (body as { user: AuthUser }).user;
}

// Restores the signed-in user from the session cookie on page load (returns undefined when
// there is no valid session). This is what replaces reading a token out of localStorage.
export async function fetchSession(): Promise<AuthUser | undefined> {
  try {
    const response = await fetch(`${getApiUrl()}/auth/session`, { credentials: "include" });

    if (!response.ok) {
      return undefined;
    }

    const body = await readJson<{ user?: AuthUser }>(response);
    return body?.user;
  } catch {
    return undefined;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${getApiUrl()}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // A failed logout call must not block the local sign-out.
  }
}

export async function updateAppearance(appearance: AvatarAppearance): Promise<AvatarAppearance> {
  const response = await fetch(`${getApiUrl()}/me/appearance`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appearance }),
  });

  const body = await readJson<{ appearance: AvatarAppearance } | { error?: { message?: string } }>(
    response,
  );

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Character update failed");
  }

  return (body as { appearance: AvatarAppearance }).appearance;
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

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
