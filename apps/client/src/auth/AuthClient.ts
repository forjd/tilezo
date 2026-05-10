import { DEFAULT_API_URL } from "../assets";

export type AuthMode = "login" | "register";

export type AuthSession = {
  user: {
    id: string;
    username: string;
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
