import type { TilePosition } from "./types";

export const DEFAULT_TILE_WIDTH = 64;
export const DEFAULT_TILE_HEIGHT = 32;

export function tileToScreen(
  tileX: number,
  tileY: number,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
) {
  return {
    x: (tileX - tileY) * (tileWidth / 2),
    y: (tileX + tileY) * (tileHeight / 2),
  };
}

export function screenToTile(
  screenX: number,
  screenY: number,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
): TilePosition {
  return {
    x: Math.floor((screenY / (tileHeight / 2) + screenX / (tileWidth / 2)) / 2),
    y: Math.floor((screenY / (tileHeight / 2) - screenX / (tileWidth / 2)) / 2),
  };
}
