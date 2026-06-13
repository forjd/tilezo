import { DEFAULT_API_URL } from "../assets";

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export type ClientLoggerOptions = {
  fetcher?: typeof fetch;
};

export class ClientLogger {
  private readonly fetcher: typeof fetch;

  constructor(options: ClientLoggerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
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

    // Telemetry is sent anonymously: the server treats the user as optional and the API
    // base URL is runtime-overridable, so attaching the bearer token here would risk
    // exfiltrating it to an attacker-controlled origin via a crafted ?tilezoApiUrl link.
    try {
      await this.fetcher(`${getApiUrl()}/client-events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
