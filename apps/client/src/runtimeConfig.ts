type RuntimeConfigPayload = {
  PUBLIC_API_URL?: unknown;
  PUBLIC_WS_URL?: unknown;
};

const RUNTIME_CONFIG_PATH = "/tilezo-runtime-config.json";

export async function loadRuntimeConfig(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const response = await fetch(RUNTIME_CONFIG_PATH, {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as RuntimeConfigPayload;
    const config = normalizeRuntimeConfig(payload);

    if (config) {
      window.TILEZO_CONFIG = { ...window.TILEZO_CONFIG, ...config };
    }
  } catch {
    // Runtime config is optional; local and production builds can rely on build defaults.
  }
}

function normalizeRuntimeConfig(
  payload: RuntimeConfigPayload,
): { PUBLIC_API_URL?: string; PUBLIC_WS_URL?: string } | undefined {
  const apiUrl = typeof payload.PUBLIC_API_URL === "string" ? payload.PUBLIC_API_URL : undefined;
  const wsUrl = typeof payload.PUBLIC_WS_URL === "string" ? payload.PUBLIC_WS_URL : undefined;

  if (!apiUrl && !wsUrl) {
    return undefined;
  }

  return {
    ...(apiUrl ? { PUBLIC_API_URL: apiUrl } : {}),
    ...(wsUrl ? { PUBLIC_WS_URL: wsUrl } : {}),
  };
}

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
