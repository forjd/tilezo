import type { RoomLayout, RoomTile, TilePosition } from "./types";

export function tileKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

export function createRectRoomLayout(
  id: string,
  name: string,
  width: number,
  height: number,
  spawn: TilePosition,
  blocked: TilePosition[] = [],
): RoomLayout {
  const blockedKeys = new Set(blocked.map(tileKey));
  const tiles: RoomTile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        x,
        y,
        z: 0,
        walkable: !blockedKeys.has(tileKey({ x, y })),
      });
    }
  }

  return { id, name, width, height, spawn, tiles };
}

export class TileGrid {
  readonly width: number;
  readonly height: number;

  private readonly tiles = new Map<string, RoomTile>();

  constructor(layout: RoomLayout) {
    this.width = layout.width;
    this.height = layout.height;

    for (const tile of layout.tiles) {
      this.tiles.set(tileKey(tile), tile);
    }
  }

  getTile(position: TilePosition): RoomTile | undefined {
    return this.tiles.get(tileKey(position));
  }

  has(position: TilePosition): boolean {
    return this.tiles.has(tileKey(position));
  }

  isWalkable(position: TilePosition): boolean {
    return this.getTile(position)?.walkable === true;
  }

  getNeighbors(position: TilePosition): TilePosition[] {
    const candidates = [
      { x: position.x + 1, y: position.y },
      { x: position.x - 1, y: position.y },
      { x: position.x, y: position.y + 1 },
      { x: position.x, y: position.y - 1 },
    ];

    return candidates.filter((candidate) => this.isWalkable(candidate));
  }
}
