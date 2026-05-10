import type { ServerMessage } from "@tilezo/protocol";
import { AuthError, AuthService, DrizzleAuthStore } from "./auth/auth";
import { getConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore } from "./db/persistence";
import { handleClose, handleMessage } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { RoomManager } from "./rooms/RoomManager";
import { encodeServerMessage } from "./util/safeJson";

const config = getConfig();
const database = createDatabase(config.databaseUrl);
const persistence = database ? new DrizzlePersistenceStore(database) : undefined;
const auth = database
  ? new AuthService(new DrizzleAuthStore(database), { secret: config.authSecret })
  : undefined;
const rooms = await RoomManager.create({ persistence });

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  async fetch(request, server) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/auth/register" && request.method === "POST") {
      return handleAuthRequest(request, auth, "register");
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      return handleAuthRequest(request, auth, "login");
    }

    if (url.pathname === "/ws") {
      const user = await auth?.verifyToken(url.searchParams.get("token") ?? "");

      if (!user) {
        return Response.json(
          { error: { code: "UNAUTHENTICATED", message: "Log in before connecting" } },
          { status: 401, headers: corsHeaders() },
        );
      }

      const upgraded = server.upgrade(request, {
        data: {
          userId: user.id,
          username: user.username,
        },
      });

      if (upgraded) {
        return undefined;
      }
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

    return new Response("Tilezo room server", {
      headers: {
        ...corsHeaders(),
        "content-type": "text/plain;charset=utf-8",
      },
    });
  },
  websocket: {
    open(ws) {
      ws.send(
        encodeServerMessage({
          type: "connected",
          userId: ws.data.userId,
        }),
      );
    },
    message(ws, message) {
      if (typeof message === "string" || Buffer.isBuffer(message)) {
        handleMessage(ws, message, {
          rooms,
          publish,
          persistence,
        });
        return;
      }

      ws.send(
        encodeServerMessage({
          type: "error",
          code: "INVALID_MESSAGE",
          message: "Unsupported message type",
        }),
      );
    },
    close(ws) {
      handleClose(ws, rooms, publish);
    },
  },
});

function publish(topic: string, message: ServerMessage): void {
  server.publish(topic, encodeServerMessage(message));
}

console.log(`Server listening on http://${config.host}:${server.port}`);

type AuthMode = "login" | "register";

async function handleAuthRequest(
  request: Request,
  authService: AuthService | undefined,
  mode: AuthMode,
): Promise<Response> {
  if (!authService) {
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for login" } },
      503,
    );
  }

  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };

    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return authJson(
        { error: { code: "INVALID_AUTH_INPUT", message: "Username and password are required" } },
        400,
      );
    }

    const session =
      mode === "register"
        ? await authService.createUser(body.username, body.password)
        : await authService.login(body.username, body.password);

    return authJson(session, mode === "register" ? 201 : 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return authJson({ error: { code: error.code, message: error.message } }, authStatus(error));
    }

    return authJson(
      { error: { code: "INVALID_AUTH_INPUT", message: "Invalid authentication request" } },
      400,
    );
  }
}

function authStatus(error: AuthError): number {
  if (error.code === "USERNAME_TAKEN") {
    return 409;
  }

  if (error.code === "INVALID_CREDENTIALS") {
    return 401;
  }

  return 400;
}

function authJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  };
}
