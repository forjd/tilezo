import { tileToScreen } from "@tilezo/engine/iso";
import type { RoomTile, TilePosition } from "@tilezo/engine/types";
import { Container, Graphics } from "pixi.js";

export const ROOM_WALL_HEIGHT = 112;
const TILE_HALF_WIDTH = 32;
const TILE_HALF_HEIGHT = 16;
const FLOOR_THICKNESS = 10;
const WALL_CAP_THICKNESS = 4;
const WALL_SEAM_OVERLAP = 1;
const FLOOR_TOP = 0x999966;
const FLOOR_TOP_BLOCKED = FLOOR_TOP;
const FLOOR_GRID = 0x8f8f5f;
const FLOOR_GRID_BLOCKED = FLOOR_GRID;
const FLOOR_SIDE_LEFT = 0x858458;
const FLOOR_SIDE_RIGHT = 0x70704b;
const FLOOR_BOTTOM_EDGE = 0x696946;
const WALL_LEFT_FACE = 0x9295a0;
const WALL_RIGHT_FACE = 0xb7bac8;
const WALL_LEFT_END = 0xbcbfce;
const WALL_RIGHT_END = 0x9699a5;
const WALL_LEFT_SHADOW = 0x71737c;
const WALL_TOP = 0x71737c;
const WALL_OUTLINE = 0x71737c;
const DOOR_SHADOW = 0x000000;
const DOOR_TILE = 0x000000;
const DOOR_TILE_STROKE = 0x050503;

type Point = {
  x: number;
  y: number;
};

type RoomFootprint = {
  north: Point;
  east: Point;
  south: Point;
  west: Point;
  width: number;
  height: number;
};

type DoorTilePosition = {
  x: number;
  y: number;
};

type Doorway = {
  start: Point;
  end: Point;
  startTop: Point;
  endTop: Point;
  startWallTop: Point;
  endWallTop: Point;
  unit: Point;
  width: number;
};

export class TileMap {
  readonly view = new Container();
  readonly wallView = new Container();
  private readonly floorThickness = new Graphics();
  private readonly floor = new Graphics();
  private readonly walls = new Graphics();
  private readonly highlight = new Graphics();
  private tiles = new Map<string, RoomTile>();
  private attachedDoorTile?: DoorTilePosition;
  private hoverKey?: string;

  constructor() {
    this.view.addChild(this.floorThickness, this.floor, this.highlight);
    this.wallView.addChild(this.walls);
  }

  load(tiles: RoomTile[]): void {
    this.floorThickness.clear();
    this.floor.clear();
    this.walls.clear();
    this.highlight.clear();
    this.attachedDoorTile = undefined;
    this.hoverKey = undefined;
    this.tiles = new Map(tiles.map((tile) => [key(tile), tile]));

    const footprint = calculateFootprint(tiles);

    if (footprint) {
      drawFloorThickness(this.floorThickness, footprint);
    }

    this.attachedDoorTile = footprint ? getAttachedDoorTile(tiles, footprint) : undefined;
    const doorwayTile = footprint
      ? (this.attachedDoorTile ?? getFallbackDoorTile(footprint))
      : undefined;

    for (const tile of tiles) {
      const screen = tileToScreen(tile.x, tile.y);
      const isDoorTile =
        this.attachedDoorTile &&
        tile.x === this.attachedDoorTile.x &&
        tile.y === this.attachedDoorTile.y;
      drawDiamond(
        this.floor,
        screen.x,
        screen.y,
        isDoorTile ? DOOR_TILE : tile.walkable ? FLOOR_TOP : FLOOR_TOP_BLOCKED,
        isDoorTile ? DOOR_TILE_STROKE : tile.walkable ? FLOOR_GRID : FLOOR_GRID_BLOCKED,
      );
    }

    if (footprint) {
      drawWalls(this.walls, footprint, doorwayTile);
    }
  }

  has(position: TilePosition): boolean {
    return this.tiles.has(key(position));
  }

  isWalkable(position: TilePosition): boolean {
    return this.tiles.get(key(position))?.walkable === true;
  }

  getAttachedDoorTile(): TilePosition | undefined {
    return this.attachedDoorTile ? { ...this.attachedDoorTile } : undefined;
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
    this.wallView.destroy({ children: true });
  }
}

function drawDiamond(graphic: Graphics, x: number, y: number, fill: number, stroke: number): void {
  graphic
    .poly([
      x,
      y - TILE_HALF_HEIGHT,
      x + TILE_HALF_WIDTH,
      y,
      x,
      y + TILE_HALF_HEIGHT,
      x - TILE_HALF_WIDTH,
      y,
    ])
    .fill(fill)
    .stroke({ color: stroke, width: 1 });
}

