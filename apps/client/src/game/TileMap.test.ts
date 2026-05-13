import { describe, expect, test } from "bun:test";
import { TileMap } from "./TileMap";

describe("TileMap", () => {
  test("loads tiles and reports walkability", () => {
    const map = new TileMap();

    map.load([
      { x: 0, y: 0, z: 0, walkable: true },
      { x: 1, y: 0, z: 0, walkable: false },
    ]);

    expect(map.has({ x: 0, y: 0 })).toBe(true);
    expect(map.has({ x: 2, y: 0 })).toBe(false);
    expect(map.isWalkable({ x: 0, y: 0 })).toBe(true);
    expect(map.isWalkable({ x: 1, y: 0 })).toBe(false);
  });

  test("keeps an attached door tile addressable for doorway depth sorting", () => {
    const map = new TileMap();

    map.load([
      { x: -1, y: 2, z: 0, walkable: true },
      { x: 0, y: 0, z: 0, walkable: true },
      { x: 0, y: 1, z: 0, walkable: true },
      { x: 0, y: 2, z: 0, walkable: true },
    ]);

    expect(map.has({ x: -1, y: 2 })).toBe(true);
    expect(map.isWalkable({ x: -1, y: 2 })).toBe(true);
    expect(map.getAttachedDoorTile()).toEqual({ x: -1, y: 2 });
    expect(map.wallView.children).toHaveLength(1);
  });

  test("positions the hover highlight only for known tiles", () => {
    const map = new TileMap();

    map.load([{ x: 1, y: 1, z: 0, walkable: true }]);
    map.setHover({ x: 1, y: 1 });

    expect(map.view.children.at(-1)?.x).toBe(0);
    expect(map.view.children.at(-1)?.y).toBe(32);

    map.setHover(undefined);
    map.setHover({ x: 3, y: 3 });

    expect(map.view.children.at(-1)?.x).toBe(0);
    expect(map.view.children.at(-1)?.y).toBe(32);
  });
});
