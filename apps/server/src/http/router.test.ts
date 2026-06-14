import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { AuthError, type AuthService } from "../auth/auth";
import { FixedWindowRateLimiter } from "../auth/rateLimit";
import { BlockError, type BlockService } from "../blocks/blocks";
import { getConfig } from "../config";
import type { PersistenceStore } from "../db/persistence";
import { EconomyError, type EconomyStore } from "../economy/economy";
import { FriendError, type FriendService } from "../friends/friends";
import { DirectMessageError, type DirectMessageService } from "../messaging/messaging";
import { createLogger, type LogEntry, type Logger } from "../observability/logger";
import { Metrics } from "../observability/metrics";
import type { RoomManager } from "../rooms/RoomManager";
import { createHttpRouter, type RouterDeps } from "./router";

const noopLogger = {
  child: () => noopLogger,
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger;

function captureLogger(entries: LogEntry[]): Logger {
  return createLogger({
    level: "debug",
    sink: (entry) => entries.push(entry),
  });
}

const authUser = {
  id: "user_1",
  username: "Dan",
  appearance: DEFAULT_AVATAR_APPEARANCE,
  dollars: 500,
};
const authSession = { user: authUser, token: "good-token" };

function makeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    config: getConfig({}),
    logger: noopLogger,
    metrics: new Metrics(),
    auth: {
      verifyToken: async (token: string) => (token === "good-token" ? authUser : undefined),
      createUser: async () => authSession,
      login: async () => authSession,
      logout: async () => {},
      updateAppearance: async (_id: string, appearance: typeof DEFAULT_AVATAR_APPEARANCE) => ({
        ...authUser,
        appearance,
      }),
    } as unknown as AuthService,
    friends: {
      list: async () => [],
      add: async () => ({
        friend: { ...authUser, online: false, canJoinRoom: false },
        status: "pending",
      }),
      remove: async () => {},
    } as unknown as FriendService,
    blocks: {
      list: async () => [],
      block: async () => {},
      unblock: async () => {},
    } as unknown as BlockService,
    directMessages: {
      history: async () => [
        {
          id: "dm_1",
          fromUserId: "user_1",
          toUserId: "user_2",
          text: "hi",
          sentAt: "2026-06-13T00:00:00.000Z",
        },
      ],
      unreadCounts: async () => [{ friendId: "user_2", count: 2 }],
    } as unknown as DirectMessageService,
    persistence: {
      listOwnedRooms: async () => [],
      seedRoom: async () => {},
    } as unknown as PersistenceStore,
    economy: {
      async getBalance() {
        return authUser.dollars;
      },
      async getInventory() {
        return [];
      },
      async purchase() {
        return { balance: authUser.dollars, inventory: [] };
      },
      async spend() {
        return { balance: authUser.dollars - 100 };
      },
      async reserveItem() {
        return true;
      },
      async refundItem() {},
    } as unknown as EconomyStore,
    publishUserMessage() {},
    rooms: {
      getMetrics: () => ({ activeRooms: 0, rooms: [], layouts: { public: 0, private: 0 } }),
      addRoom: () => {},
    } as unknown as RoomManager,
    registerRateLimiter: limiter(),
    loginRateLimiter: limiter(),
    roomCreateRateLimiter: limiter(),
    friendRateLimiter: limiter(),
    clientEventRateLimiter: limiter(),
    ...overrides,
  };
}

function limiter(limit = 100): FixedWindowRateLimiter {
  return new FixedWindowRateLimiter({ limit, windowMs: 60_000 });
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
};

function request(path: string, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const init: RequestInit = { method: options.method ?? "POST", headers };

  if (options.body !== undefined) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new Request(`http://localhost${path}`, init);
}

const credentials = { username: "Dan", password: "correct horse battery staple" };

