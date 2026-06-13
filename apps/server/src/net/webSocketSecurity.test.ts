import { describe, expect, test } from "bun:test";
import { getConfig } from "../config";
import { isAllowedWebSocketOrigin, readWebSocketSessionToken } from "./webSocketSecurity";

describe("webSocketSecurity", () => {
  test("allows configured browser origins and non-browser requests without an origin", () => {
    const config = getConfig({ CORS_ALLOWED_ORIGINS: "https://play.tilezo.example" });

    expect(
      isAllowedWebSocketOrigin(
        new Request("http://localhost/ws", {
          headers: { origin: "https://play.tilezo.example" },
        }),
        config,
      ),
    ).toBe(true);
    expect(isAllowedWebSocketOrigin(new Request("http://localhost/ws"), config)).toBe(true);
  });

  test("rejects unconfigured browser origins", () => {
    const config = getConfig({ CORS_ALLOWED_ORIGINS: "https://play.tilezo.example" });

    expect(
      isAllowedWebSocketOrigin(
        new Request("http://localhost/ws", {
          headers: { origin: "https://evil.example" },
        }),
        config,
      ),
    ).toBe(false);
  });

  test("does not read websocket tokens from the URL query", () => {
    expect(
      readWebSocketSessionToken(
        new Request("http://localhost/ws?token=query-token", {
          headers: { authorization: "Bearer header-token" },
        }),
      ),
    ).toBe("header-token");
    expect(readWebSocketSessionToken(new Request("http://localhost/ws?token=query-token"))).toBe(
      undefined,
    );
  });
});
