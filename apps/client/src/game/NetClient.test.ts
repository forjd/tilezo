import { afterEach, describe, expect, test } from "bun:test";
import type { ClientMessage } from "@tilezo/protocol/messages";
import { NetClient } from "./NetClient";

const originalWebSocket = globalThis.WebSocket;
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
const originalProcess = Object.getOwnPropertyDescriptor(globalThis, "process");
const originalPublicWsUrl = Bun.env.PUBLIC_WS_URL;

describe("NetClient", () => {
  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;

    if (originalLocation) {
      Object.defineProperty(globalThis, "location", originalLocation);
    } else {
      Reflect.deleteProperty(globalThis, "location");
    }

    restoreProcess();
    restorePublicWsUrl();
    FakeWebSocket.instances.length = 0;
  });

  test("connects to the default websocket URL and sends JSON messages", async () => {
    installBrowserFakes("http:");
    const client = new NetClient();
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(status));

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;

    const message: ClientMessage = { type: "ping", sentAt: "now" };
    client.send(message);

    expect(socket.url).toBe("ws://localhost:3000/ws");
    expect(statuses).toEqual(["connecting to ws://localhost:3000/ws", "connected"]);
    expect(socket.sent).toEqual([JSON.stringify(message)]);
  });

  test("uses secure websocket defaults on https pages", async () => {
    installBrowserFakes("https:");
    const client = new NetClient();

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;

    expect(socket.url).toBe("wss://localhost:3000/ws");
  });

  test("uses public websocket URL overrides", async () => {
    installBrowserFakes("http:");
    Bun.env.PUBLIC_WS_URL = "ws://localhost:4567/ws";
    const client = new NetClient();

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;

    expect(socket.url).toBe("ws://localhost:4567/ws");
  });

  test("does not use the client dev server origin as the websocket fallback", async () => {
    installBrowserFakes("http:", "0.0.0.0:3001");
    Reflect.deleteProperty(globalThis, "process");
    const client = new NetClient();

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;

    expect(socket.url).toBe("ws://localhost:3000/ws");
  });

  test("falls back to the default websocket URL when process is unavailable", async () => {
    installBrowserFakes("http:");
    Reflect.deleteProperty(globalThis, "process");
    const client = new NetClient();

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;

    expect(socket.url).toBe("ws://localhost:3000/ws");
  });

  test("emits parsed server messages and ignores unsubscribed handlers", () => {
    installBrowserFakes("http:");
    const client = new NetClient();
    const received: unknown[] = [];
    const unsubscribe = client.onMessage((message) => received.push(message));

    void client.connect();
    const socket = currentSocket();
    socket.message(JSON.stringify({ type: "connected", userId: "user_1" }));
    unsubscribe();
    socket.message(JSON.stringify({ type: "connected", userId: "user_2" }));

    expect(received).toEqual([{ type: "connected", userId: "user_1" }]);
  });

  test("reports invalid messages, connection errors, and disconnects", async () => {
    installBrowserFakes("http:");
    const client = new NetClient();
    const statuses: string[] = [];
    let disconnects = 0;
    client.onStatus((status) => statuses.push(status));
    client.onDisconnect(() => {
      disconnects += 1;
    });

    const connected = client.connect();
    const socket = currentSocket();
    socket.message("{");
    socket.error();

    await expect(connected).rejects.toThrow("WebSocket connection failed");
    socket.close();

    expect(statuses).toEqual([
      "connecting to ws://localhost:3000/ws",
      "received invalid server message",
      "connection error",
      "disconnected",
    ]);
    expect(disconnects).toBe(0);
  });

  test("rejects sends when the socket is not open", () => {
    installBrowserFakes("http:");
    const client = new NetClient();

    expect(() => client.send({ type: "ping", sentAt: "now" })).toThrow("WebSocket is not open");
  });

  test("reports unexpected disconnects after a socket was open", async () => {
    installBrowserFakes("http:");
    const client = new NetClient();
    let disconnects = 0;
    client.onDisconnect(() => {
      disconnects += 1;
    });

    const connected = client.connect();
    const socket = currentSocket();
    socket.open();
    await connected;
    socket.close();

    expect(disconnects).toBe(1);
  });
});

function installBrowserFakes(protocol: "http:" | "https:", host?: string) {
  delete Bun.env.PUBLIC_WS_URL;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { host, protocol },
  });
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
}

function restorePublicWsUrl(): void {
  if (originalPublicWsUrl === undefined) {
    delete Bun.env.PUBLIC_WS_URL;
  } else {
    Bun.env.PUBLIC_WS_URL = originalPublicWsUrl;
  }
}

function restoreProcess(): void {
  if (originalProcess) {
    Object.defineProperty(globalThis, "process", originalProcess);
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  readonly sent: string[] = [];
  readyState = 0;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch("open", {});
  }

  error(): void {
    this.dispatch("error", {});
  }

  close(): void {
    this.readyState = 3;
    this.dispatch("close", {});
  }

  message(data: unknown): void {
    this.dispatch("message", { data });
  }

  private dispatch(type: string, event: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function currentSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[0];

  if (!socket) {
    throw new Error("expected a websocket to be created");
  }

  return socket;
}
