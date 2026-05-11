import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { DEFAULT_API_URL } from "../assets";
import { authenticate, updateAppearance } from "./AuthClient";

const originalFetch = globalThis.fetch;
const originalPublicApiUrl = Bun.env.PUBLIC_API_URL;
type FetchArgs = Parameters<typeof fetch>;

describe("authenticate", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("posts credentials to the selected auth endpoint", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const session = {
      user: {
        id: "user_1",
        username: "dan",
        appearance: DEFAULT_AVATAR_APPEARANCE,
      },
      token: "session-token",
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json(session);
    }) as unknown as typeof fetch;

    await expect(
      authenticate({ mode: "register", username: "dan", password: "secret" }),
    ).resolves.toEqual(session);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      url: `${DEFAULT_API_URL}/auth/register`,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "dan",
          password: "secret",
        }),
      },
    });
  });

  test("throws the server error message when authentication fails", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      Response.json(
        {
          error: {
            message: "Invalid credentials",
          },
        },
        { status: 401 },
      )) as unknown as typeof fetch;

    await expect(
      authenticate({ mode: "login", username: "dan", password: "wrong" }),
    ).rejects.toThrow("Invalid credentials");
  });

  test("uses public API URL overrides", async () => {
    Bun.env.PUBLIC_API_URL = "http://localhost:4567";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({
        user: { id: "user_1", username: "dan", appearance: DEFAULT_AVATAR_APPEARANCE },
        token: "session-token",
      });
    }) as unknown as typeof fetch;

    await authenticate({ mode: "login", username: "dan", password: "secret" });

    expect(requests[0]?.url).toBe("http://localhost:4567/auth/login");
  });
});

describe("updateAppearance", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("puts the selected appearance with the session token", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const appearance = {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part" as const,
      hairColor: "#8b4a24",
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ appearance });
    }) as unknown as typeof fetch;

    await expect(updateAppearance("session-token", appearance)).resolves.toEqual(appearance);

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/me/appearance`,
        init: {
          method: "PUT",
          headers: {
            authorization: "Bearer session-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ appearance }),
        },
      },
    ]);
  });
});

function restorePublicApiUrl(): void {
  if (originalPublicApiUrl === undefined) {
    delete Bun.env.PUBLIC_API_URL;
  } else {
    Bun.env.PUBLIC_API_URL = originalPublicApiUrl;
  }
}
