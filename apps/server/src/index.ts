import type { ServerMessage } from "@habbo/protocol";
import { getConfig } from "./config";
import { handleClose, handleMessage } from "./net/handleMessage";
import type { SocketData } from "./net/socketTypes";
import { RoomManager } from "./rooms/RoomManager";
import { createId } from "./util/ids";
import { encodeServerMessage } from "./util/safeJson";

const config = getConfig();
const rooms = await RoomManager.create();

const server = Bun.serve<SocketData>({
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

    return new Response("Habbo-like room server", {
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

console.log(`Server listening on http://localhost:${server.port}`);