function drawFloorThickness(graphic: Graphics, { east, south, west }: RoomFootprint): void {
  const eastLower = lower(east, FLOOR_THICKNESS);
  const southLower = lower(south, FLOOR_THICKNESS);
  const westLower = lower(west, FLOOR_THICKNESS);

  graphic
    .poly([west.x, west.y, south.x, south.y, southLower.x, southLower.y, westLower.x, westLower.y])
    .fill(FLOOR_SIDE_LEFT)
    .stroke({ color: FLOOR_BOTTOM_EDGE, width: 1 });

  graphic
    .poly([east.x, east.y, south.x, south.y, southLower.x, southLower.y, eastLower.x, eastLower.y])
    .fill(FLOOR_SIDE_RIGHT)
    .stroke({ color: FLOOR_BOTTOM_EDGE, width: 1 });
}

function drawWalls(
  graphic: Graphics,
  footprint: RoomFootprint,
  doorTile: DoorTilePosition | undefined,
): void {
  const baseNorth = lower(footprint.north, WALL_SEAM_OVERLAP);
  const baseWest = lower(footprint.west, WALL_SEAM_OVERLAP);
  const baseEast = lower(footprint.east, WALL_SEAM_OVERLAP);
  const northTop = raise(footprint.north, ROOM_WALL_HEIGHT);
  const westTop = raise(footprint.west, ROOM_WALL_HEIGHT);
  const eastTop = raise(footprint.east, ROOM_WALL_HEIGHT);
  const westOuter = left(footprint.west, WALL_CAP_THICKNESS);
  const eastOuter = right(footprint.east, WALL_CAP_THICKNESS);
  const baseWestOuter = lower(westOuter, WALL_SEAM_OVERLAP);
  const baseEastOuter = lower(eastOuter, WALL_SEAM_OVERLAP);
  const westTopOuter = raise(westOuter, ROOM_WALL_HEIGHT);
  const eastTopOuter = raise(eastOuter, ROOM_WALL_HEIGHT);

  graphic
    .poly([
      baseNorth.x,
      baseNorth.y,
      baseWest.x,
      baseWest.y,
      westTop.x,
      westTop.y,
      northTop.x,
      northTop.y,
    ])
    .fill(WALL_LEFT_FACE);

  graphic
    .poly([
      baseNorth.x,
      baseNorth.y,
      baseEast.x,
      baseEast.y,
      eastTop.x,
      eastTop.y,
      northTop.x,
      northTop.y,
    ])
    .fill(WALL_RIGHT_FACE);

  graphic
    .poly([
      baseWest.x,
      baseWest.y,
      baseWestOuter.x,
      baseWestOuter.y,
      westTopOuter.x,
      westTopOuter.y,
      westTop.x,
      westTop.y,
    ])
    .fill(WALL_LEFT_END);

  graphic
    .poly([
      baseEast.x,
      baseEast.y,
      baseEastOuter.x,
      baseEastOuter.y,
      eastTopOuter.x,
      eastTopOuter.y,
      eastTop.x,
      eastTop.y,
    ])
    .fill(WALL_RIGHT_END);

  drawWallCap(graphic, northTop, westTop, "left");
  drawWallCap(graphic, northTop, eastTop, "right");
  drawDoorwayCutout(graphic, footprint, doorTile);

  graphic
    .moveTo(baseWestOuter.x, baseWestOuter.y)
    .lineTo(westTopOuter.x, westTopOuter.y)
    .moveTo(eastTopOuter.x, eastTopOuter.y)
    .lineTo(baseEastOuter.x, baseEastOuter.y)
    .moveTo(baseWest.x, baseWest.y)
    .lineTo(baseWestOuter.x, baseWestOuter.y)
    .moveTo(baseEast.x, baseEast.y)
    .lineTo(baseEastOuter.x, baseEastOuter.y)
    .stroke({ color: WALL_OUTLINE, width: 1 });
}

function drawWallCap(graphic: Graphics, start: Point, end: Point, side: "left" | "right"): void {
  const lift =
    side === "left"
      ? { x: -WALL_CAP_THICKNESS, y: -WALL_CAP_THICKNESS / 2 }
      : { x: WALL_CAP_THICKNESS, y: -WALL_CAP_THICKNESS / 2 };

  graphic
    .poly([
      start.x,
      start.y,
      end.x,
      end.y,
      end.x + lift.x,
      end.y + lift.y,
      start.x + lift.x,
      start.y + lift.y,
    ])
    .fill(WALL_TOP);

  graphic
    .moveTo(end.x + lift.x, end.y + lift.y)
    .lineTo(start.x + lift.x, start.y + lift.y)
    .lineTo(start.x, start.y)
    .lineTo(end.x, end.y)
    .stroke({ color: WALL_OUTLINE, width: 1 });
}

