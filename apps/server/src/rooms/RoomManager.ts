import { createRectRoomLayout, type RoomLayout } from "@tilezo/engine";
import { loadOrSeedDefaultRoom, type PersistenceStore } from "../db/persistence";
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

  constructor(private readonly defaultLayout: RoomLayout) {}

  static async create(options: { persistence?: PersistenceStore } = {}) {
    const fallbackLayout = await loadDefaultRoomLayout();
    return new RoomManager(await loadOrSeedDefaultRoom(options.persistence, fallbackLayout));
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreate(roomId: string): Room {
    const existing = this.rooms.get(roomId);

    if (existing) {
      return existing;
    }

    const layout =
      roomId === this.defaultLayout.id ? this.defaultLayout : { ...this.defaultLayout, id: roomId };
    const room = new Room(layout);
    this.rooms.set(roomId, room);
    return room;
  }

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);

    if (room?.isEmpty) {
      this.rooms.delete(roomId);
    }
  }
}

async function loadDefaultRoomLayout(): Promise<RoomLayout> {
  const path = new URL("../../../../assets/rooms/default-room.json", import.meta.url);
  const raw = (await Bun.file(path).json()) as RawRoomLayout;

  return createRectRoomLayout(
    raw.id,
    raw.name,
    raw.width,
    raw.height,
    raw.spawn,
    raw.blocked ?? [],
  );
}
