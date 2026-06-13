import { createRectRoomLayoutWithDoorTile, type RoomLayout } from "@tilezo/engine";
import type { PublicRoomSummary } from "@tilezo/protocol";
import {
  loadOrSeedPublicRooms,
  type OwnedRoomLayout,
  type PersistenceStore,
  type RoomAccess,
  type RoomAccessRule,
  type RoomDirectory,
} from "../db/persistence";
import type { RoomMetrics } from "../observability/metrics";
import { type RoomBotDefinition, seedRoomBots } from "./bots";
import { Room } from "./Room";

type RawRoomLayout = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  blocked?: { x: number; y: number }[];
};

type RoomJoinAccess =
  | { ok: true }
  | { ok: false; code: "ROOM_NOT_FOUND" | "ROOM_ACCESS_REQUIRED"; message: string };

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly publicLayouts: Map<string, RoomLayout>;
  private readonly privateLayouts = new Map<string, OwnedRoomLayout>();
  // Secondary index of private layouts by owner so listing a user's accessible rooms is
  // O(rooms they own) rather than O(every private room in the directory).
  private readonly privateLayoutsByOwner = new Map<string, Map<string, OwnedRoomLayout>>();
  private readonly roomRules = new Map<string, RoomAccessRule>();
  private readonly bots: readonly RoomBotDefinition[];

  constructor(
    directory: RoomLayout | RoomLayout[] | RoomDirectory,
    options: { bots?: readonly RoomBotDefinition[] } = {},
  ) {
    const roomDirectory = normalizeRoomDirectory(directory);
    this.publicLayouts = new Map(roomDirectory.publicLayouts.map((layout) => [layout.id, layout]));
    this.bots = options.bots ?? [];

    for (const layout of roomDirectory.publicLayouts) {
      this.roomRules.set(layout.id, { roomId: layout.id, access: "open" });
    }

    for (const room of roomDirectory.privateLayouts) {
      this.indexPrivateLayout(room);
      this.roomRules.set(room.layout.id, {
        roomId: room.layout.id,
        ownerUserId: room.ownerUserId,
        access: room.access ?? "open",
      });
    }

    for (const rule of roomDirectory.roomRules ?? []) {
      this.roomRules.set(rule.roomId, rule);
    }
  }

  static async create(
    options: { persistence?: PersistenceStore; bots?: readonly RoomBotDefinition[] } = {},
  ) {
    const fallbackLayouts = await loadPublicRoomLayouts();
    return new RoomManager(await loadOrSeedPublicRooms(options.persistence, fallbackLayouts), {
      bots: options.bots,
    });
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
    seedRoomBots(room, roomId, this.bots);
    this.rooms.set(roomId, room);
    return room;
  }

  hasAccessibleLayout(roomId: string, userId?: string): boolean {
    return Boolean(this.getAccessibleLayout(roomId, userId));
  }

  canJoinRoom(roomId: string, userId?: string): RoomJoinAccess {
    if (!this.hasAccessibleLayout(roomId, userId)) {
      return { ok: false, code: "ROOM_NOT_FOUND", message: "Room is not available" };
    }

    const rule = this.roomRules.get(roomId);

    if (rule?.access === "knock" && rule.ownerUserId !== userId) {
      return {
        ok: false,
        code: "ROOM_ACCESS_REQUIRED",
        message: "This room requires approval before joining",
      };
    }

    return { ok: true };
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
    this.indexPrivateLayout({ layout, ownerUserId });
    this.roomRules.set(layout.id, { roomId: layout.id, ownerUserId, access: "open" });
  }

  addRoom(
    layout: RoomLayout,
    options: {
      access?: RoomAccess;
      ownerUserId?: string;
      visibility?: "public" | "private";
    } = {},
  ): void {
    const access = options.access ?? "open";
    this.roomRules.set(layout.id, {
      roomId: layout.id,
      ownerUserId: options.ownerUserId,
      access,
    });

    if (options.visibility === "private" && options.ownerUserId) {
      this.indexPrivateLayout({
        layout,
        ownerUserId: options.ownerUserId,
        access,
      });
      return;
    }

    this.publicLayouts.set(layout.id, layout);
  }

  private indexPrivateLayout(room: OwnedRoomLayout): void {
    const previous = this.privateLayouts.get(room.layout.id);

    if (previous && previous.ownerUserId !== room.ownerUserId) {
      this.privateLayoutsByOwner.get(previous.ownerUserId)?.delete(room.layout.id);
    }

    this.privateLayouts.set(room.layout.id, room);

    let ownedByUser = this.privateLayoutsByOwner.get(room.ownerUserId);

    if (!ownedByUser) {
      ownedByUser = new Map();
      this.privateLayoutsByOwner.set(room.ownerUserId, ownedByUser);
    }

    ownedByUser.set(room.layout.id, room);
  }

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);

    if (room && (room.isEmpty || room.hasOnlyUsers(this.botIds()))) {
      this.rooms.delete(roomId);
    }
  }

  listActiveRooms(): Room[] {
    return [...this.rooms.values()];
  }

  removeUserFromOtherRooms(userId: string, exceptRoomId: string): string[] {
    const removedRoomIds: string[] = [];

    for (const room of this.rooms.values()) {
      if (room.id === exceptRoomId || !room.removeUser(userId)) {
        continue;
      }

      removedRoomIds.push(room.id);
    }

    return removedRoomIds;
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
    const ownedByUser = userId ? this.privateLayoutsByOwner.get(userId) : undefined;

    return [
      ...this.publicLayouts.values(),
      ...(ownedByUser ? [...ownedByUser.values()].map((room) => room.layout) : []),
    ];
  }

  private botIds(): ReadonlySet<string> {
    return new Set(this.bots.map((bot) => bot.id));
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
