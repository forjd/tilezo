import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_API_URL } from "../assets";
import { ClientLogger } from "./ClientLogger";

const originalProcess = Object.getOwnPropertyDescriptor(globalThis, "process");
const originalPublicApiUrl = Bun.env.PUBLIC_API_URL;
type FetchArgs = Parameters<typeof fetch>;

describe("ClientLogger", () => {
  afterEach(() => {
    restoreProcess();
    restorePublicApiUrl();
  });

  test("posts telemetry events with the current session token", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const logger = new ClientLogger({
      getToken: () => "session-token",
      fetcher: (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
        requests.push({ url: String(url), init });
        return Response.json({ ok: true });
      }) as typeof fetch,
    });

    await logger.event("room.connection.disconnected", { roomId: "lobby" }, "warn");

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/client-events`,
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer session-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            event: "room.connection.disconnected",
            fields: { roomId: "lobby" },
            level: "warn",
          }),
          keepalive: true,
        },
      },
    ]);
  });

  test("uses configured API URL and ignores send failures", async () => {
    Bun.env.PUBLIC_API_URL = "http://localhost:4567";
    const requests: string[] = [];
    const logger = new ClientLogger({
      fetcher: (async (url: FetchArgs[0]) => {
        requests.push(String(url));
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    await expect(logger.event("client.test")).resolves.toBeUndefined();

    expect(requests).toEqual(["http://localhost:4567/client-events"]);
  });

  test("falls back to the default API URL when process is unavailable", async () => {
    delete Bun.env.PUBLIC_API_URL;
    Reflect.deleteProperty(globalThis, "process");
    const requests: string[] = [];
    const logger = new ClientLogger({
      fetcher: (async (url: FetchArgs[0]) => {
        requests.push(String(url));
        return Response.json({ ok: true });
      }) as typeof fetch,
    });

    await logger.event("client.test");

    expect(requests).toEqual([`${DEFAULT_API_URL}/client-events`]);
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
