import { findPath, type RoomLayout, TileGrid, type TilePosition } from "@tilezo/engine";
import {
  DEFAULT_AVATAR_APPEARANCE,
  getFurnitureDefinition,
  getFurnitureFootprintTiles,
  isValidFurnitureRotation,
  type RoomItem,
} from "@tilezo/protocol";
import type { RoomSnapshot, RoomUser } from "./types";

const MOVEMENT_MILLISECONDS_PER_TILE = 360;

type Clock = () => number;

type UserMovement = {
  path: TilePosition[];
  startedAt: number;
};

export class Room {
  readonly id: string;

  private grid: TileGrid;
  private readonly baseGrid: TileGrid;
  private readonly items = new Map<string, RoomItem>();
  private readonly movements = new Map<string, UserMovement>();
  private readonly users = new Map<string, RoomUser>();

  constructor(
    private readonly layout: RoomLayout,
    private readonly clock: Clock = Date.now,
    items: readonly RoomItem[] = [],
  ) {
    this.id = layout.id;
    this.baseGrid = new TileGrid(layout);
    this.grid = new TileGrid(layout);

    for (const item of items) {
      this.items.set(item.id, cloneRoomItem(item));
    }

    this.rebuildGrid();
  }

  join(
    user: Omit<RoomUser, "position" | "appearance"> & Partial<Pick<RoomUser, "appearance">>,
  ): RoomUser {
    this.sweepCompletedMovements();
    const roomUser = {
      ...user,
      appearance: user.appearance ?? DEFAULT_AVATAR_APPEARANCE,
      position: this.getSpawnPosition(),
    };

    this.users.set(roomUser.id, roomUser);
    return roomUser;
  }

  // Re-points an already-present user at a new connection (a newer socket for the same
  // user) without resetting their avatar position. Returns the existing room user so a
  // duplicate `user.joined` is not broadcast for an avatar that already exists.
  reattach(
    user: Pick<RoomUser, "id" | "username"> &
      Partial<Pick<RoomUser, "connectionId" | "appearance">>,
  ): RoomUser {
    const existing = this.users.get(user.id);

    if (!existing) {
      return this.join(user);
    }

    existing.connectionId = user.connectionId;

    if (user.appearance) {
      existing.appearance = { ...user.appearance };
    }

    return existing;
  }

  getConnectionId(userId: string): string | undefined {
    return this.users.get(userId)?.connectionId;
  }

  leave(userId: string, connectionId?: string): boolean {
    const user = this.users.get(userId);

    if (!user || (user.connectionId && user.connectionId !== connectionId)) {
      return false;
    }

    this.users.delete(userId);
    this.movements.delete(userId);
    return true;
  }

  removeUser(userId: string): boolean {
    if (!this.users.delete(userId)) {
      return false;
    }

    this.movements.delete(userId);
    return true;
  }

  moveUser(userId: string, target: TilePosition): TilePosition[] | null {
    this.sweepCompletedMovements();
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const currentPosition = this.resolveUserPosition(userId, user);
    const activeMovement = this.movements.get(userId);

    if (activeMovement && sameTile(activeMovement.path.at(-1), target)) {
      return this.getRemainingPath(userId) ?? [currentPosition];
    }

    if (this.isOccupiedByOtherUser(target, userId)) {
      return null;
    }

    const path = findPath(this.grid, currentPosition, target);

    if (!path) {
      return null;
    }

    if (path.length > 1) {
      this.movements.set(userId, {
        path: path.map((position) => ({ ...position })),
        startedAt: this.clock(),
      });
    } else {
      this.movements.delete(userId);
    }

    return path;
  }

