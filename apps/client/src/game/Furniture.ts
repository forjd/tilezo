import { tileToScreen } from "@tilezo/engine/iso";
import {
  getFurnitureDefinition,
  getFurnitureFootprintTiles,
  type RoomItem,
} from "@tilezo/protocol";
import { Container, Graphics } from "pixi.js";

const TILE_HALF_WIDTH = 32;
const TILE_HALF_HEIGHT = 16;

export class Furniture {
  readonly view = new Container();
  private currentItem: RoomItem;

  constructor(item: RoomItem) {
    this.currentItem = cloneRoomItem(item);
    this.redraw();
  }

  get item(): RoomItem {
    return cloneRoomItem(this.currentItem);
  }

  update(item: RoomItem): void {
    this.currentItem = cloneRoomItem(item);
    this.redraw();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private redraw(): void {
    this.view.removeChildren();
    this.view.sortableChildren = false;

    const definition = getFurnitureDefinition(this.currentItem.itemType);
    const anchor = tileToScreen(this.currentItem.x, this.currentItem.y);
    this.view.x = anchor.x;
    this.view.y = anchor.y;
    this.view.zIndex = this.currentItem.x + this.currentItem.y + this.currentItem.z;

    if (!definition) {
      drawMissingItem(this.view);
      return;
    }

    const footprint = new Graphics();
    const body = new Graphics();

    for (const tile of getFurnitureFootprintTiles(this.currentItem, definition)) {
      const screen = tileToScreen(tile.x, tile.y);
      drawDiamond(
        footprint,
        screen.x - anchor.x,
        screen.y - anchor.y,
        definition.canWalkOn ? 0x5aa08d : 0x75583f,
        definition.canWalkOn ? 0x326f61 : 0x423122,
        definition.canWalkOn ? 0.42 : 0.28,
      );
    }

    switch (definition.spriteKey) {
      case "woven_rug":
        drawRug(body);
        break;
      case "crate_table":
        drawCrateTable(body);
        break;
      case "low_stool":
        drawLowStool(body);
        break;
      case "reed_divider":
        drawReedDivider(body);
        break;
      case "glass_lamp":
        drawGlassLamp(body, this.currentItem.state.on === true);
        break;
      default:
        drawMissingItem(body);
        break;
    }

    this.view.addChild(footprint, body);
  }
}

function drawDiamond(
  graphic: Graphics,
  x: number,
  y: number,
  fill: number,
  stroke: number,
  alpha: number,
): void {
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
    .fill({ color: fill, alpha })
    .stroke({ color: stroke, alpha: 0.74, width: 1 });
}

function drawRug(graphic: Graphics): void {
  graphic
    .poly([-30, -14, 32, 17, 0, 33, -62, 2])
    .fill(0xb7554c)
    .stroke({ color: 0x5c2e31, width: 2 });
  graphic.poly([-16, -7, 16, 9, 0, 17, -32, 1]).fill(0xf0c76f);
  graphic.poly([-42, -2, -30, 4, -46, 12, -58, 6]).fill(0x2f7f9d);
}

function drawCrateTable(graphic: Graphics): void {
  graphic.poly([0, -26, 30, -11, 0, 4, -30, -11]).fill(0xb98247);
  graphic.poly([-30, -11, 0, 4, 0, 28, -30, 13]).fill(0x875b35);
  graphic.poly([30, -11, 0, 4, 0, 28, 30, 13]).fill(0x6f472e);
  graphic.poly([0, -26, 30, -11, 0, 4, -30, -11]).stroke({ color: 0x33251d, width: 2 });
  graphic.poly([-30, -11, 0, 4, 0, 28, -30, 13]).stroke({ color: 0x33251d, width: 2 });
  graphic.poly([30, -11, 0, 4, 0, 28, 30, 13]).stroke({ color: 0x33251d, width: 2 });
  graphic.moveTo(-16, -4).lineTo(15, 12).stroke({ color: 0x5d3b27, width: 2 });
}

function drawLowStool(graphic: Graphics): void {
  graphic.ellipse(0, -8, 22, 10).fill(0x5aa08d).stroke({ color: 0x1f2d2f, width: 2 });
  graphic.rect(-16, -7, 6, 23).fill(0x326f61).stroke({ color: 0x1f2d2f, width: 1 });
  graphic.rect(10, -7, 6, 23).fill(0x28584f).stroke({ color: 0x1f2d2f, width: 1 });
  graphic.ellipse(0, -11, 17, 6).fill(0x84c8b2);
}

function drawReedDivider(graphic: Graphics): void {
  graphic.poly([-10, -56, 22, -40, 22, 21, -10, 5]).fill(0xc99a5a);
  graphic.poly([-22, -50, -10, -56, -10, 5, -22, 12]).fill(0x91653c);
  graphic.poly([-22, -50, 10, -34, 22, -40, -10, -56]).fill(0xe0b66f);
  graphic.poly([-22, -50, 10, -34, 22, -40, -10, -56]).stroke({ color: 0x33251d, width: 2 });
  graphic.poly([-22, -50, -10, -56, -10, 5, -22, 12]).stroke({ color: 0x33251d, width: 2 });
  graphic.poly([-10, -56, 22, -40, 22, 21, -10, 5]).stroke({ color: 0x33251d, width: 2 });

  for (const x of [-14, -4, 6, 16]) {
    graphic
      .moveTo(x, -45 + x / 3)
      .lineTo(x, 8 + x / 3)
      .stroke({ color: 0x6f472e, width: 1 });
  }
}

function drawGlassLamp(graphic: Graphics, on: boolean): void {
  const glow = on ? 0xf4d56f : 0x78a6b6;
  graphic.rect(-5, -42, 10, 36).fill(0x334449).stroke({ color: 0x1f2d2f, width: 1 });
  graphic.ellipse(0, -48, 18, 13).fill(glow).stroke({ color: 0x1f2d2f, width: 2 });
  graphic.ellipse(-4, -51, 6, 4).fill(on ? 0xfff0a0 : 0xb2d4db);
  graphic.poly([-16, -8, 16, -8, 8, 4, -8, 4]).fill(0x5c6a70).stroke({ color: 0x1f2d2f, width: 2 });
}

function drawMissingItem(target: Container | Graphics): void {
  const graphic = target instanceof Graphics ? target : new Graphics();
  graphic.rect(-16, -32, 32, 32).fill(0xc73632).stroke({ color: 0x4f1817, width: 2 });
  graphic.moveTo(-10, -26).lineTo(10, -6).moveTo(10, -26).lineTo(-10, -6).stroke({
    color: 0xffffff,
    width: 2,
  });

  if (!(target instanceof Graphics)) {
    target.addChild(graphic);
  }
}

function cloneRoomItem(item: RoomItem): RoomItem {
  return {
    ...item,
    state: { ...item.state },
  };
}
