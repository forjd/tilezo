import type { ServerMessage } from "@tilezo/protocol";
import { getConfig } from "./config";
import { createDatabase } from "./db/db";
import { DrizzlePersistenceStore } from "./db/persistence";
import { handleClose, handleMessage } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { RoomManager } from "./rooms/RoomManager";
import { createId } from "./util/ids";
import { encodeServerMessage } from "./util/safeJson";

const config = getConfig();
const database = createDatabase(config.databaseUrl);
const persistence = database ? new DrizzlePersistenceStore(database) : undefined;
const rooms = await RoomManager.create({ persistence });

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(request, {
        data: {
          userId: createId("user"),
        },
      });

      if (upgraded) {
        return undefined;
      }
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    return new Response("Tilezo room server", {
      headers: {
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