function drawDoorwayCutout(
  graphic: Graphics,
  footprint: RoomFootprint,
  doorTile: DoorTilePosition | undefined,
): void {
  const doorway = calculateDoorway(footprint, doorTile);

  if (!doorway) {
    return;
  }

  graphic
    .poly([
      doorway.start.x,
      doorway.start.y,
      doorway.end.x,
      doorway.end.y,
      doorway.endTop.x,
      doorway.endTop.y,
      doorway.startTop.x,
      doorway.startTop.y,
    ])
    .fill(DOOR_SHADOW)
    .stroke({ color: WALL_LEFT_SHADOW, width: 1 });

  graphic
    .moveTo(doorway.startTop.x, doorway.startTop.y)
    .lineTo(doorway.endTop.x, doorway.endTop.y)
    .lineTo(doorway.end.x, doorway.end.y)
    .stroke({ color: WALL_LEFT_SHADOW, width: 2 });
}

function calculateDoorway(
  footprint: RoomFootprint,
  doorTile = getFallbackDoorTile(footprint),
): Doorway | undefined {
  if (footprint.height < 2) {
    return undefined;
  }

  const wallVector = {
    x: footprint.west.x - footprint.north.x,
    y: footprint.west.y - footprint.north.y,
  };
  const wallLength = Math.hypot(wallVector.x, wallVector.y);
  const unit = {
    x: wallVector.x / wallLength,
    y: wallVector.y / wallLength,
  };
  const doorWidth = wallLength / footprint.height;
  const doorHeight = Math.min(82, ROOM_WALL_HEIGHT - 22);
  const centerDistance = Math.min(
    wallLength - doorWidth / 2,
    Math.max(doorWidth / 2, (doorTile.y + 0.5) * doorWidth),
  );
  const center = {
    x: footprint.north.x + unit.x * centerDistance,
    y: footprint.north.y + unit.y * centerDistance,
  };
  const startBase = {
    x: center.x - unit.x * (doorWidth / 2),
    y: center.y - unit.y * (doorWidth / 2),
  };
  const endBase = {
    x: center.x + unit.x * (doorWidth / 2),
    y: center.y + unit.y * (doorWidth / 2),
  };
  const start = lower(startBase, WALL_SEAM_OVERLAP);
  const end = lower(endBase, WALL_SEAM_OVERLAP);
  const startTop = raise(startBase, doorHeight);
  const endTop = raise(endBase, doorHeight);
  const startWallTop = raise(startBase, ROOM_WALL_HEIGHT);
  const endWallTop = raise(endBase, ROOM_WALL_HEIGHT);

  return { start, end, startTop, endTop, startWallTop, endWallTop, unit, width: doorWidth };
}

function getAttachedDoorTile(
  tiles: RoomTile[],
  footprint: RoomFootprint,
): DoorTilePosition | undefined {
  const preferredY = Math.min(2, footprint.height - 1);
  const tile = tiles
    .filter((tile) => tile.x < 0 && tile.walkable && tile.y >= 0 && tile.y < footprint.height)
    .sort(
      (leftTile, rightTile) =>
        Math.abs(leftTile.y - preferredY) - Math.abs(rightTile.y - preferredY) ||
        rightTile.x - leftTile.x,
    )[0];

  return tile ? { x: tile.x, y: tile.y } : undefined;
}

function getFallbackDoorTile(footprint: RoomFootprint): DoorTilePosition {
  return { x: 0, y: Math.min(2, footprint.height - 1) };
}

function calculateFootprint(tiles: RoomTile[]): RoomFootprint | undefined {
  if (tiles.length === 0) {
    return undefined;
  }

  const maxX = Math.max(...tiles.map((tile) => tile.x));
  const maxY = Math.max(...tiles.map((tile) => tile.y));
  const width = maxX + 1;
  const height = maxY + 1;
  const north = { ...tileToScreen(0, 0), y: tileToScreen(0, 0).y - TILE_HALF_HEIGHT };
  const eastOrigin = tileToScreen(width - 1, 0);
  const southOrigin = tileToScreen(width - 1, height - 1);
  const westOrigin = tileToScreen(0, height - 1);

  return {
    north,
    east: { x: eastOrigin.x + TILE_HALF_WIDTH, y: eastOrigin.y },
    south: { x: southOrigin.x, y: southOrigin.y + TILE_HALF_HEIGHT },
    west: { x: westOrigin.x - TILE_HALF_WIDTH, y: westOrigin.y },
    width,
    height,
  };
}

function raise(point: Point, amount: number): Point {
  return { x: point.x, y: point.y - amount };
}

function lower(point: Point, amount: number): Point {
  return { x: point.x, y: point.y + amount };
}

function left(point: Point, amount: number): Point {
  return { x: point.x - amount, y: point.y };
}

function right(point: Point, amount: number): Point {
  return { x: point.x + amount, y: point.y };
}

function key(position: TilePosition): string {
  return `${position.x},${position.y}`;
}
