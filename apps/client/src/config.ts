import { DEFAULT_API_URL, DEFAULT_WS_URL } from "./assets";

export function getApiUrl(): string {
  return normalizeBaseUrl(getConfiguredValue("PUBLIC_API_URL"), DEFAULT_API_URL, ["https:"], {
    allowLocalInsecure: true,
  });
}

export function apiUrl(path: string): string {
  return new URL(path, `${getApiUrl()}/`).toString();
}

export function getWebSocketUrl(): string {
  const browserDefault = getBrowserWebSocketUrl();
  return normalizeBaseUrl(
    getConfiguredValue("PUBLIC_WS_URL"),
    browserDefault ?? DEFAULT_WS_URL,
    ["wss:"],
    {
      allowLocalInsecure: true,
      insecureProtocols: ["ws:"],
    },
  );
}

function getConfiguredValue(key: "PUBLIC_API_URL" | "PUBLIC_WS_URL"): string | undefined {
  const runtimeConfigured = typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.[key];
  const buildConfigured = typeof process === "undefined" ? undefined : process.env[key];
  return runtimeConfigured ?? buildConfigured;
}

function normalizeBaseUrl(
  configured: string | undefined,
  fallback: string,
  secureProtocols: readonly string[],
  options: { allowLocalInsecure: boolean; insecureProtocols?: readonly string[] },
): string {
  const raw = configured?.trim() || fallback;

  try {
    const url = new URL(raw);

    if (secureProtocols.includes(url.protocol)) {
      return url.toString().replace(/\/$/, "");
    }

    if (
      options.allowLocalInsecure &&
      (options.insecureProtocols ?? ["http:"]).includes(url.protocol) &&
      isLocalHostname(url.hostname)
    ) {
      return url.toString().replace(/\/$/, "");
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
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
