import { findPath, type RoomLayout, TileGrid, type TilePosition } from "@tilezo/engine";
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

  join(user: Omit<RoomUser, "position">): RoomUser {
    const roomUser = {
      ...user,
      position: this.getSpawnPosition(),
    };

    this.users.set(roomUser.id, roomUser);
    return roomUser;
  }

  leave(userId: string): void {
    this.users.delete(userId);
    this.movements.delete(userId);
  }

  moveUser(userId: string, target: TilePosition): TilePosition[] | null {
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const currentPosition = this.resolveUserPosition(userId, user);
    const path = findPath(this.layout, currentPosition, target);

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

  getSnapshot(): RoomSnapshot {
    return {
      roomId: this.id,
      users: this.getUsers(),
      tiles: this.layout.tiles,
    };
  }

  getUsers() {
    return [...this.users.values()].map((user) => ({
      id: user.id,
      username: user.username,
      position: this.resolveUserPosition(user.id, user),
    }));
  }

  isWalkable(position: TilePosition): boolean {
    return this.grid.isWalkable(position);
  }

  get isEmpty(): boolean {
    return this.users.size === 0;
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
}
