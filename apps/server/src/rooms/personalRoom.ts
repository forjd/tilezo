import { createRectRoomLayoutWithDoorTile } from "@tilezo/engine";
import type { PersistenceStore } from "../db/persistence";
import type { Logger } from "../observability/logger";
import type { Metrics } from "../observability/metrics";
import type { RoomManager } from "./RoomManager";

export function createPersonalRoomLayout(user: { id: string; username: string }) {
  return createRectRoomLayoutWithDoorTile(
    personalRoomId(user.id),
    `${user.username}'s Room`,
    8,
    8,
    2,
    [
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ],
  );
}

export function personalRoomId(userId: string): string {
  return `home_${userId}`;
}

export async function ensurePersonalRoom(
  user: { id: string; username: string },
  context: {
    logger?: Logger;
    metrics?: Metrics;
    persistence?: PersistenceStore;
    rooms: RoomManager;
  },
): Promise<void> {
  const roomId = personalRoomId(user.id);

  if (context.rooms.hasAccessibleLayout(roomId, user.id) || !context.persistence) {
    return;
  }

  const startedAt = performance.now();

  try {
    const layout = createPersonalRoomLayout(user);
    await context.persistence.seedRoom(layout, {
      ownerUserId: user.id,
      visibility: "private",
    });
    context.rooms.addPrivateRoom(layout, user.id);
    context.metrics?.increment("room.private.provisioned");
    context.logger?.debug("room.private.provisioned", {
      userId: user.id,
      roomId,
    });
  } catch (error) {
    context.metrics?.increment("room.private.provision_failed");
    context.logger?.warn("room.private.provision_failed", {
      userId: user.id,
      roomId,
      error,
    });
  } finally {
    context.metrics?.observe("room.private.provision.duration", performance.now() - startedAt);
  }
}