describe("createHttpRouter", () => {
  test("answers CORS preflight and unknown routes", async () => {
    const route = createHttpRouter(makeDeps());

    const options = await route(request("/auth/login", { method: "OPTIONS" }), "ip");
    expect(options.headers.get("access-control-allow-origin")).toBe("*");

    const unknown = await route(request("/nope", { method: "GET" }), "ip");
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toContain("Tilezo room server");

    const health = await route(request("/health", { method: "GET" }), "ip");
    expect(await health.json()).toEqual({ ok: true });
  });

  describe("auth", () => {
    test("registers and logs in successfully", async () => {
      const route = createHttpRouter(makeDeps());

      const registered = await route(request("/auth/register", { body: credentials }), "ip");
      expect(registered.status).toBe(201);

      const loggedIn = await route(request("/auth/login", { body: credentials }), "ip");
      expect(loggedIn.status).toBe(200);
      expect(await loggedIn.json()).toEqual({ user: authUser });
    });

    test("rate limits registrations and logins", async () => {
      const route = createHttpRouter(
        makeDeps({ registerRateLimiter: limiter(1), loginRateLimiter: limiter(1) }),
      );

      expect((await route(request("/auth/register", { body: credentials }), "ip")).status).toBe(
        201,
      );
      expect((await route(request("/auth/register", { body: credentials }), "ip")).status).toBe(
        429,
      );
      expect((await route(request("/auth/login", { body: credentials }), "1.1.1.1")).status).toBe(
        200,
      );
      expect((await route(request("/auth/login", { body: credentials }), "1.1.1.1")).status).toBe(
        429,
      );
    });

    test("rate limits logins per username across IPs", async () => {
      const route = createHttpRouter(makeDeps({ loginRateLimiter: limiter(1) }));

      expect((await route(request("/auth/login", { body: credentials }), "1.1.1.1")).status).toBe(
        200,
      );
      // Different IP, same username -> the per-username bucket trips.
      expect((await route(request("/auth/login", { body: credentials }), "2.2.2.2")).status).toBe(
        429,
      );
    });

    test("rejects invalid and oversized bodies", async () => {
      const route = createHttpRouter(makeDeps());

      expect((await route(request("/auth/register", { body: "{" }), "ip")).status).toBe(400);
      expect((await route(request("/auth/register", { body: { username: 1 } }), "ip")).status).toBe(
        400,
      );

      const huge = JSON.stringify({ username: "Dan", password: "x".repeat(8192) });
      const tooLarge = await route(request("/auth/register", { body: huge }), "ip");
      expect(tooLarge.status).toBe(413);

      const declaredTooLarge = await route(
        request("/auth/register", {
          body: "{}",
          headers: { "content-length": "9000" },
        }),
        "ip",
      );
      expect(declaredTooLarge.status).toBe(413);
    });

    test("maps AuthError to its status and surfaces unexpected errors as 503", async () => {
      const taken = createHttpRouter(
        makeDeps({
          auth: {
            createUser: async () => {
              throw new AuthError("USERNAME_TAKEN", "Username is already taken");
            },
          } as unknown as AuthService,
        }),
      );
      const takenResponse = await taken(request("/auth/register", { body: credentials }), "ip");
      expect(takenResponse.status).toBe(409);

      const broken = createHttpRouter(
        makeDeps({
          auth: {
            createUser: async () => {
              throw new Error("db down");
            },
          } as unknown as AuthService,
        }),
      );
      const response = await broken(request("/auth/register", { body: credentials }), "ip");
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
    });

    test("maps remaining AuthError status codes", async () => {
      const cases: Array<{ error: AuthError; status: number }> = [
        { error: new AuthError("AUTH_BUSY", "Try again shortly"), status: 429 },
        { error: new AuthError("INVALID_CREDENTIALS", "Invalid credentials"), status: 401 },
        { error: new AuthError("PASSWORD_TOO_WEAK", "Password is too weak"), status: 400 },
      ];

      for (const { error, status } of cases) {
        const route = createHttpRouter(
          makeDeps({
            auth: {
              login: async () => {
                throw error;
              },
            } as unknown as AuthService,
          }),
        );
        const response = await route(request("/auth/login", { body: credentials }), "ip");

        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ error: { code: error.code } });
      }
    });

    test("returns 503 when no auth service is configured", async () => {
      const route = createHttpRouter(makeDeps({ auth: undefined }));
      expect((await route(request("/auth/login", { body: credentials }), "ip")).status).toBe(503);
      expect((await route(request("/auth/logout"), "ip")).status).toBe(503);
      expect((await route(request("/auth/session", { method: "GET" }), "ip")).status).toBe(503);
    });

    test("logout revokes sessions idempotently", async () => {
      let loggedOut: string | undefined;
      const route = createHttpRouter(
        makeDeps({
          auth: {
            verifyToken: async (token: string) => (token === "good-token" ? authUser : undefined),
            logout: async (userId: string) => {
              loggedOut = userId;
            },
          } as unknown as AuthService,
        }),
      );

      expect((await route(request("/auth/logout", { token: "good-token" }), "ip")).status).toBe(
        200,
      );
      expect(loggedOut).toBe("user_1");
      // No token: still 200, no logout call.
      loggedOut = undefined;
      expect((await route(request("/auth/logout"), "ip")).status).toBe(200);
      expect(loggedOut).toBeUndefined();
    });
  });

  describe("appearance", () => {
    test("reads and updates the authenticated user's appearance", async () => {
      const route = createHttpRouter(makeDeps());

      const get = await route(
        request("/me/appearance", { method: "GET", token: "good-token" }),
        "ip",
      );
      expect(get.status).toBe(200);

      const put = await route(
        request("/me/appearance", {
          method: "PUT",
          token: "good-token",
          body: { appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" } },
        }),
        "ip",
      );
      expect(put.status).toBe(200);
    });

    test("rejects unauthenticated, invalid, and wrong-method appearance requests", async () => {
      const route = createHttpRouter(makeDeps());

      expect((await route(request("/me/appearance", { method: "GET" }), "ip")).status).toBe(401);
      expect(
        (
          await route(
            request("/me/appearance", {
              method: "PUT",
              token: "good-token",
              body: { appearance: {} },
            }),
            "ip",
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await route(
            request("/me/appearance", {
              method: "PUT",
              token: "good-token",
              body: "{",
            }),
            "ip",
          )
        ).status,
      ).toBe(400);
      expect(
        (await route(request("/me/appearance", { method: "DELETE", token: "good-token" }), "ip"))
          .status,
      ).toBe(405);
    });

    test("returns 503 when no auth service is configured for appearance", async () => {
      const route = createHttpRouter(makeDeps({ auth: undefined }));
      expect(
        (await route(request("/me/appearance", { method: "GET", token: "good-token" }), "ip"))
          .status,
      ).toBe(503);
    });

    test("maps appearance update failures", async () => {
      const body = { appearance: { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" } };
      const missingUser = createHttpRouter(
        makeDeps({
          auth: {
            verifyToken: async () => authUser,
            updateAppearance: async () => {
              throw new AuthError("USER_NOT_FOUND", "No player found");
            },
          } as unknown as AuthService,
        }),
      );

      expect(
        (
          await missingUser(
            request("/me/appearance", { method: "PUT", token: "good-token", body }),
            "ip",
          )
        ).status,
      ).toBe(404);

      const broken = createHttpRouter(
        makeDeps({
          auth: {
            verifyToken: async () => authUser,
            updateAppearance: async () => {
              throw new Error("db down");
            },
          } as unknown as AuthService,
        }),
      );
      const response = await broken(
        request("/me/appearance", { method: "PUT", token: "good-token", body }),
        "ip",
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "APPEARANCE_UNAVAILABLE" },
      });
    });
  });

  describe("client events", () => {
    test("accepts telemetry and rejects oversized payloads", async () => {
      const route = createHttpRouter(makeDeps());

      const ok = await route(
        request("/client-events", { body: { event: "test", fields: { a: 1 }, level: "warn" } }),
        "ip",
      );
      expect(ok.status).toBe(202);

      const huge = await route(
        request("/client-events", { body: JSON.stringify({ event: "x".repeat(9000) }) }),
        "ip",
      );
      expect(huge.status).toBe(413);
    });

    test("rate limits telemetry per client", async () => {
      const route = createHttpRouter(makeDeps({ clientEventRateLimiter: limiter(1) }));

      expect(
        (
          await route(
            request("/client-events", { body: { event: "test", level: "error" } }),
            "client-1",
          )
        ).status,
      ).toBe(202);
      expect(
        (
          await route(
            request("/client-events", { body: { event: "test", level: "error" } }),
            "client-1",
          )
        ).status,
      ).toBe(429);
    });

    test("sanitizes telemetry and honors authenticated log levels", async () => {
      const entries: LogEntry[] = [];
      const route = createHttpRouter(makeDeps({ logger: captureLogger(entries) }));
      const longKey = "a".repeat(80);

      const debug = await route(
        request("/client-events", {
          token: "good-token",
          body: {
            event: " Player Joined! ",
            level: "debug",
            fields: { [longKey]: "b".repeat(300), count: 1 },
          },
        }),
        "ip",
      );
      const warn = await route(
        request("/client-events", {
          token: "good-token",
          body: { event: "lag", level: "warn" },
        }),
        "ip",
      );
      const error = await route(
        request("/client-events", {
          token: "good-token",
          body: { event: "explode", level: "error", fields: [] },
        }),
        "ip",
      );
      const invalidLevel = await route(
        request("/client-events", {
          token: "good-token",
          body: { event: "unknown level", level: "trace" },
        }),
        "ip",
      );
      const anonymous = await route(
        request("/client-events", {
          body: { event: 7, level: "error", fields: null },
        }),
        "ip",
      );
      const blankEvent = await route(
        request("/client-events", {
          body: { event: "   " },
        }),
        "ip",
      );

      expect([
        debug.status,
        warn.status,
        error.status,
        invalidLevel.status,
        anonymous.status,
        blankEvent.status,
      ]).toEqual([202, 202, 202, 202, 202, 202]);
      expect(entries.map((entry) => [entry.level, entry.event])).toEqual([
        ["debug", "client.player_joined_"],
        ["warn", "client.lag"],
        ["error", "client.explode"],
        ["info", "client.unknown_level"],
        ["info", "client.unknown"],
        ["info", "client.unknown"],
      ]);
      expect(entries[0]?.fields["a".repeat(64)]).toBe("b".repeat(240));
      expect(entries[0]?.fields.count).toBe(1);
      expect(entries[0]?.fields.userId).toBe("user_1");
      expect(entries[4]?.fields).not.toHaveProperty("userId");
    });

    test("rejects client event streams that fail while reading", async () => {
      const route = createHttpRouter(makeDeps());
      const stream = new ReadableStream({
        start(controller) {
          controller.error(new Error("read failed"));
        },
      });
      const response = await route(
        new Request("http://localhost/client-events", {
          body: stream,
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        "ip",
      );

      expect(response.status).toBe(400);
    });
  });

  describe("friends", () => {
    test("lists, adds, and removes friends for authenticated users", async () => {
      const route = createHttpRouter(makeDeps());

      expect(
        (await route(request("/friends", { method: "GET", token: "good-token" }), "ip")).status,
      ).toBe(200);
      const added = await route(
        request("/friends", { method: "POST", token: "good-token", body: { username: "Kai" } }),
        "ip",
      );
      expect(added.status).toBe(202);
      expect(await added.json()).toMatchObject({ status: "pending" });
      expect(
        (await route(request("/friends/user_2", { method: "DELETE", token: "good-token" }), "ip"))
          .status,
      ).toBe(200);
    });

    test("rejects unauthenticated access and surfaces FriendError", async () => {
      const route = createHttpRouter(
        makeDeps({
          friends: {
            add: async () => {
              throw new FriendError("USER_NOT_FOUND", "No player found");
            },
          } as unknown as FriendService,
        }),
      );

      expect((await route(request("/friends", { method: "GET" }), "ip")).status).toBe(401);

      const failed = await route(
        request("/friends", { method: "POST", token: "good-token", body: { username: "ghost" } }),
        "ip",
      );
      expect(failed.status).toBe(400);
      expect(await failed.json()).toMatchObject({ error: { code: "USER_NOT_FOUND" } });
    });

    test("rate limits friend additions", async () => {
      const route = createHttpRouter(makeDeps({ friendRateLimiter: limiter(1) }));
      const body = { username: "Kai" };

      expect(
        (await route(request("/friends", { method: "POST", token: "good-token", body }), "ip"))
          .status,
      ).toBe(202);
      expect(
        (await route(request("/friends", { method: "POST", token: "good-token", body }), "ip"))
          .status,
      ).toBe(429);
    });

    test("returns 200 when a friend request is accepted immediately", async () => {
      const route = createHttpRouter(
        makeDeps({
          friends: {
            list: async () => [],
            add: async () => ({
              friend: {
                ...authUser,
                id: "user_2",
                username: "Kai",
                online: true,
                canJoinRoom: true,
              },
              status: "accepted",
            }),
            remove: async () => {},
          } as unknown as FriendService,
        }),
      );

      const response = await route(
        request("/friends", { method: "POST", token: "good-token", body: { username: "Kai" } }),
        "ip",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "accepted" });
    });

    test("validates friend requests and unavailable dependencies", async () => {
      const missing = createHttpRouter(makeDeps({ friends: undefined }));
      expect(
        (await missing(request("/friends", { method: "GET", token: "good-token" }), "ip")).status,
      ).toBe(503);

      const route = createHttpRouter(makeDeps());
      expect(
        (await route(request("/friends", { method: "POST", token: "good-token", body: "{" }), "ip"))
          .status,
      ).toBe(400);
      expect(
        (
          await route(
            request("/friends", {
              method: "POST",
              token: "good-token",
              body: { username: " " },
            }),
            "ip",
          )
        ).status,
      ).toBe(400);
      expect(
        (await route(request("/friends/", { method: "DELETE", token: "good-token" }), "ip")).status,
      ).toBe(400);
      expect(
        (await route(request("/friends", { method: "PATCH", token: "good-token" }), "ip")).status,
      ).toBe(405);
    });

    test("maps unexpected friend failures", async () => {
      const route = createHttpRouter(
        makeDeps({
          friends: {
            list: async () => [],
            add: async () => {
              throw new Error("db down");
            },
            remove: async () => {},
          } as unknown as FriendService,
        }),
      );

      const response = await route(
        request("/friends", { method: "POST", token: "good-token", body: { username: "Kai" } }),
        "ip",
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "FRIENDS_FAILED" } });
    });
  });

  describe("direct messages", () => {
    test("returns conversation history for the authenticated user", async () => {
      const route = createHttpRouter(makeDeps());

      const response = await route(
        request("/friends/user_2/messages", { method: "GET", token: "good-token" }),
        "ip",
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ messages: [{ id: "dm_1", text: "hi" }] });
    });

    test("rejects unauthenticated history requests", async () => {
      const route = createHttpRouter(makeDeps());
      const response = await route(request("/friends/user_2/messages", { method: "GET" }), "ip");
      expect(response.status).toBe(401);
    });

    test("surfaces a non-friend history rejection", async () => {
      const route = createHttpRouter(
        makeDeps({
          directMessages: {
            history: async () => {
              throw new DirectMessageError("NOT_FRIENDS", "You can only message your friends");
            },
          } as unknown as DirectMessageService,
        }),
      );

      const response = await route(
        request("/friends/user_2/messages", { method: "GET", token: "good-token" }),
        "ip",
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "NOT_FRIENDS" } });
    });

    test("returns unread direct message counts", async () => {
      const route = createHttpRouter(makeDeps());

      const response = await route(
        request("/direct-messages/unread", { method: "GET", token: "good-token" }),
        "ip",
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ unread: [{ friendId: "user_2", count: 2 }] });
    });

    test("passes positive history limits to the direct message service", async () => {
      let seenLimit: number | undefined;
      const route = createHttpRouter(
        makeDeps({
          directMessages: {
            history: async (_userId: string, _friendId: string, limit?: number) => {
              seenLimit = limit;
              return [];
            },
            unreadCounts: async () => [],
          } as unknown as DirectMessageService,
        }),
      );

      const response = await route(
        request("/friends/user_2/messages?limit=10", { method: "GET", token: "good-token" }),
        "ip",
      );

      expect(response.status).toBe(200);
      expect(seenLimit).toBe(10);
    });

    test("validates direct message access and unavailable dependencies", async () => {
      const missing = createHttpRouter(makeDeps({ directMessages: undefined }));
      expect(
        (
          await missing(
            request("/friends/user_2/messages", { method: "GET", token: "good-token" }),
            "ip",
          )
        ).status,
      ).toBe(503);
      expect(
        (
          await missing(
            request("/direct-messages/unread", { method: "GET", token: "good-token" }),
            "ip",
          )
        ).status,
      ).toBe(503);

      const route = createHttpRouter(makeDeps());
      expect(
        (await route(request("/direct-messages/unread", { method: "GET" }), "ip")).status,
      ).toBe(401);
      expect(
        (await route(request("/friends//messages", { method: "GET", token: "good-token" }), "ip"))
          .status,
      ).toBe(400);
    });

    test("maps unexpected direct message failures", async () => {
      const history = createHttpRouter(
        makeDeps({
          directMessages: {
            history: async () => {
              throw new Error("db down");
            },
            unreadCounts: async () => [],
          } as unknown as DirectMessageService,
        }),
      );
      const historyResponse = await history(
        request("/friends/user_2/messages", { method: "GET", token: "good-token" }),
        "ip",
      );
      expect(historyResponse.status).toBe(400);
      expect(await historyResponse.json()).toMatchObject({ error: { code: "DM_FAILED" } });

      const unread = createHttpRouter(
        makeDeps({
          directMessages: {
            history: async () => [],
            unreadCounts: async () => {
              throw new Error("db down");
            },
          } as unknown as DirectMessageService,
        }),
      );
      const unreadResponse = await unread(
        request("/direct-messages/unread", { method: "GET", token: "good-token" }),
        "ip",
      );
      expect(unreadResponse.status).toBe(400);
      expect(await unreadResponse.json()).toMatchObject({ error: { code: "DM_FAILED" } });
    });
  });

  describe("blocked users", () => {
    test("blocks, lists, and unblocks users", async () => {
      const blocked: string[] = [];
      const unblocked: string[] = [];
      const route = createHttpRouter(
        makeDeps({
          blocks: {
            list: async () => [
              {
                id: "user_2",
                username: "Kai",
                appearance: DEFAULT_AVATAR_APPEARANCE,
                blockedAt: "2026-06-13T00:00:00.000Z",
              },
            ],
            block: async (_userId: string, blockedUserId: string) => {
              blocked.push(blockedUserId);
            },
            unblock: async (_userId: string, blockedUserId: string) => {
              unblocked.push(blockedUserId);
            },
          } as unknown as BlockService,
        }),
      );

      const post = await route(
        request("/blocked-users", {
          method: "POST",
          token: "good-token",
          body: { userId: "user_2" },
        }),
        "ip",
      );
      const list = await route(
        request("/blocked-users", { method: "GET", token: "good-token" }),
        "ip",
      );
      const remove = await route(
        request("/blocked-users/user_2", { method: "DELETE", token: "good-token" }),
        "ip",
      );

      expect(post.status).toBe(200);
      expect(list.status).toBe(200);
      expect(await list.json()).toMatchObject({ blockedUsers: [{ id: "user_2" }] });
      expect(remove.status).toBe(200);
      expect(blocked).toEqual(["user_2"]);
      expect(unblocked).toEqual(["user_2"]);
    });

    test("rejects invalid and unauthenticated block requests", async () => {
      const route = createHttpRouter(
        makeDeps({
          blocks: {
            list: async () => [],
            block: async () => {
              throw new BlockError("INVALID_BLOCK", "You cannot block yourself");
            },
            unblock: async () => {},
          } as unknown as BlockService,
        }),
      );

      const unauthenticated = await route(request("/blocked-users", { method: "GET" }), "ip");
      const invalid = await route(
        request("/blocked-users", {
          method: "POST",
          token: "good-token",
          body: { userId: "user_1" },
        }),
        "ip",
      );

      expect(unauthenticated.status).toBe(401);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_BLOCK" } });
    });

    test("validates block requests and unavailable dependencies", async () => {
      const missing = createHttpRouter(makeDeps({ blocks: undefined }));
      expect(
        (await missing(request("/blocked-users", { method: "GET", token: "good-token" }), "ip"))
          .status,
      ).toBe(503);

      const route = createHttpRouter(makeDeps());
      expect(
        (
          await route(
            request("/blocked-users", { method: "POST", token: "good-token", body: "{" }),
            "ip",
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await route(
            request("/blocked-users", {
              method: "POST",
              token: "good-token",
              body: { userId: " " },
            }),
            "ip",
          )
        ).status,
      ).toBe(400);
      expect(
        (await route(request("/blocked-users/", { method: "DELETE", token: "good-token" }), "ip"))
          .status,
      ).toBe(400);
      expect(
        (await route(request("/blocked-users", { method: "PATCH", token: "good-token" }), "ip"))
          .status,
      ).toBe(405);
    });

    test("rate limits block additions and maps unexpected failures", async () => {
      const limited = createHttpRouter(makeDeps({ friendRateLimiter: limiter(1) }));
      const body = { userId: "user_2" };

      expect(
        (
          await limited(
            request("/blocked-users", { method: "POST", token: "good-token", body }),
            "ip",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await limited(
            request("/blocked-users", { method: "POST", token: "good-token", body }),
            "ip",
          )
        ).status,
      ).toBe(429);

      const broken = createHttpRouter(
        makeDeps({
          blocks: {
            list: async () => [],
            block: async () => {
              throw new Error("db down");
            },
            unblock: async () => {},
          } as unknown as BlockService,
        }),
      );
      const response = await broken(
        request("/blocked-users", { method: "POST", token: "good-token", body }),
        "ip",
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "BLOCKS_FAILED" } });
    });
  });

  describe("rooms", () => {
    test("lists templates and creates a room", async () => {
      const route = createHttpRouter(makeDeps());

      expect((await route(request("/room-templates", { method: "GET" }), "ip")).status).toBe(200);

      const created = await route(
        request("/rooms", {
          token: "good-token",
          body: { templateId: "compact-studio", name: "My Room" },
        }),
        "ip",
      );
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({ room: { name: "My Room" } });
    });

    test("enforces the per-user room cap and rate limit", async () => {
      const owned = Array.from({ length: getConfig({}).maxRoomsPerUser }, () => ({
        layout: { id: "r", name: "R", width: 3, height: 3, spawn: { x: 1, y: 1 }, tiles: [] },
        ownerUserId: "user_1",
      }));
      const capped = createHttpRouter(
        makeDeps({
          persistence: {
            listOwnedRooms: async () => owned,
            seedRoom: async () => {},
          } as unknown as PersistenceStore,
        }),
      );
      const cappedResponse = await capped(
        request("/rooms", {
          token: "good-token",
          body: { templateId: "compact-studio", name: "X" },
        }),
        "ip",
      );
      expect(cappedResponse.status).toBe(409);

      const rateLimited = createHttpRouter(makeDeps({ roomCreateRateLimiter: limiter(1) }));
      const body = { templateId: "compact-studio", name: "X" };
      expect(
        (await rateLimited(request("/rooms", { token: "good-token", body }), "ip")).status,
      ).toBe(201);
      expect(
        (await rateLimited(request("/rooms", { token: "good-token", body }), "ip")).status,
      ).toBe(429);
    });

    test("rejects unauthenticated and invalid room creation", async () => {
      const route = createHttpRouter(makeDeps());

      expect(
        (
          await route(
            request("/rooms", { body: { templateId: "compact-studio", name: "X" } }),
            "ip",
          )
        ).status,
      ).toBe(401);

      const invalid = await route(
        request("/rooms", { token: "good-token", body: { templateId: "nope" } }),
        "ip",
      );
      expect(invalid.status).toBe(400);
    });

    test("validates room creation dependencies and request bodies", async () => {
      const missing = createHttpRouter(makeDeps({ persistence: undefined }));
      expect(
        (
          await missing(
            request("/rooms", {
              token: "good-token",
              body: { templateId: "compact-studio", name: "My Room" },
            }),
            "ip",
          )
        ).status,
      ).toBe(503);

      const route = createHttpRouter(makeDeps());
      expect(
        (await route(request("/rooms", { token: "good-token", body: "{" }), "ip")).status,
      ).toBe(400);
    });

    test("creates a room when owned room lookup is unavailable", async () => {
      const route = createHttpRouter(
        makeDeps({
          persistence: {
            seedRoom: async () => {},
          } as unknown as PersistenceStore,
        }),
      );

      const response = await route(
        request("/rooms", {
          token: "good-token",
          body: { templateId: "compact-studio", name: "My Room" },
        }),
        "ip",
      );
      expect(response.status).toBe(201);
    });

    test("maps room persistence failures as invalid room responses", async () => {
      const route = createHttpRouter(
        makeDeps({
          persistence: {
            listOwnedRooms: async () => [],
            seedRoom: async () => {
              throw new Error("db down");
            },
          } as unknown as PersistenceStore,
        }),
      );

      const response = await route(
        request("/rooms", {
          token: "good-token",
          body: { templateId: "compact-studio", name: "My Room" },
        }),
        "ip",
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_ROOM" } });
    });
  });

  describe("inventory", () => {
    test("lists inventory and purchases items for authenticated users", async () => {
      const published: unknown[] = [];
      const route = createHttpRouter(
        makeDeps({
          economy: {
            async getInventory(userId: string) {
              expect(userId).toBe("user_1");
              return [{ itemType: "woven_rug", quantity: 2 }];
            },
            async purchase(userId: string, itemType: string) {
              expect(userId).toBe("user_1");
              expect(itemType).toBe("crate_table");
              return {
                balance: 450,
                inventory: [{ itemType: "crate_table", quantity: 1 }],
              };
            },
            async getBalance() {
              return 500;
            },
            async spend() {
              return { balance: 400 };
            },
            async reserveItem() {
              return true;
            },
            async refundItem() {},
          } as unknown as EconomyStore,
          publishUserMessage(userId, message) {
            published.push({ userId, message });
          },
        }),
      );

      const inventory = await route(
        request("/inventory", { method: "GET", token: "good-token" }),
        "ip",
      );
      expect(inventory.status).toBe(200);
      expect(await inventory.json()).toEqual({ items: [{ itemType: "woven_rug", quantity: 2 }] });

      const purchased = await route(
        request("/inventory/purchase", {
          token: "good-token",
          body: { itemType: " crate_table " },
        }),
        "ip",
      );
      expect(purchased.status).toBe(200);
      expect(await purchased.json()).toEqual({
        balance: 450,
        items: [{ itemType: "crate_table", quantity: 1 }],
      });
      expect(published).toEqual([
        { userId: "user_1", message: { type: "balance.updated", dollars: 450 } },
        {
          userId: "user_1",
          message: { type: "inventory.updated", items: [{ itemType: "crate_table", quantity: 1 }] },
        },
      ]);
    });

    test("validates inventory access, request bodies, and economy errors", async () => {
      const missing = createHttpRouter(makeDeps({ economy: undefined }));
      expect(
        (await missing(request("/inventory", { method: "GET", token: "good-token" }), "ip")).status,
      ).toBe(503);
      expect(
        (await missing(request("/inventory/purchase", { token: "good-token", body: {} }), "ip"))
          .status,
      ).toBe(503);

      const route = createHttpRouter(makeDeps());
      expect((await route(request("/inventory", { method: "GET" }), "ip")).status).toBe(401);
      expect((await route(request("/inventory/purchase", { body: {} }), "ip")).status).toBe(401);
      expect(
        (await route(request("/inventory/purchase", { token: "good-token", body: "{" }), "ip"))
          .status,
      ).toBe(400);
      expect(
        (
          await route(
            request("/inventory/purchase", { token: "good-token", body: { itemType: " " } }),
            "ip",
          )
        ).status,
      ).toBe(400);

      const insufficientFunds = createHttpRouter(
        makeDeps({
          economy: {
            async getInventory() {
              return [];
            },
            async purchase() {
              throw new EconomyError("INSUFFICIENT_FUNDS", "You need $50 to buy this item");
            },
          } as unknown as EconomyStore,
        }),
      );
      const failed = await insufficientFunds(
        request("/inventory/purchase", {
          token: "good-token",
          body: { itemType: "crate_table" },
        }),
        "ip",
      );
      expect(failed.status).toBe(402);
      expect(await failed.json()).toMatchObject({ error: { code: "INSUFFICIENT_FUNDS" } });

      const unknownItem = createHttpRouter(
        makeDeps({
          economy: {
            async getInventory() {
              return [];
            },
            async purchase() {
              throw new EconomyError("UNKNOWN_ITEM_TYPE", "This item is not for sale");
            },
          } as unknown as EconomyStore,
        }),
      );
      const unknown = await unknownItem(
        request("/inventory/purchase", {
          token: "good-token",
          body: { itemType: "no_such_item" },
        }),
        "ip",
      );
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toMatchObject({ error: { code: "UNKNOWN_ITEM_TYPE" } });
    });
  });

  describe("cookie sessions", () => {
    test("delivers an HttpOnly session cookie on login and clears it on logout", async () => {
      const route = createHttpRouter(makeDeps());

      const loggedIn = await route(request("/auth/login", { body: credentials }), "ip");
      const setCookie = loggedIn.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("tilezo_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");

      const loggedOut = await route(request("/auth/logout", { token: "good-token" }), "ip");
      expect(loggedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    });

    test("authenticates GET /auth/session from the cookie", async () => {
      const route = createHttpRouter(makeDeps());

      const signedIn = await route(
        request("/auth/session", {
          method: "GET",
          headers: { cookie: "tilezo_session=good-token" },
        }),
        "ip",
      );
      expect(signedIn.status).toBe(200);
      expect(await signedIn.json()).toMatchObject({ user: { id: "user_1" } });

      const anon = await route(request("/auth/session", { method: "GET" }), "ip");
      expect(anon.status).toBe(401);
    });

    test("treats malformed session cookies as unauthenticated", async () => {
      const route = createHttpRouter(makeDeps());

      const response = await route(
        request("/auth/session", {
          method: "GET",
          headers: { cookie: "tilezo_session=%" },
        }),
        "ip",
      );

      expect(response.status).toBe(401);

      const unrelated = await route(
        request("/auth/session", {
          method: "GET",
          headers: { cookie: "other=value" },
        }),
        "ip",
      );

      expect(unrelated.status).toBe(401);
    });

    test("echoes an allowed origin with credentials but not a wildcard", async () => {
      const route = createHttpRouter(makeDeps());

      const allowed = await route(
        request("/auth/login", { body: credentials, headers: { origin: "http://localhost:3001" } }),
        "ip",
      );
      expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3001");
      expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

      const disallowed = await route(
        request("/auth/login", { body: credentials, headers: { origin: "http://evil.example" } }),
        "ip",
      );
      expect(disallowed.headers.get("access-control-allow-origin")).toBe("*");
      expect(disallowed.headers.get("access-control-allow-credentials")).toBeNull();
    });
  });

  describe("metrics", () => {
    test("serves metrics openly in development and resets", async () => {
      const route = createHttpRouter(makeDeps());

      expect((await route(request("/debug/metrics", { method: "GET" }), "ip")).status).toBe(200);
      expect((await route(request("/debug/metrics/reset", { method: "POST" }), "ip")).status).toBe(
        200,
      );
    });

    test("gates metrics and reset in production", async () => {
      const config = getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/tilezo",
        AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        METRICS_TOKEN: "metrics-secret",
      });
      const route = createHttpRouter(makeDeps({ config }));

      expect((await route(request("/debug/metrics", { method: "GET" }), "ip")).status).toBe(404);
      const allowed = await route(
        request("/debug/metrics?token=metrics-secret", { method: "GET" }),
        "ip",
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("access-control-allow-origin")).toBeNull();
      expect((await route(request("/debug/metrics/reset", { method: "POST" }), "ip")).status).toBe(
        404,
      );
    });

    test("allows production metrics with bearer token and denies missing tokens", async () => {
      const config = getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/tilezo",
        AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        METRICS_TOKEN: "metrics-secret",
      });
      const route = createHttpRouter(makeDeps({ config }));

      expect(
        (
          await route(
            request("/debug/metrics", {
              method: "GET",
              headers: { authorization: "Bearer metrics-secret" },
            }),
            "ip",
          )
        ).status,
      ).toBe(200);

      const noTokenConfig = getConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/tilezo",
        AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      });
      const noToken = createHttpRouter(makeDeps({ config: noTokenConfig }));
      expect((await noToken(request("/debug/metrics", { method: "GET" }), "ip")).status).toBe(404);
    });
  });
});
