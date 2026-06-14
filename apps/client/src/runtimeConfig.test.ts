import { afterEach, describe, expect, test } from "bun:test";
import { loadRuntimeConfig } from "./runtimeConfig";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

describe("loadRuntimeConfig", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreWindow();
  });

  test("merges same-origin runtime config into the browser config", async () => {
    const windowRef: {
      TILEZO_CONFIG: { PUBLIC_API_URL?: string; PUBLIC_WS_URL?: string };
    } = { TILEZO_CONFIG: { PUBLIC_API_URL: "http://existing.test" } };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: windowRef,
    });
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Response.json({
        PUBLIC_API_URL: "https://api.example.test",
        PUBLIC_WS_URL: "wss://api.example.test/ws",
      });
    }) as unknown as typeof fetch;

    await loadRuntimeConfig();

    expect(requests).toEqual([
      {
        url: "/tilezo-runtime-config.json",
        init: { cache: "no-store", credentials: "same-origin" },
      },
    ]);
    expect(windowRef.TILEZO_CONFIG).toEqual({
      PUBLIC_API_URL: "https://api.example.test",
      PUBLIC_WS_URL: "wss://api.example.test/ws",
    });
  });

  test("ignores missing or malformed runtime config", async () => {
    const windowRef = { TILEZO_CONFIG: { PUBLIC_API_URL: "http://existing.test" } };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: windowRef,
    });
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

    await loadRuntimeConfig();

    expect(windowRef.TILEZO_CONFIG).toEqual({ PUBLIC_API_URL: "http://existing.test" });

    globalThis.fetch = (async () =>
      Response.json({ PUBLIC_API_URL: 123, PUBLIC_WS_URL: null })) as unknown as typeof fetch;

    await loadRuntimeConfig();

    expect(windowRef.TILEZO_CONFIG).toEqual({ PUBLIC_API_URL: "http://existing.test" });
  });

  test("skips runtime config loading outside the browser", async () => {
    Reflect.deleteProperty(globalThis, "window");
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return Response.json({});
    }) as unknown as typeof fetch;

    await loadRuntimeConfig();

    expect(fetchCalls).toBe(0);
  });
});

function restoreWindow(): void {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
}
