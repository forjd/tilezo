import type { AvatarAppearance } from "@tilezo/protocol";
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

  const body = (await response.json()) as AuthSession | { error?: { message?: string } };

  if (!response.ok) {
    throw new Error("error" in body ? body.error?.message : "Login failed");
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

  const body = (await response.json()) as
    | { appearance: AvatarAppearance }
    | { error?: { message?: string } };

  if (!response.ok) {
    throw new Error("error" in body ? body.error?.message : "Character update failed");
  }

  return (body as { appearance: AvatarAppearance }).appearance;
}

function getApiUrl(): string {
  const configured = getPublicEnv("PUBLIC_API_URL");
  return configured ?? DEFAULT_API_URL;
}

function getPublicEnv(key: string): string | undefined {
  const env = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };

  return env.env?.[key];
}
