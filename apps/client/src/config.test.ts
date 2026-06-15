import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_API_URL, DEFAULT_WS_URL } from "./assets";
import { apiUrl, getApiUrl, getWebSocketUrl } from "./config";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
const originalPublicApiUrl = process.env.PUBLIC_API_URL;
const originalPublicWsUrl = process.env.PUBLIC_WS_URL;

describe("config", () => {
  afterEach(() => {
    restoreDescriptor("window", originalWindow);
    restoreDescriptor("location", originalLocation);
    restoreEnv("PUBLIC_API_URL", originalPublicApiUrl);
    restoreEnv("PUBLIC_WS_URL", originalPublicWsUrl);
  });

  test("normalizes configured API URLs and resolves API paths", () => {
    installWindowConfig({ PUBLIC_API_URL: " https://api.example.test/base/ " });

    expect(getApiUrl()).toBe("https://api.example.test/base");
    expect(apiUrl("/rooms")).toBe("https://api.example.test/rooms");
  });

  test("falls back when configured values are invalid or use the wrong protocol", () => {
    installWindowConfig({
      PUBLIC_API_URL: "ws://api.example.test",
      PUBLIC_WS_URL: "not a url",
    });

    expect(getApiUrl()).toBe(DEFAULT_API_URL);
    expect(getWebSocketUrl()).toBe(DEFAULT_WS_URL);
  });

  test("uses build-time values when no runtime config exists", () => {
    Reflect.deleteProperty(globalThis, "window");
    process.env.PUBLIC_API_URL = "http://build-api.example.test/";
    process.env.PUBLIC_WS_URL = "wss://build-ws.example.test/socket/";

    expect(getApiUrl()).toBe("http://build-api.example.test");
    expect(getWebSocketUrl()).toBe("wss://build-ws.example.test/socket");
  });

  test("derives a secure browser websocket fallback on https pages", () => {
    Reflect.deleteProperty(globalThis, "window");
    restoreEnv("PUBLIC_WS_URL", undefined);
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { protocol: "https:" },
    });

    expect(getWebSocketUrl()).toBe(DEFAULT_WS_URL.replace("ws://", "wss://"));
  });

  test("uses the default websocket fallback outside the browser", () => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "location");
    restoreEnv("PUBLIC_WS_URL", undefined);

    expect(getWebSocketUrl()).toBe(DEFAULT_WS_URL);
  });
});

function installWindowConfig(config: { PUBLIC_API_URL?: string; PUBLIC_WS_URL?: string }): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { TILEZO_CONFIG: config },
  });
}

function restoreDescriptor(
  key: "window" | "location",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, key);
}

function restoreEnv(key: "PUBLIC_API_URL" | "PUBLIC_WS_URL", value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }

  process.env[key] = value;
}
