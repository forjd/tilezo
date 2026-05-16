import type { RoomLayout } from "@tilezo/engine";
import { asc, eq } from "drizzle-orm";
import type { TilezoDatabase } from "./db";
import { rooms, userRoomSessions } from "./schema";

export type RoomVisibility = "public" | "private";
export type RoomAccess = "open" | "knock";

export type OwnedRoomLayout = {
  layout: RoomLayout;
  ownerUserId: string;
  access?: RoomAccess;
};

export type RoomAccessRule = {
  roomId: string;
  ownerUserId?: string;
  access: RoomAccess;
};

export type PersistedRoomLayout = {
  layout: RoomLayout;
  ownerUserId?: string;
  visibility: RoomVisibility;
  description: string;
  capacity: number;
  access: RoomAccess;
};

export type RoomDirectory = {
  publicLayouts: RoomLayout[];
  privateLayouts: OwnedRoomLayout[];
  roomRules?: RoomAccessRule[];
};

export type PersistenceStore = {
  getRoom(roomId: string): Promise<RoomLayout | undefined>;
  seedRoom(
    layout: RoomLayout,
    options?: {
      ownerUserId?: string;
      visibility?: RoomVisibility;
      description?: string;
      capacity?: number;
      access?: RoomAccess;
    },
  ): Promise<void>;
  listRooms?(): Promise<PersistedRoomLayout[]>;
  listPublicRooms?(): Promise<RoomLayout[]>;
  listOwnedRooms?(ownerUserId: string): Promise<OwnedRoomLayout[]>;
  getLastRoomIdForUser?(userId: string): Promise<string | undefined>;
  saveLastRoomIdForUser?(userId: string, roomId: string): Promise<void>;
  clearLastRoomIdForUser?(userId: string): Promise<void>;
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
    const storedPublicLayouts =
      storedRooms.length > 0
        ? storedRooms.filter((room) => room.visibility === "public").map((room) => room.layout)
        : store.listPublicRooms
          ? await store.listPublicRooms()
          : [];
    const storedPrivateLayouts = storedRooms
      .filter((room) => room.visibility === "private" && room.ownerUserId)
      .map((room) => ({
        layout: room.layout,
        ownerUserId: room.ownerUserId as string,
        access: room.access,
      }));

    return {
      publicLayouts: mergeRoomLayouts(fallbackLayouts, storedPublicLayouts),
      privateLayouts: storedPrivateLayouts,
      roomRules: storedRooms.map((room) => ({
        roomId: room.layout.id,
        ownerUserId: room.ownerUserId,
        access: room.access,
      })),
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
    options: {
      ownerUserId?: string;
      visibility?: RoomVisibility;
      description?: string;
      capacity?: number;
      access?: RoomAccess;
    } = {},
  ): Promise<void> {
    const visibility = options.visibility ?? "public";
    const description = options.description ?? "";
    const capacity = options.capacity ?? 25;
    const access = options.access ?? "open";

    await this.db
      .insert(rooms)
      .values({
        id: layout.id,
        slug: layout.id,
        name: layout.name,
        description,
        ownerUserId: options.ownerUserId ?? null,
        visibility,
        access,
        capacity,
        layout,
      })
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          name: layout.name,
          description,
          ownerUserId: options.ownerUserId ?? null,
          visibility,
          access,
          capacity,
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
        description: rooms.description,
        capacity: rooms.capacity,
        access: rooms.access,
      })
      .from(rooms)
      .orderBy(asc(rooms.name), asc(rooms.id));
    return storedRooms.map((room) => ({
      layout: room.layout,
      ownerUserId: room.ownerUserId ?? undefined,
      visibility: room.visibility === "private" ? "private" : "public",
      description: room.description ?? "",
      capacity: room.capacity ?? 25,
      access: room.access === "knock" ? "knock" : "open",
    }));
  }

  async listPublicRooms(): Promise<RoomLayout[]> {
    const storedRooms = await this.db
      .select({
        layout: rooms.layout,
      })
      .from(rooms)
      .where(eq(rooms.visibility, "public"))
      .orderBy(asc(rooms.name), asc(rooms.id));
    return storedRooms.map((room) => room.layout);
  }

  async listOwnedRooms(ownerUserId: string): Promise<OwnedRoomLayout[]> {
    const storedRooms = await this.db
      .select({
        layout: rooms.layout,
      })
      .from(rooms)
      .where(eq(rooms.ownerUserId, ownerUserId))
      .orderBy(asc(rooms.name), asc(rooms.id));
    return storedRooms.map((room) => ({ layout: room.layout, ownerUserId }));
  }

  async getLastRoomIdForUser(userId: string): Promise<string | undefined> {
    const [session] = await this.db
      .select({ roomId: userRoomSessions.roomId })
      .from(userRoomSessions)
      .where(eq(userRoomSessions.userId, userId));
    return session?.roomId;
  }

  async saveLastRoomIdForUser(userId: string, roomId: string): Promise<void> {
    await this.db
      .insert(userRoomSessions)
      .values({
        userId,
        roomId,
      })
      .onConflictDoUpdate({
        target: userRoomSessions.userId,
        set: {
          roomId,
          updatedAt: new Date(),
        },
      });
  }

  async clearLastRoomIdForUser(userId: string): Promise<void> {
    await this.db.delete(userRoomSessions).where(eq(userRoomSessions.userId, userId));
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
