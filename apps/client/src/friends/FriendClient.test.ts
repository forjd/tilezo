import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { DEFAULT_API_URL } from "../assets";
import { addFriend, listFriends, removeFriend } from "./FriendClient";

const originalFetch = globalThis.fetch;
type FetchArgs = Parameters<typeof fetch>;

describe("FriendClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("lists friends with the bearer token", async () => {
    const friends = [
      {
        id: "user_2",
        username: "Kai",
        appearance: DEFAULT_AVATAR_APPEARANCE,
        online: true,
        roomId: "lobby",
        canJoinRoom: true,
      },
    ];
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ friends });
    }) as unknown as typeof fetch;

    await expect(listFriends("token")).resolves.toEqual(friends);
    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/friends`,
        init: { headers: { authorization: "Bearer token" } },
      },
    ]);
  });

  test("adds and removes friends", async () => {
    const friend = {
      id: "user_2",
      username: "Kai",
      appearance: DEFAULT_AVATAR_APPEARANCE,
      online: false,
      canJoinRoom: false,
    };
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json(String(url).endsWith("/friends") ? { friend } : { ok: true });
    }) as unknown as typeof fetch;

    await expect(addFriend("token", "Kai")).resolves.toEqual(friend);
    await expect(removeFriend("token", "user_2")).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        url: `${DEFAULT_API_URL}/friends`,
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ username: "Kai" }),
        },
      },
      {
        url: `${DEFAULT_API_URL}/friends/user_2`,
        init: {
          method: "DELETE",
          headers: { authorization: "Bearer token" },
        },
      },
    ]);
  });
});