  updateAppearance(userId: string, appearance: RoomUser["appearance"]): boolean {
    const user = this.users.get(userId);

    if (!user) {
      return false;
    }

    user.appearance = { ...appearance };
    return true;
  }

  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }

  hasOnlyUsers(userIds: ReadonlySet<string>): boolean {
    return [...this.users.keys()].every((userId) => userIds.has(userId));
  }

  getSnapshot(): RoomSnapshot {
    this.sweepCompletedMovements();
    return {
      roomId: this.id,
      users: this.getUsers(),
      tiles: this.layout.tiles,
      items: this.getItems(),
    };
  }

  getUsers() {
    this.sweepCompletedMovements();
    return [...this.users.values()].map((user) => {
      const position = this.resolveUserPosition(user.id, user);
      const snapshot = {
        id: user.id,
        username: user.username,
        position,
        appearance: { ...user.appearance },
      };
      const movementPath = this.getRemainingPath(user.id);
      return movementPath ? { ...snapshot, movementPath } : snapshot;
    });
  }

  isWalkable(position: TilePosition): boolean {
    return this.grid.isWalkable(position);
  }

  getWalkableTiles(): TilePosition[] {
    return this.layout.tiles
      .filter((tile) => this.grid.isWalkable(tile))
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }

  getItems(): RoomItem[] {
    return [...this.items.values()].map(cloneRoomItem).sort(compareRoomItems);
  }

  getItem(itemId: string): RoomItem | undefined {
    const item = this.items.get(itemId);
    return item ? cloneRoomItem(item) : undefined;
  }

  canPlaceItem(item: RoomItem, options: { ignoreItemId?: string } = {}): boolean {
    return this.validateItemPlacement(item, options).ok;
  }

  placeItem(item: RoomItem): RoomItem | undefined {
    const nextItem = cloneRoomItem(item);

    if (!this.validateItemPlacement(nextItem).ok) {
      return undefined;
    }

    this.items.set(nextItem.id, nextItem);
    this.rebuildGrid();
    return cloneRoomItem(nextItem);
  }

  moveItem(
    itemId: string,
    next: Pick<RoomItem, "x" | "y" | "rotation">,
  ): RoomItem | undefined {
    const existing = this.items.get(itemId);

    if (!existing) {
      return undefined;
    }

    const updated: RoomItem = {
      ...existing,
      x: next.x,
      y: next.y,
      rotation: next.rotation,
    };

    if (!this.validateItemMove(itemId, updated).ok) {
      return undefined;
    }

    this.items.set(itemId, cloneRoomItem(updated));
    this.rebuildGrid();
    return cloneRoomItem(updated);
  }

  validateItemMove(itemId: string, item: RoomItem): { ok: true } | { ok: false } {
    return this.validateItemPlacement(item, { ignoreItemId: itemId });
  }

  pickupItem(itemId: string): RoomItem | undefined {
    const item = this.items.get(itemId);

    if (!item) {
      return undefined;
    }

    this.items.delete(itemId);
    this.rebuildGrid();
    return cloneRoomItem(item);
  }

  updateItemState(itemId: string, state: Record<string, unknown>): RoomItem | undefined {
    const item = this.items.get(itemId);

    if (!item) {
      return undefined;
    }

    const nextItem = {
      ...cloneRoomItem(item),
      state: { ...state },
    };

    this.items.set(itemId, nextItem);
    return cloneRoomItem(nextItem);
  }

  get isEmpty(): boolean {
    return this.users.size === 0;
  }

  get userCount(): number {
    this.sweepCompletedMovements();
    return this.users.size;
  }

  private getSpawnPosition(): TilePosition {
    const preferred = this.firstUnoccupiedWalkableTile([this.layout.spawn]);

    if (preferred) {
      return preferred;
    }

    const fallback = this.firstUnoccupiedWalkableTile(this.layout.tiles);
    return fallback ?? { x: 0, y: 0 };
  }

  private firstUnoccupiedWalkableTile(tiles: readonly TilePosition[]): TilePosition | undefined {
    for (const tile of tiles) {
      const position = { x: tile.x, y: tile.y };

      if (this.isWalkable(position) && !this.hasUserAt(position)) {
        return position;
      }
    }

    return undefined;
  }

  private validateItemPlacement(
    item: RoomItem,
    options: { ignoreItemId?: string } = {},
  ): { ok: true } | { ok: false } {
    const definition = getFurnitureDefinition(item.itemType);

    if (!definition || !isValidFurnitureRotation(definition, item.rotation) || item.z !== 0) {
      return { ok: false };
    }

    const occupiedTiles = new Set<string>();

    for (const [existingItemId, existingItem] of this.items) {
      if (existingItemId === options.ignoreItemId) {
        continue;
      }

      const existingDefinition = getFurnitureDefinition(existingItem.itemType);

      if (!existingDefinition) {
        continue;
      }

      for (const tile of getFurnitureFootprintTiles(existingItem, existingDefinition)) {
        occupiedTiles.add(tileKey(tile));
      }
    }

    for (const tile of getFurnitureFootprintTiles(item, definition)) {
      if (tile.x < 0 || !this.baseGrid.isWalkable(tile) || occupiedTiles.has(tileKey(tile))) {
        return { ok: false };
      }

      if (!definition.canWalkOn && sameTile(tile, this.layout.spawn)) {
        return { ok: false };
      }

      if (!definition.canWalkOn && this.hasUserAt(tile)) {
        return { ok: false };
      }
    }

    return { ok: true };
  }

  private hasUserAt(position: TilePosition): boolean {
    this.sweepCompletedMovements();

    for (const user of this.users.values()) {
      if (sameTile(user.position, position)) {
        return true;
      }
    }

    return false;
  }

  private isOccupiedByOtherUser(position: TilePosition, userId: string): boolean {
    this.sweepCompletedMovements();

    for (const [otherUserId, otherUser] of this.users) {
      if (otherUserId === userId) {
        continue;
      }

      const movement = this.movements.get(otherUserId);
      const destination = movement?.path.at(-1);

      if (sameTile(otherUser.position, position) || sameTile(destination, position)) {
        return true;
      }
    }

    return false;
  }

  private rebuildGrid(): void {
    const tiles = this.layout.tiles.map((tile) => ({ ...tile }));
    const tileMap = new Map(tiles.map((tile) => [tileKey(tile), tile]));

    for (const item of this.items.values()) {
      const definition = getFurnitureDefinition(item.itemType);

      if (!definition || definition.canWalkOn) {
        continue;
      }

      for (const tile of getFurnitureFootprintTiles(item, definition)) {
        const roomTile = tileMap.get(tileKey(tile));

        if (roomTile) {
          roomTile.walkable = false;
        }
      }
    }

    this.grid = new TileGrid({ ...this.layout, tiles });
  }

  private resolveUserPosition(userId: string, user: RoomUser): TilePosition {
    const movement = this.movements.get(userId);

    if (!movement) {
      return { ...user.position };
    }

    const elapsed = Math.max(0, this.clock() - movement.startedAt);
    const reachedIndex = Math.min(
      movement.path.length - 1,
      Math.floor(elapsed / MOVEMENT_MILLISECONDS_PER_TILE),
    );
    const position = movement.path[reachedIndex] ?? user.position;

    user.position = { ...position };

    if (reachedIndex >= movement.path.length - 1) {
      this.movements.delete(userId);
    }

    return { ...user.position };
  }

  private sweepCompletedMovements(): void {
    for (const [userId, movement] of this.movements) {
      const user = this.users.get(userId);

      if (!user) {
        this.movements.delete(userId);
        continue;
      }

      const elapsed = Math.max(0, this.clock() - movement.startedAt);
      const reachedIndex = Math.min(
        movement.path.length - 1,
        Math.floor(elapsed / MOVEMENT_MILLISECONDS_PER_TILE),
      );

      if (reachedIndex < movement.path.length - 1) {
        continue;
      }

      const finalPosition = movement.path.at(-1);

      if (finalPosition) {
        user.position = { ...finalPosition };
      }

      this.movements.delete(userId);
    }
  }

  private getRemainingPath(userId: string): TilePosition[] | undefined {
    const movement = this.movements.get(userId);

    if (!movement) {
      return undefined;
    }

    const elapsed = Math.max(0, this.clock() - movement.startedAt);
    const reachedIndex = Math.min(
      movement.path.length - 1,
      Math.floor(elapsed / MOVEMENT_MILLISECONDS_PER_TILE),
    );
    const remainingPath = movement.path.slice(reachedIndex).map((position) => ({ ...position }));
    return remainingPath.length > 1 ? remainingPath : undefined;
  }
}

function sameTile(a: TilePosition | undefined, b: TilePosition): boolean {
  return a?.x === b.x && a.y === b.y;
}

function tileKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

function cloneRoomItem(item: RoomItem): RoomItem {
  return {
    ...item,
    state: { ...item.state },
  };
}

function compareRoomItems(left: RoomItem, right: RoomItem): number {
  return (
    left.y - right.y || left.x - right.x || left.z - right.z || left.id.localeCompare(right.id)
  );
}
