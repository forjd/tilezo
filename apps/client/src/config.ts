import { DEFAULT_API_URL, DEFAULT_WS_URL } from "./assets";

export function getApiUrl(): string {
  return normalizeBaseUrl(getConfiguredValue("PUBLIC_API_URL"), DEFAULT_API_URL, [
    "http:",
    "https:",
  ]);
}

export function apiUrl(path: string): string {
  return new URL(path, `${getApiUrl()}/`).toString();
}

export function getWebSocketUrl(): string {
  const browserDefault = getBrowserWebSocketUrl();
  return normalizeBaseUrl(getConfiguredValue("PUBLIC_WS_URL"), browserDefault ?? DEFAULT_WS_URL, [
    "ws:",
    "wss:",
  ]);
}

function getConfiguredValue(key: "PUBLIC_API_URL" | "PUBLIC_WS_URL"): string | undefined {
  const runtimeConfigured = typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.[key];
  const buildConfigured = typeof process === "undefined" ? undefined : process.env[key];
  return runtimeConfigured ?? buildConfigured;
}

function normalizeBaseUrl(
  configured: string | undefined,
  fallback: string,
  protocols: readonly string[],
): string {
  const raw = configured?.trim() || fallback;

  try {
    const url = new URL(raw);

    if (!protocols.includes(url.protocol)) {
      return fallback;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function getBrowserWebSocketUrl(): string | undefined {
  if (typeof location === "undefined") {
    return undefined;
  }

  return location.protocol === "https:" ? DEFAULT_WS_URL.replace("ws://", "wss://") : undefined;
}

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
