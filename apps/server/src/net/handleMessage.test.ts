import { describe, expect, test } from "bun:test";
import type { ServerMessage } from "@tilezo/protocol";
import type { ServerWebSocket } from "bun";
import type { PersistenceStore } from "../db/persistence";
import { RoomManager } from "../rooms/RoomManager";
import { handleMessage } from "./handleMessage";
import type { SocketData } from "./socketTypes";

describe("handleMessage persistence", () => {
  test("persists joined users but not chat messages", async () => {
    const rooms = await RoomManager.create();
    const persistence = createPersistenceStore();
    const ws = createSocket();

    handleMessage(ws, JSON.stringify({ type: "room.join", roomId: "lobby", username: "Dan" }), {
      rooms,
      persistence,
      publish() {},
    });
    handleMessage(ws, JSON.stringify({ type: "chat.say", text: "hello" }), {
      rooms,
      persistence,
      publish() {},
    });

    expect(persistence.users).toEqual([{ id: "user_1", username: "Dan" }]);
    expect(persistence.calls).toEqual(["upsertUser"]);
  });
});

function createSocket() {
  const sent: ServerMessage[] = [];

  return {
    data: { userId: "user_1" },
    sent,
    send(message: string) {
      sent.push(JSON.parse(message) as ServerMessage);
    },
    subscribe() {},
    unsubscribe() {},
  } as unknown as ServerWebSocket<SocketData> & { sent: ServerMessage[] };
}

function createPersistenceStore() {
  return {
    calls: [] as string[],
    users: [] as { id: string; username: string }[],
    async getRoom() {
      return undefined;
    },
    async seedRoom() {},
    async upsertUser(user: { id: string; username: string }) {
      this.calls.push("upsertUser");
      this.users.push(user);
    },
  } satisfies PersistenceStore & {
    calls: string[];
    users: { id: string; username: string }[];
  };
}
