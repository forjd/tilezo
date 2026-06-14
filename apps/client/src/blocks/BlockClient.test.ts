import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { blockUser, listBlockedUsers, unblockUser } from "./BlockClient";

const originalFetch = globalThis.fetch;

describe("BlockClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("lists blocked users", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          blockedUsers: [
            {
              id: "user_2",
              username: "Kai",
              appearance: DEFAULT_AVATAR_APPEARANCE,
              blockedAt: "2026-06-13T00:00:00.000Z",
            },
          ],
        }),
      )) as unknown as typeof fetch;

    await expect(listBlockedUsers()).resolves.toEqual([
      {
        id: "user_2",
        username: "Kai",
        appearance: DEFAULT_AVATAR_APPEARANCE,
        blockedAt: "2026-06-13T00:00:00.000Z",
      },
    ]);
  });

  test("blocks and unblocks users", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (
      url: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }));
    }) as unknown as typeof fetch;

    await blockUser("user_2");
    await unblockUser("user_2");

    expect(calls.map((call) => [call.url, call.init?.method])).toEqual([
      ["http://localhost:3000/blocked-users", "POST"],
      ["http://localhost:3000/blocked-users/user_2", "DELETE"],
    ]);
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ userId: "user_2" }));
  });

  test("returns an empty list when the response shape is missing users", async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;

    await expect(listBlockedUsers()).resolves.toEqual([]);
  });

  test("throws fallback errors when error responses are malformed", async () => {
    globalThis.fetch = (async () =>
      new Response("not json", { status: 500 })) as unknown as typeof fetch;

    await expect(listBlockedUsers()).rejects.toThrow("Blocked users failed");
    await expect(blockUser("user_2")).rejects.toThrow("Block failed");
    await expect(unblockUser("user/2")).rejects.toThrow("Unblock failed");
  });
});
