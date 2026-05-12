import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import type { PublicRoomSummary } from "@tilezo/protocol";
import {
  loadOrSeedPublicRooms,
  type OwnedRoomLayout,
  type PersistenceStore,
  type RoomDirectory,
} from "../db/persistence";
import { Room } from "./Room";

type RawRoomLayout = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  blocked?: { x: number; y: number }[];
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly publicLayouts: Map<string, RoomLayout>;
  private readonly privateLayouts = new Map<string, OwnedRoomLayout>();

  constructor(directory: RoomLayout | RoomLayout[] | RoomDirectory) {
    const roomDirectory = normalizeRoomDirectory(directory);
    this.publicLayouts = new Map(roomDirectory.publicLayouts.map((layout) => [layout.id, layout]));

    for (const room of roomDirectory.privateLayouts) {
      this.privateLayouts.set(room.layout.id, room);
    }
  }

  static async create(options: { persistence?: PersistenceStore } = {}) {
    const fallbackLayouts = await loadPublicRoomLayouts();
    return new RoomManager(await loadOrSeedPublicRooms(options.persistence, fallbackLayouts));
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreate(roomId: string, userId?: string): Room | undefined {
    const layout = this.getAccessibleLayout(roomId, userId);

    if (!layout) {
      return undefined;
    }

    const existing = this.rooms.get(roomId);

    if (existing) {
      return existing;
    }

    const room = new Room(layout);
    this.rooms.set(roomId, room);
    return room;
  }

  listPublicRooms(currentRoomId?: string, userId?: string): PublicRoomSummary[] {
    return this.listAccessibleLayouts(userId).map((layout) => ({
      id: layout.id,
      name: layout.name,
      userCount: this.rooms.get(layout.id)?.getUsers().length ?? 0,
      joined: layout.id === currentRoomId,
    }));
  }

  addPrivateRoom(layout: RoomLayout, ownerUserId: string): void {
    this.privateLayouts.set(layout.id, { layout, ownerUserId });
  }

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);

    if (room?.isEmpty) {
      this.rooms.delete(roomId);
    }
  }

  private getAccessibleLayout(roomId: string, userId: string | undefined): RoomLayout | undefined {
    const publicLayout = this.publicLayouts.get(roomId);

    if (publicLayout) {
      return publicLayout;
    }

    const privateRoom = this.privateLayouts.get(roomId);
    if (!privateRoom || privateRoom.ownerUserId !== userId) {
      return undefined;
    }

    return privateRoom.layout;
  }

  private listAccessibleLayouts(userId: string | undefined): RoomLayout[] {
    return [
      ...this.publicLayouts.values(),
      ...[...this.privateLayouts.values()]
        .filter((room) => room.ownerUserId === userId)
        .map((room) => room.layout),
    ];
  }
}

function normalizeRoomDirectory(
  directory: RoomLayout | RoomLayout[] | RoomDirectory,
): RoomDirectory {
  if (Array.isArray(directory)) {
    return { publicLayouts: directory, privateLayouts: [] };
  }

  if ("publicLayouts" in directory) {
    return directory;
  }

  return { publicLayouts: [directory], privateLayouts: [] };
}

async function loadPublicRoomLayouts(): Promise<RoomLayout[]> {
  const path = new URL("../../../../assets/rooms/public-rooms.json", import.meta.url);
  const rawLayouts = (await Bun.file(path).json()) as RawRoomLayout[];

  return rawLayouts.map((raw) =>
    createRectRoomLayout(raw.id, raw.name, raw.width, raw.height, raw.spawn, raw.blocked ?? []),
  );
}
