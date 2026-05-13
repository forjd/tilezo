import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import { DEFAULT_API_URL } from "../assets";

export type AuthMode = "login" | "register";

export type AuthSession = {
  user: {
    id: string;
    username: string;
    appearance: AvatarAppearance;
  };
  token: string;
};

export async function authenticate(options: {
  mode: AuthMode;
  username: string;
  password: string;
}): Promise<AuthSession> {
  const response = await fetch(`${getApiUrl()}/auth/${options.mode}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: options.username,
      password: options.password,
    }),
  });

  const body = await readJson<AuthSession | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Login failed");
  }

  return body as AuthSession;
}

export async function updateAppearance(
  token: string,
  appearance: AvatarAppearance,
): Promise<AvatarAppearance> {
  const response = await fetch(`${getApiUrl()}/me/appearance`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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
