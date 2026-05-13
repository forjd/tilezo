import { createRectRoomLayoutWithDoorTile, type RoomLayout } from "@tilezo/engine";
import type { PublicRoomSummary } from "@tilezo/protocol";
import {
  loadOrSeedPublicRooms,
  type OwnedRoomLayout,
  type PersistenceStore,
  type RoomDirectory,
} from "../db/persistence";
import type { RoomMetrics } from "../observability/metrics";
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

  hasAccessibleLayout(roomId: string, userId?: string): boolean {
    return Boolean(this.getAccessibleLayout(roomId, userId));
  }

  listPublicRooms(currentRoomId?: string, userId?: string): PublicRoomSummary[] {
    return this.listAccessibleLayouts(userId).map((layout) => ({
      id: layout.id,
      name: layout.name,
      userCount: this.rooms.get(layout.id)?.userCount ?? 0,
      joined: layout.id === currentRoomId,
    }));
  }

  addPrivateRoom(layout: RoomLayout, ownerUserId: string): void {
    this.privateLayouts.set(layout.id, { layout, ownerUserId });
  }

  addRoom(
    layout: RoomLayout,
    options: { ownerUserId?: string; visibility?: "public" | "private" } = {},
  ): void {
    if (options.visibility === "private" && options.ownerUserId) {
      this.privateLayouts.set(layout.id, { layout, ownerUserId: options.ownerUserId });
      return;
    }

    this.publicLayouts.set(layout.id, layout);
  }

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);

    if (room?.isEmpty) {
      this.rooms.delete(roomId);
    }
  }

  getMetrics(): RoomMetrics {
    return {
      activeRooms: this.rooms.size,
      rooms: [...this.rooms.values()]
        .map((room) => ({
          id: room.id,
          userCount: room.userCount,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      layouts: {
        public: this.publicLayouts.size,
        private: this.privateLayouts.size,
      },
    };
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
  const rawLayouts = (await Bun.file(await resolvePublicRoomsPath()).json()) as RawRoomLayout[];

  return rawLayouts.map((raw) =>
    createRectRoomLayoutWithDoorTile(
      raw.id,
      raw.name,
      raw.width,
      raw.height,
      raw.spawn.y,
      raw.blocked ?? [],
    ),
  );
}

async function resolvePublicRoomsPath(): Promise<string> {
  const candidates = [
    Bun.env.TILEZO_PUBLIC_ROOMS_PATH,
    `${process.cwd()}/assets/rooms/public-rooms.json`,
    `${process.cwd()}/../../assets/rooms/public-rooms.json`,
  ].filter((path): path is string => typeof path === "string");

  for (const path of candidates) {
    if (await Bun.file(path).exists()) {
      return path;
    }
  }

  return candidates[0] ?? "assets/rooms/public-rooms.json";
}
