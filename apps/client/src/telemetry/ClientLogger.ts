import { DEFAULT_API_URL } from "../assets";

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export type ClientLoggerOptions = {
  fetcher?: typeof fetch;
  getToken?: () => string | undefined;
};

export class ClientLogger {
  private readonly fetcher: typeof fetch;
  private readonly getToken?: () => string | undefined;

  constructor(options: ClientLoggerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.getToken = options.getToken;
  }

  async event(
    event: string,
    fields: Record<string, unknown> = {},
    level: ClientLogLevel = "info",
  ): Promise<void> {
    const body = stringifyEvent({ event, fields, level });

    if (!body) {
      return;
    }

    const token = this.getToken?.();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    try {
      await this.fetcher(`${getApiUrl()}/client-events`, {
        method: "POST",
        headers,
        body,
        keepalive: true,
      });
    } catch {
      // Telemetry must never interrupt the room loop.
    }
  }
}

function stringifyEvent(payload: {
  event: string;
  fields: Record<string, unknown>;
  level: ClientLogLevel;
}): string | undefined {
  try {
    return JSON.stringify(payload);
  } catch {
    return undefined;
  }
}

function getApiUrl(): string {
  const runtimeConfigured =
    typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.PUBLIC_API_URL;
  const buildConfigured = typeof process === "undefined" ? undefined : process.env.PUBLIC_API_URL;
  return runtimeConfigured ?? buildConfigured ?? DEFAULT_API_URL;
}
