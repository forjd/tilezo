import { findPath, type RoomLayout, TileGrid, type TilePosition } from "@habbo/engine";
import type { RoomSnapshot, RoomUser } from "./types";

export class Room {
  readonly id: string;

  private readonly grid: TileGrid;
  private readonly users = new Map<string, RoomUser>();

  constructor(private readonly layout: RoomLayout) {
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
  }

  moveUser(userId: string, target: TilePosition): TilePosition[] | null {
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const path = findPath(this.layout, user.position, target);

    if (!path) {
      return null;
    }

    user.position = { ...target };
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
      position: { ...user.position },
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
}
