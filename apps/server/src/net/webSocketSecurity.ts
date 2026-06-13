import type { ServerConfig } from "../config";
import { readSessionToken } from "../http/router";

export function isAllowedWebSocketOrigin(request: Request, config: ServerConfig): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return config.corsAllowedOrigins.includes(origin);
}

export function readWebSocketSessionToken(request: Request): string | undefined {
  return readSessionToken(request);
}
