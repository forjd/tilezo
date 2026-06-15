import { describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { DEFAULT_AVATAR_APPEARANCE, type ServerMessage } from "@tilezo/protocol";
import type { Server, ServerWebSocket } from "bun";
import type { AuthService } from "./auth/auth";
import type { PersistenceStore } from "./db/persistence";
import type { SocketData } from "./net/socketTypes";
import { type ServerRuntime, type ServerRuntimeDeps, startServerRuntime } from "./serverRuntime";

type ServeOptions = Parameters<NonNullable<ServerRuntimeDeps["serve"]>>[0];
type Signal = "SIGINT" | "SIGTERM";

type TimerDouble = {
  callback: () => void;
  ms: number;
  unrefCalled: boolean;
  unref: () => void;
};

describe("startServerRuntime", () => {
  test("starts, routes HTTP requests, and cleans up on shutdown", async () => {
    const harness = createRuntimeHarness({ env: { PORT: "4921" } });

    const runtime = await startServerRuntime(harness.deps);

    expect(runtime.config.host).toBe("127.0.0.1");
    expect(harness.serveOptions.hostname).toBe("127.0.0.1");
    expect(harness.serveOptions.port).toBe(4921);
    expect(harness.timers).toHaveLength(2);
    expect(harness.timers.map((timer) => timer.unrefCalled)).toEqual([true, true]);
    expect([...harness.signalHandlers.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);

    const health = await harness.serveOptions.fetch(
      new Request("http://localhost/health"),
      harness.server,
    );
    expect(health?.status).toBe(200);
    expect(await health?.json()).toEqual({ ok: true });

    const unknown = await harness.serveOptions.fetch(
      new Request("http://localhost/not-found"),
      harness.server,
    );
    expect(unknown?.status).toBe(200);
    expect(await unknown?.text()).toContain("Tilezo room server");

    harness.timers[0]?.callback();
    await expect(runtime.shutdown("SIGTERM")).rejects.toThrow("exit:0");
    expect(harness.cleared).toEqual([harness.timers[1], harness.timers[0]]);
    expect(harness.stops).toEqual([true]);
    expect(harness.exitCodes).toEqual([0]);

    await expect(runtime.shutdown("SIGTERM")).resolves.toBeUndefined();
    expect(harness.exitCodes).toEqual([0]);
  });

  test("uses trusted forwarding headers for HTTP client keys", async () => {
    let requestIndex = 0;
    const harness = createRuntimeHarness({
      env: { CLIENT_EVENT_RATE_LIMIT_MAX: "1", TRUST_PROXY: "true" },
      requestIP: () => `10.0.0.${++requestIndex}`,
    });
    const runtime = await startServerRuntime(harness.deps);

    const first = await harness.serveOptions.fetch(clientEventRequest(), harness.server);
    const second = await harness.serveOptions.fetch(clientEventRequest(), harness.server);
    const fallback = await harness.serveOptions.fetch(
      new Request("http://localhost/health"),
      harness.server,
    );

    expect(first?.status).toBe(202);
    expect(second?.status).toBe(429);
    expect(fallback?.status).toBe(200);

    await stopRuntime(runtime);
  });

  test("rejects unauthenticated websocket handshakes and handles socket messages", async () => {
    const harness = createRuntimeHarness({ publishResult: -1 });
    const runtime = await startServerRuntime(harness.deps);

    const forbiddenOrigin = await harness.serveOptions.fetch(
      new Request("http://localhost/ws", {
        headers: { origin: "https://evil.example" },
      }),
      harness.server,
    );
    expect(forbiddenOrigin?.status).toBe(403);

    const unauthenticated = await harness.serveOptions.fetch(
      new Request("http://localhost/ws"),
      harness.server,
    );
    expect(unauthenticated?.status).toBe(401);

    const socket = createSocket({
      userId: "user_1",
      username: "Dan",
      connectionId: "socket_1",
      dollars: 0,
    });
    harness.serveOptions.websocket.open(socket);
    harness.serveOptions.websocket.message(socket, new Uint8Array([1, 2, 3]));
    harness.serveOptions.websocket.message(
      socket,
      JSON.stringify({ type: "room.join", roomId: "lobby" }),
    );
    await flushAsyncMessages();
    harness.serveOptions.websocket.close(socket);

    expect(socket.sent[0]).toEqual({ type: "connected", userId: "user_1", dollars: 0 });
    expect(socket.sent).toContainEqual({
      type: "error",
      code: "INVALID_MESSAGE",
      message: "Unsupported message type",
    });
    expect(socket.subscribed).toEqual(["user:user_1", "room:lobby"]);
    expect(socket.unsubscribed).toContain("room:lobby");
    expect(harness.published).toContainEqual({
      topic: "room:lobby",
      message: {
        type: "user.joined",
        user: {
          id: "user_1",
          username: "Dan",
          position: { x: 0, y: 0 },
          appearance: DEFAULT_AVATAR_APPEARANCE,
        },
      },
    });

    await stopRuntime(runtime);
  });

  test("rate limits websocket upgrades and caps active sockets per user", async () => {
    const harness = createRuntimeHarness({
      env: { WEBSOCKET_UPGRADE_RATE_LIMIT_MAX: "1", MAX_WEBSOCKET_CONNECTIONS_PER_USER: "1" },
    });
    const auth = {
      verifyToken: async (token: string) =>
        token === "good-token"
          ? {
              id: "user_1",
              username: "Dan",
              appearance: DEFAULT_AVATAR_APPEARANCE,
              dollars: 500,
            }
          : undefined,
    } as unknown as AuthService;
    const runtime = await startServerRuntime({ ...harness.deps, auth });

    const firstIp = await harness.serveOptions.fetch(webSocketRequest("bad-token"), harness.server);
    const secondIp = await harness.serveOptions.fetch(
      webSocketRequest("bad-token"),
      harness.server,
    );
    expect(firstIp?.status).toBe(401);
    expect(secondIp?.status).toBe(429);

    await stopRuntime(runtime);

    const capHarness = createRuntimeHarness({ env: { MAX_WEBSOCKET_CONNECTIONS_PER_USER: "1" } });
    const capRuntime = await startServerRuntime({ ...capHarness.deps, auth });
    const existing = createSocket({
      userId: "user_1",
      username: "Dan",
      connectionId: "socket_existing",
      dollars: 500,
    });
    capHarness.serveOptions.websocket.open(existing);

    const capped = await capHarness.serveOptions.fetch(
      webSocketRequest("good-token"),
      capHarness.server,
    );
    expect(capped?.status).toBe(429);
    expect(await capped?.json()).toMatchObject({ error: { code: "TOO_MANY_CONNECTIONS" } });

    capHarness.serveOptions.websocket.close(existing);
    await stopRuntime(capRuntime);
  });

  test("upgrades authenticated websocket handshakes and reports failed upgrades", async () => {
    const harness = createRuntimeHarness();
    let resumeShouldThrow = false;
    const runtime = await startServerRuntime({
      ...harness.deps,
      auth: {
        verifyToken: async (token: string) =>
          token === "good-token"
            ? {
                id: "user_1",
                username: "Dan",
                appearance: DEFAULT_AVATAR_APPEARANCE,
                dollars: 500,
              }
            : undefined,
      } as unknown as AuthService,
      persistence: {
        async getRoom() {
          return undefined;
        },
        async seedRoom() {},
        async listRooms() {
          return [];
        },
        async getLastRoomIdForUser() {
          if (resumeShouldThrow) {
            throw new Error("resume failed");
          }
          return "studio";
        },
      } as unknown as PersistenceStore,
    });

    const upgraded = await harness.serveOptions.fetch(
      webSocketRequest("good-token"),
      harness.server,
    );

    expect(upgraded).toBeUndefined();
    expect(harness.upgrades[0]).toEqual({
      userId: "user_1",
      username: "Dan",
      connectionId: "socket_runtime",
      resumeRoomId: "studio",
      appearance: DEFAULT_AVATAR_APPEARANCE,
      dollars: 500,
    });

    resumeShouldThrow = true;
    harness.setUpgradeResult(false);
    const failed = await harness.serveOptions.fetch(webSocketRequest("good-token"), harness.server);

    expect(failed?.status).toBe(400);
    expect(harness.upgrades[1]).toEqual({
      userId: "user_1",
      username: "Dan",
      connectionId: "socket_runtime",
      resumeRoomId: undefined,
      appearance: DEFAULT_AVATAR_APPEARANCE,
      dollars: 500,
    });

    await stopRuntime(runtime);
  });

  test("constructs database-backed services when a database is available", async () => {
    const harness = createRuntimeHarness();
    const runtime = await startServerRuntime({
      ...harness.deps,
      database: {} as NonNullable<ServerRuntimeDeps["database"]>,
      persistence: persistenceDouble(),
    });

    expect(runtime.config.host).toBe("127.0.0.1");
    expect(harness.serveOptions.websocket.maxPayloadLength).toBeGreaterThan(0);
    expect(harness.timers).toHaveLength(3);
    harness.timers[1]?.callback();

    await stopRuntime(runtime);
  });

  test("starts through the default Bun.serve adapter", async () => {
    const port = await getAvailablePort();
    const runtime = await startServerRuntime({
      env: {
        HOST: "127.0.0.1",
        LOG_LEVEL: "error",
        PORT: port.toString(),
      },
      process: processDouble(),
    });

    const response = await fetch(`http://127.0.0.1:${runtime.server.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    await stopRuntime(runtime);
  });
});

function createRuntimeHarness(
  options: {
    env?: Record<string, string | undefined>;
    publishResult?: number;
    requestIP?: string | (() => string | undefined);
    upgradeResult?: boolean;
  } = {},
) {
  let serveOptions: ServeOptions | undefined;
  let publishResult = options.publishResult ?? 0;
  let upgradeResult = options.upgradeResult ?? true;
  const timers: TimerDouble[] = [];
  const cleared: unknown[] = [];
  const stops: boolean[] = [];
  const exitCodes: number[] = [];
  const published: { topic: string; message: ServerMessage }[] = [];
  const upgrades: SocketData[] = [];
  const signalHandlers = new Map<Signal, () => void>();

  const server = {
    port: Number(options.env?.PORT ?? 4100),
    publish(topic: string, raw: string) {
      published.push({ topic, message: JSON.parse(raw) as ServerMessage });
      return publishResult;
    },
    requestIP() {
      const address =
        typeof options.requestIP === "function"
          ? options.requestIP()
          : (options.requestIP ?? "203.0.113.20");
      return address ? ({ address, family: "IPv4", port: 12345 } as unknown) : null;
    },
    async stop(force?: boolean) {
      stops.push(Boolean(force));
    },
    upgrade(_request: Request, upgradeOptions: { data?: SocketData }) {
      upgrades.push(upgradeOptions.data as SocketData);
      return upgradeResult;
    },
  } as unknown as Server<SocketData>;

  const deps: ServerRuntimeDeps = {
    env: {
      HOST: "127.0.0.1",
      LOG_LEVEL: "error",
      PORT: "4100",
      ...options.env,
    },
    serve(options) {
      serveOptions = options;
      return server;
    },
    setInterval(callback, ms) {
      const timer: TimerDouble = {
        callback,
        ms,
        unrefCalled: false,
        unref() {
          timer.unrefCalled = true;
        },
      };
      timers.push(timer);
      return timer;
    },
    clearInterval(timer) {
      cleared.push(timer);
    },
    createSocketId(prefix) {
      return `${prefix}_runtime`;
    },
    process: {
      exit(code = 0): never {
        exitCodes.push(code);
        throw new Error(`exit:${code}`);
      },
      on(event, listener) {
        signalHandlers.set(event, listener);
      },
    },
  };

  return {
    deps,
    server,
    timers,
    cleared,
    stops,
    exitCodes,
    published,
    upgrades,
    signalHandlers,
    get serveOptions() {
      if (!serveOptions) {
        throw new Error("server was not started");
      }
      return serveOptions;
    },
    setPublishResult(result: number) {
      publishResult = result;
    },
    setUpgradeResult(result: boolean) {
      upgradeResult = result;
    },
  };
}

function createSocket(data: SocketData) {
  const sent: ServerMessage[] = [];
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];

  return {
    data,
    sent,
    subscribed,
    unsubscribed,
    send(message: string) {
      sent.push(JSON.parse(message) as ServerMessage);
    },
    subscribe(topic: string) {
      subscribed.push(topic);
    },
    unsubscribe(topic: string) {
      unsubscribed.push(topic);
    },
    close() {},
  } as unknown as ServerWebSocket<SocketData> & {
    sent: ServerMessage[];
    subscribed: string[];
    unsubscribed: string[];
  };
}

function clientEventRequest(): Request {
  return new Request("http://localhost/client-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.7, 10.0.0.1",
    },
    body: JSON.stringify({ event: "boot" }),
  });
}

function webSocketRequest(token: string): Request {
  return new Request("http://localhost/ws", {
    headers: {
      authorization: `Bearer ${token}`,
      origin: "http://localhost:3001",
    },
  });
}

function persistenceDouble(): PersistenceStore {
  return {
    async getRoom() {
      return undefined;
    },
    async seedRoom() {},
    async listRooms() {
      return [];
    },
  };
}

function processDouble(): NonNullable<ServerRuntimeDeps["process"]> {
  return {
    exit(code = 0): never {
      throw new Error(`exit:${code}`);
    },
    on() {},
  };
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return address.port;
}

async function stopRuntime(runtime: ServerRuntime): Promise<void> {
  try {
    await runtime.shutdown("test");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("exit:")) {
      throw error;
    }
  }
}

async function flushAsyncMessages(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
