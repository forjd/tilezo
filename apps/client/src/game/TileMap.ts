import { tileToScreen } from "@tilezo/engine/iso";
import type { RoomTile, TilePosition } from "@tilezo/engine/types";
import { Container, Graphics } from "pixi.js";

export class TileMap {
  readonly view = new Container();
  private readonly floor = new Graphics();
  private readonly highlight = new Graphics();
  private tiles = new Map<string, RoomTile>();
  private hoverKey?: string;

  constructor() {
    this.view.addChild(this.floor, this.highlight);
  }

  load(tiles: RoomTile[]): void {
    this.floor.clear();
    this.highlight.clear();
    this.hoverKey = undefined;
    this.tiles = new Map(tiles.map((tile) => [key(tile), tile]));

    for (const tile of tiles) {
      const screen = tileToScreen(tile.x, tile.y);
      drawDiamond(
        this.floor,
        screen.x,
        screen.y,
        tile.walkable ? 0xc68a55 : 0x6f7560,
        tile.walkable ? 0x8b5d35 : 0x4f5747,
      );
    }
  }

  has(position: TilePosition): boolean {
    return this.tiles.has(key(position));
  }

  isWalkable(position: TilePosition): boolean {
    return this.tiles.get(key(position))?.walkable === true;
  }

  setHover(position?: TilePosition): void {
    const nextHoverKey = position && this.has(position) ? key(position) : undefined;

    if (nextHoverKey === this.hoverKey) {
      return;
    }

    this.hoverKey = nextHoverKey;
    this.highlight.clear();

    if (!position || !nextHoverKey) {
      return;
    }

    const screen = tileToScreen(position.x, position.y);
    const color = this.isWalkable(position) ? 0xffdc6d : 0xc73632;
    this.highlight
      .poly([0, -16, 32, 0, 0, 16, -32, 0])
      .fill({ color, alpha: 0.32 })
      .stroke({ color, alpha: 0.85, width: 2 });
    this.highlight.x = screen.x;
    this.highlight.y = screen.y;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

function drawDiamond(graphic: Graphics, x: number, y: number, fill: number, stroke: number): void {
  graphic
    .poly([x, y - 16, x + 32, y, x, y + 16, x - 32, y])
    .fill(fill)
    .stroke({ color: stroke, width: 1 });
}

function key(position: TilePosition): string {
  return `${position.x},${position.y}`;
}
