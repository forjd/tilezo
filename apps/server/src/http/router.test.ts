import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { AuthError, type AuthService } from "../auth/auth";
import { FixedWindowRateLimiter } from "../auth/rateLimit";
import { getConfig } from "../config";
import type { PersistenceStore } from "../db/persistence";
import { FriendError, type FriendService } from "../friends/friends";
import type { Logger } from "../observability/logger";
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

const authUser = { id: "user_1", username: "Dan", appearance: DEFAULT_AVATAR_APPEARANCE };
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
      add: async () => ({ ...authUser, online: false, canJoinRoom: false }),
      remove: async () => {},
    } as unknown as FriendService,
    persistence: {
      listOwnedRooms: async () => [],
      seedRoom: async () => {},
    } as unknown as PersistenceStore,
    rooms: {
      getMetrics: () => ({ activeRooms: 0, rooms: [], layouts: { public: 0, private: 0 } }),
      addRoom: () => {},
    } as unknown as RoomManager,
    registerRateLimiter: limiter(),
    loginRateLimiter: limiter(),
    roomCreateRateLimiter: limiter(),
    friendRateLimiter: limiter(),
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
      expect(await loggedIn.json()).toMatchObject({ token: "good-token" });
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

    test("returns 503 when no auth service is configured", async () => {
      const route = createHttpRouter(makeDeps({ auth: undefined }));
      expect((await route(request("/auth/login", { body: credentials }), "ip")).status).toBe(503);
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
        (await route(request("/me/appearance", { method: "DELETE", token: "good-token" }), "ip"))
          .status,
      ).toBe(405);
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
  });

  describe("friends", () => {
    test("lists, adds, and removes friends for authenticated users", async () => {
      const route = createHttpRouter(makeDeps());

      expect(
        (await route(request("/friends", { method: "GET", token: "good-token" }), "ip")).status,
      ).toBe(200);
      expect(
        (
          await route(
            request("/friends", { method: "POST", token: "good-token", body: { username: "Kai" } }),
            "ip",
          )
        ).status,
      ).toBe(201);
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
      ).toBe(201);
      expect(
        (await route(request("/friends", { method: "POST", token: "good-token", body }), "ip"))
          .status,
      ).toBe(429);
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
  });
});
