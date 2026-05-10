import type { RoomLayout } from "@tilezo/engine";
import { eq } from "drizzle-orm";
import type { TilezoDatabase } from "./db";
import { rooms, users } from "./schema";

export type PersistedUser = {
  id: string;
  username: string;
};

export type PersistenceStore = {
  getRoom(roomId: string): Promise<RoomLayout | undefined>;
  seedRoom(layout: RoomLayout): Promise<void>;
  upsertUser(user: PersistedUser): Promise<void>;
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

export async function persistJoinedUser(
  store: PersistenceStore | undefined,
  user: PersistedUser,
): Promise<void> {
  if (!store) {
    return;
  }

  try {
    await store.upsertUser(user);
  } catch (error) {
    console.warn("User persistence unavailable; continuing without persisted user", error);
  }
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

  async upsertUser(user: PersistedUser): Promise<void> {
    await this.db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: user.username,
          updatedAt: new Date(),
        },
      });
  }
}
