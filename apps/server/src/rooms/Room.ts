import { findPath, type RoomLayout, TileGrid, type TilePosition } from "@tilezo/engine";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import type { RoomSnapshot, RoomUser } from "./types";

const MOVEMENT_MILLISECONDS_PER_TILE = 360;

type Clock = () => number;

type UserMovement = {
  path: TilePosition[];
  startedAt: number;
};

export class Room {
  readonly id: string;

  private readonly grid: TileGrid;
  private readonly movements = new Map<string, UserMovement>();
  private readonly users = new Map<string, RoomUser>();

  constructor(
    private readonly layout: RoomLayout,
    private readonly clock: Clock = Date.now,
  ) {
    this.id = layout.id;
    this.grid = new TileGrid(layout);
  }

  join(
    user: Omit<RoomUser, "position" | "appearance"> & Partial<Pick<RoomUser, "appearance">>,
  ): RoomUser {
    const roomUser = {
      ...user,
      appearance: user.appearance ?? DEFAULT_AVATAR_APPEARANCE,
      position: this.getSpawnPosition(),
    };

    this.users.set(roomUser.id, roomUser);
    return roomUser;
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

  moveUser(userId: string, target: TilePosition): TilePosition[] | null {
    this.sweepCompletedMovements();
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const currentPosition = this.resolveUserPosition(userId, user);
    const activeMovement = this.movements.get(userId);

    if (activeMovement && sameTile(activeMovement.path.at(-1), target)) {
      return activeMovement.path.map((position) => ({ ...position }));
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
    };
  }

  getUsers() {
    this.sweepCompletedMovements();
    return [...this.users.values()].map((user) => ({
      id: user.id,
      username: user.username,
      position: this.resolveUserPosition(user.id, user),
      appearance: { ...user.appearance },
    }));
  }

  isWalkable(position: TilePosition): boolean {
    return this.grid.isWalkable(position);
  }

  getWalkableTiles(): TilePosition[] {
    return this.layout.tiles
      .filter((tile) => tile.walkable)
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }

  get isEmpty(): boolean {
    return this.users.size === 0;
  }

  get userCount(): number {
    this.sweepCompletedMovements();
    return this.users.size;
  }

  private getSpawnPosition(): TilePosition {
    if (this.isWalkable(this.layout.spawn)) {
      return { ...this.layout.spawn };
    }

    const fallback = this.layout.tiles.find((tile) => tile.walkable);
    return fallback ? { x: fallback.x, y: fallback.y } : { x: 0, y: 0 };
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
}

function sameTile(a: TilePosition | undefined, b: TilePosition): boolean {
  return a?.x === b.x && a.y === b.y;
}
