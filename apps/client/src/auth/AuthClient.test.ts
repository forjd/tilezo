import { afterEach, describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { DEFAULT_API_URL } from "../assets";
import { authenticate, fetchSession, logout, updateAppearance } from "./AuthClient";

const originalFetch = globalThis.fetch;
const originalProcess = Object.getOwnPropertyDescriptor(globalThis, "process");
const originalPublicApiUrl = Bun.env.PUBLIC_API_URL;
type FetchArgs = Parameters<typeof fetch>;

const user = { id: "user_1", username: "dan", appearance: DEFAULT_AVATAR_APPEARANCE };

describe("authenticate", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreProcess();
    restorePublicApiUrl();
  });

  test("posts credentials with cookies included and returns the user", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ user });
    }) as unknown as typeof fetch;

    await expect(
      authenticate({ mode: "register", username: "dan", password: "secret" }),
    ).resolves.toEqual(user);

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/auth/register`,
        init: {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "dan", password: "secret" }),
        },
      },
    ]);
  });

  test("throws the server error message when authentication fails", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      Response.json(
        { error: { message: "Invalid credentials" } },
        { status: 401 },
      )) as unknown as typeof fetch;

    await expect(
      authenticate({ mode: "login", username: "dan", password: "wrong" }),
    ).rejects.toThrow("Invalid credentials");
  });

  test("uses public API URL overrides", async () => {
    Bun.env.PUBLIC_API_URL = "http://localhost:4567";
    const requests: string[] = [];
    globalThis.fetch = (async (url: FetchArgs[0]) => {
      requests.push(String(url));
      return Response.json({ user });
    }) as unknown as typeof fetch;

    await authenticate({ mode: "login", username: "dan", password: "secret" });

    expect(requests[0]).toBe("http://localhost:4567/auth/login");
  });

  test("does not use the client page origin as the API fallback", async () => {
    delete Bun.env.PUBLIC_API_URL;
    Reflect.deleteProperty(globalThis, "process");
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "http://localhost:3001" },
    });
    const requests: string[] = [];
    globalThis.fetch = (async (url: FetchArgs[0]) => {
      requests.push(String(url));
      return Response.json({ user });
    }) as unknown as typeof fetch;

    await authenticate({ mode: "register", username: "dan", password: "secret" });

    expect(requests).toEqual([`${DEFAULT_API_URL}/auth/register`]);

    if (originalLocation) {
      Object.defineProperty(globalThis, "location", originalLocation);
    } else {
      Reflect.deleteProperty(globalThis, "location");
    }
  });

  test("throws a friendly auth error for empty error responses", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

    await expect(
      authenticate({ mode: "register", username: "dan", password: "secret" }),
    ).rejects.toThrow("Login failed");
  });
});

describe("fetchSession", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("returns the user from the session cookie when signed in", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ user });
    }) as unknown as typeof fetch;

    await expect(fetchSession()).resolves.toEqual(user);
    expect(requests[0]).toEqual({
      url: `${DEFAULT_API_URL}/auth/session`,
      init: { credentials: "include" },
    });
  });

  test("returns undefined when not signed in or the request fails", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    await expect(fetchSession()).resolves.toBeUndefined();

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(fetchSession()).resolves.toBeUndefined();
  });
});

describe("logout", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("posts to the logout endpoint with credentials and never throws", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;

    await expect(logout()).resolves.toBeUndefined();
    expect(requests[0]?.url).toBe(`${DEFAULT_API_URL}/auth/logout`);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.credentials).toBe("include");
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(logout()).resolves.toBeUndefined();
  });

  test("aborts a hung logout request", async () => {
    delete Bun.env.PUBLIC_API_URL;
    let aborted = false;
    globalThis.fetch = (async (_url: FetchArgs[0], init?: FetchArgs[1]) => {
      const signal = init?.signal;

      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    await expect(logout({ timeoutMs: 1 })).resolves.toBeUndefined();
    expect(aborted).toBe(true);
  });
});

describe("updateAppearance", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("puts the selected appearance using the session cookie", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const appearance: AvatarAppearance = {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part" as const,
      hairColor: "#8b4a24",
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ appearance });
    }) as unknown as typeof fetch;

    await expect(updateAppearance(appearance)).resolves.toEqual(appearance);

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/me/appearance`,
        init: {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
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

function restoreProcess(): void {
  if (originalProcess) {
    Object.defineProperty(globalThis, "process", originalProcess);
  }
}
