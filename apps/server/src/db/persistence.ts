import type { RoomLayout } from "@tilezo/engine";
import { asc, eq } from "drizzle-orm";
import type { TilezoDatabase } from "./db";
import { rooms } from "./schema";

export type RoomVisibility = "public" | "private";

export type OwnedRoomLayout = {
  layout: RoomLayout;
  ownerUserId: string;
};

export type PersistedRoomLayout = {
  layout: RoomLayout;
  ownerUserId?: string;
  visibility: RoomVisibility;
};

export type RoomDirectory = {
  publicLayouts: RoomLayout[];
  privateLayouts: OwnedRoomLayout[];
};

export type PersistenceStore = {
  getRoom(roomId: string): Promise<RoomLayout | undefined>;
  seedRoom(
    layout: RoomLayout,
    options?: { ownerUserId?: string; visibility?: RoomVisibility },
  ): Promise<void>;
  listRooms?(): Promise<PersistedRoomLayout[]>;
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
): Promise<RoomDirectory> {
  if (!store) {
    return { publicLayouts: fallbackLayouts, privateLayouts: [] };
  }

  try {
    for (const layout of fallbackLayouts) {
      const storedLayout = await store.getRoom(layout.id);

      if (!storedLayout) {
        await store.seedRoom(layout);
      }
    }

    const storedRooms = store.listRooms ? await store.listRooms() : [];
    return {
      publicLayouts: mergeRoomLayouts(
        fallbackLayouts,
        storedRooms.filter((room) => room.visibility === "public").map((room) => room.layout),
      ),
      privateLayouts: storedRooms
        .filter(
          (room): room is PersistedRoomLayout & { ownerUserId: string } =>
            room.visibility === "private" && typeof room.ownerUserId === "string",
        )
        .map((room) => ({ layout: room.layout, ownerUserId: room.ownerUserId })),
    };
  } catch (error) {
    console.warn("Room persistence unavailable; using bundled public rooms", error);
  }

  return { publicLayouts: fallbackLayouts, privateLayouts: [] };
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

  async seedRoom(
    layout: RoomLayout,
    options: { ownerUserId?: string; visibility?: RoomVisibility } = {},
  ): Promise<void> {
    const visibility = options.visibility ?? "public";

    await this.db
      .insert(rooms)
      .values({
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        ownerUserId: options.ownerUserId ?? null,
        visibility,
        layout,
      })
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          name: layout.name,
          ownerUserId: options.ownerUserId ?? null,
          visibility,
          layout,
          updatedAt: new Date(),
        },
      });
  }

  async listRooms(): Promise<PersistedRoomLayout[]> {
    const storedRooms = await this.db
      .select({
        layout: rooms.layout,
        ownerUserId: rooms.ownerUserId,
        visibility: rooms.visibility,
      })
      .from(rooms)
      .orderBy(asc(rooms.name), asc(rooms.id));
    return storedRooms.map((room) => ({
      layout: room.layout,
      ownerUserId: room.ownerUserId ?? undefined,
      visibility: room.visibility === "private" ? "private" : "public",
    }));
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
