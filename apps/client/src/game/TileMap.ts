import { type RoomTile, type TilePosition, tileToScreen } from "@tilezo/engine";
import { Container, Graphics } from "pixi.js";

export class TileMap {
  readonly view = new Container();
  private readonly highlight = new Graphics();
  private tiles = new Map<string, RoomTile>();

  constructor() {
    this.view.addChild(this.highlight);
  }

  load(tiles: RoomTile[]): void {
    this.view.removeChildren();
    this.tiles = new Map(tiles.map((tile) => [key(tile), tile]));

    for (const tile of tiles) {
      const screen = tileToScreen(tile.x, tile.y);
      const graphic = drawDiamond(
        tile.walkable ? 0xc68a55 : 0x6f7560,
        tile.walkable ? 0x8b5d35 : 0x4f5747,
      );
      graphic.x = screen.x;
      graphic.y = screen.y;
      this.view.addChild(graphic);
    }

    this.view.addChild(this.highlight);
  }

  has(position: TilePosition): boolean {
    return this.tiles.has(key(position));
  }

  isWalkable(position: TilePosition): boolean {
    return this.tiles.get(key(position))?.walkable === true;
  }

  setHover(position?: TilePosition): void {
    this.highlight.clear();

    if (!position || !this.has(position)) {
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
}

function drawDiamond(fill: number, stroke: number): Graphics {
  return new Graphics()
    .poly([0, -16, 32, 0, 0, 16, -32, 0])
    .fill(fill)
    .stroke({ color: stroke, width: 1 });
}

function key(position: TilePosition): string {
  return `${position.x},${position.y}`;
}
