import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import type { PublicRoomSummary } from "@tilezo/protocol";
import { loadOrSeedPublicRooms, type PersistenceStore } from "../db/persistence";
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

  constructor(publicLayouts: RoomLayout | RoomLayout[]) {
    const layouts = Array.isArray(publicLayouts) ? publicLayouts : [publicLayouts];
    this.publicLayouts = new Map(layouts.map((layout) => [layout.id, layout]));
  }

  static async create(options: { persistence?: PersistenceStore } = {}) {
    const fallbackLayouts = await loadPublicRoomLayouts();
    return new RoomManager(await loadOrSeedPublicRooms(options.persistence, fallbackLayouts));
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreate(roomId: string): Room | undefined {
    const existing = this.rooms.get(roomId);

    if (existing) {
      return existing;
    }

    const layout = this.publicLayouts.get(roomId);

    if (!layout) {
      return undefined;
    }

    const room = new Room(layout);
    this.rooms.set(roomId, room);
    return room;
  }

  listPublicRooms(currentRoomId?: string): PublicRoomSummary[] {
    return [...this.publicLayouts.values()].map((layout) => ({
      id: layout.id,
      name: layout.name,
      userCount: this.rooms.get(layout.id)?.getUsers().length ?? 0,
      joined: layout.id === currentRoomId,
    }));
  }

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);

    if (room?.isEmpty) {
      this.rooms.delete(roomId);
    }
  }
}

async function loadPublicRoomLayouts(): Promise<RoomLayout[]> {
  const path = new URL("../../../../assets/rooms/public-rooms.json", import.meta.url);
  const rawLayouts = (await Bun.file(path).json()) as RawRoomLayout[];

  return rawLayouts.map((raw) =>
    createRectRoomLayout(raw.id, raw.name, raw.width, raw.height, raw.spawn, raw.blocked ?? []),
  );
}
