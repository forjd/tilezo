import type { ServerMessage } from "@tilezo/protocol";
import { avatarAppearanceSchema, MAX_RAW_MESSAGE_BYTES } from "@tilezo/protocol";
import { AuthError, AuthService, DrizzleAuthStore } from "./auth/auth";
import { getConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore, type PersistenceStore } from "./db/persistence";
import { handleClose, handleMessage, handleOpen } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { createPersonalRoomLayout } from "./rooms/personalRoom";
import { RoomManager } from "./rooms/RoomManager";
import { createId } from "./util/ids";
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
      return handleAuthRequest(request, auth, "register", { persistence, rooms });
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      return handleAuthRequest(request, auth, "login", { persistence, rooms });
    }

    if (url.pathname === "/me/appearance") {
      return handleAppearanceRequest(request, auth);
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
          connectionId: createId("socket"),
          resumeRoomId: await readResumeRoomId(user.id, persistence),
          appearance: user.appearance,
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
    maxPayloadLength: MAX_RAW_MESSAGE_BYTES,
    backpressureLimit: MAX_RAW_MESSAGE_BYTES * 4,
    closeOnBackpressureLimit: true,
    open(ws) {
      handleOpen(ws, {
        rooms,
        publish,
        persistence,
      });
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
  const result = server.publish(topic, encodeServerMessage(message));

  if (result === -1) {
    console.warn(`Dropped message for topic ${topic} due to WebSocket backpressure`);
  }
}

async function readResumeRoomId(
  userId: string,
  store: PersistenceStore | undefined,
): Promise<string | undefined> {
  try {
    return await store?.getLastRoomIdForUser?.(userId);
  } catch (error) {
    console.warn("Unable to read last joined room", error);
    return undefined;
  }
}

console.log(`Server listening on http://${config.host}:${server.port}`);

type AuthMode = "login" | "register";

async function handleAuthRequest(
  request: Request,
  authService: AuthService | undefined,
  mode: AuthMode,
  roomProvisioning: { persistence?: PersistenceStore; rooms: RoomManager },
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

    await provisionPersonalRoom(session.user, roomProvisioning);

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

async function provisionPersonalRoom(
  user: { id: string; username: string },
  roomProvisioning: { persistence?: PersistenceStore; rooms: RoomManager },
): Promise<void> {
  if (!roomProvisioning.persistence) {
    return;
  }

  const layout = createPersonalRoomLayout(user);
  await roomProvisioning.persistence.seedRoom(layout, {
    ownerUserId: user.id,
    visibility: "private",
  });
  roomProvisioning.rooms.addPrivateRoom(layout, user.id);
}

async function handleAppearanceRequest(
  request: Request,
  authService: AuthService | undefined,
): Promise<Response> {
  if (!authService) {
    return authJson(
      { error: { code: "DATABASE_REQUIRED", message: "Database is required for profiles" } },
      503,
    );
  }

  const user = await authService.verifyToken(readBearerToken(request) ?? "");

  if (!user) {
    return authJson(
      { error: { code: "UNAUTHENTICATED", message: "Log in before editing your character" } },
      401,
    );
  }

  if (request.method === "GET") {
    return authJson({ appearance: user.appearance }, 200);
  }

  if (request.method !== "PUT") {
    return authJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  }

  try {
    const body = (await request.json()) as { appearance?: unknown };
    const parsed = avatarAppearanceSchema.safeParse(body.appearance);

    if (!parsed.success) {
      return authJson(
        { error: { code: "INVALID_APPEARANCE", message: "Invalid character appearance" } },
        400,
      );
    }

    const updated = await authService.updateAppearance(user.id, parsed.data);
    return authJson({ appearance: updated.appearance }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return authJson({ error: { code: error.code, message: error.message } }, authStatus(error));
    }

    return authJson(
      { error: { code: "INVALID_APPEARANCE", message: "Invalid character appearance" } },
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

  if (error.code === "USER_NOT_FOUND") {
    return 404;
  }

  return 400;
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  return scheme?.toLocaleLowerCase("en-US") === "bearer" ? token : undefined;
}

function authJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-origin": "*",
  };
}
