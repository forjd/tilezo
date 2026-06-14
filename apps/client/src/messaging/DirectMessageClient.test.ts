import { afterEach, describe, expect, test } from "bun:test";
import type { DirectMessage } from "@tilezo/protocol/messages";
import { DEFAULT_API_URL } from "../assets";
import { loadConversation, loadUnreadCounts } from "./DirectMessageClient";

const originalFetch = globalThis.fetch;
type FetchArgs = Parameters<typeof fetch>;

describe("loadConversation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("loads conversation history with the session cookie", async () => {
    const messages: DirectMessage[] = [
      {
        type: "dm.message",
        id: "dm_1",
        fromUserId: "user_1",
        toUserId: "user_2",
        text: "hi",
        sentAt: "2026-06-13T00:00:00.000Z",
      },
    ];
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ messages });
    }) as unknown as typeof fetch;

    await expect(loadConversation("user_2")).resolves.toEqual(messages);
    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/friends/user_2/messages`,
        init: { credentials: "include" },
      },
    ]);
  });

  test("throws the server error message on failure", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { error: { message: "You can only message your friends" } },
        { status: 400 },
      )) as unknown as typeof fetch;

    await expect(loadConversation("user_2")).rejects.toThrow("only message your friends");
  });

  test("loads unread counts", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ unread: [{ friendId: "user_2", count: 3 }] });
    }) as unknown as typeof fetch;

    await expect(loadUnreadCounts()).resolves.toEqual([{ friendId: "user_2", count: 3 }]);
    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/direct-messages/unread`,
        init: { credentials: "include" },
      },
    ]);
  });
});
