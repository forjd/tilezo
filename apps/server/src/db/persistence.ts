import type { RoomLayout } from "@tilezo/engine";
import { asc, eq } from "drizzle-orm";
import type { TilezoDatabase } from "./db";
import { rooms } from "./schema";

export type PersistenceStore = {
  getRoom(roomId: string): Promise<RoomLayout | undefined>;
  seedRoom(layout: RoomLayout): Promise<void>;
  listRooms?(): Promise<RoomLayout[]>;
};

export async function loadOrSeedDefaultRoom(
  store: PersistenceStore | undefined,
  fallbackLayout: RoomLayout,
): Promise<RoomLayout> {
  if (!store) {
    return fallbackLayout;
  }

  try {
    const storedLayout = await store.getRoom(fallbackLayout.id);

    if (storedLayout) {
      return storedLayout;
    }

    await store.seedRoom(fallbackLayout);
  } catch (error) {
    console.warn("Room persistence unavailable; using bundled default room", error);
  }

  return fallbackLayout;
}

export async function loadOrSeedPublicRooms(
  store: PersistenceStore | undefined,
  fallbackLayouts: RoomLayout[],
): Promise<RoomLayout[]> {
  if (!store) {
    return fallbackLayouts;
  }

  try {
    for (const layout of fallbackLayouts) {
      const storedLayout = await store.getRoom(layout.id);

      if (!storedLayout) {
        await store.seedRoom(layout);
      }
    }

    return mergeRoomLayouts(
      fallbackLayouts,
      store.listRooms ? await store.listRooms() : fallbackLayouts,
    );
  } catch (error) {
    console.warn("Room persistence unavailable; using bundled public rooms", error);
  }

  return fallbackLayouts;
}

export class DrizzlePersistenceStore implements PersistenceStore {
  constructor(private readonly db: TilezoDatabase) {}

  async getRoom(roomId: string): Promise<RoomLayout | undefined> {
    const [room] = await this.db
      .select({ layout: rooms.layout })
      .from(rooms)
      .where(eq(rooms.id, roomId));
    return room?.layout;
  }

  async seedRoom(layout: RoomLayout): Promise<void> {
    await this.db
      .insert(rooms)
      .values({
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        layout,
      })
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          name: layout.name,
          layout,
          updatedAt: new Date(),
        },
      });
  }

  async listRooms(): Promise<RoomLayout[]> {
    const storedRooms = await this.db
      .select({ layout: rooms.layout })
      .from(rooms)
      .orderBy(asc(rooms.name), asc(rooms.id));
    return storedRooms.map((room) => room.layout);
  }
}

function mergeRoomLayouts(
  preferredLayouts: RoomLayout[],
  extraLayouts: RoomLayout[],
): RoomLayout[] {
  const merged = new Map<string, RoomLayout>();

  for (const layout of preferredLayouts) {
    merged.set(layout.id, layout);
  }

  for (const layout of extraLayouts) {
    merged.set(layout.id, layout);
  }

  return [...merged.values()];
}
