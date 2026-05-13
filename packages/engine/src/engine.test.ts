import { describe, expect, test } from "bun:test";
import {
  createRectRoomLayout,
  createRectRoomLayoutWithDoorTile,
  findPath,
  screenToTile,
  TileGrid,
  tileToScreen,
} from ".";

describe("isometric projection", () => {
  test("tileToScreen produces expected 2:1 coordinates", () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileToScreen(0, 1)).toEqual({ x: -32, y: 16 });
  });

  test("screenToTile maps basic tile origins back to tiles", () => {
    expect(screenToTile(0, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToTile(32, 16)).toEqual({ x: 1, y: 0 });
    expect(screenToTile(-32, 16)).toEqual({ x: 0, y: 1 });
  });

  test("screenToTile maps points inside the visible diamond to that tile", () => {
    expect(screenToTile(0, -8)).toEqual({ x: 0, y: 0 });
    expect(screenToTile(16, -4)).toEqual({ x: 0, y: 0 });
    expect(screenToTile(-16, -4)).toEqual({ x: 0, y: 0 });
  });
});

describe("grid and pathfinding", () => {
  test("grid walkability respects blocked tiles", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }, [{ x: 1, y: 1 }]);
    const grid = new TileGrid(layout);

    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(true);
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(false);
    expect(grid.isWalkable({ x: 10, y: 10 })).toBe(false);
  });

  test("rect rooms can attach one walkable door tile outside the left wall", () => {
    const layout = createRectRoomLayoutWithDoorTile("lobby", "Lobby", 3, 3, 2);
    const grid = new TileGrid(layout);

    expect(layout.spawn).toEqual({ x: -1, y: 2 });
    expect(layout.tiles.filter((tile) => tile.x < 0)).toEqual([
      { x: -1, y: 2, z: 0, walkable: true },
    ]);
    expect(grid.isWalkable({ x: -1, y: 2 })).toBe(true);
    expect(grid.isWalkable({ x: -1, y: 1 })).toBe(false);
  });

  test("pathfinding enters rooms through the attached door tile without diagonal shortcuts", () => {
    const layout = createRectRoomLayoutWithDoorTile("lobby", "Lobby", 3, 4, 2);

    expect(findPath(layout, { x: -1, y: 2 }, { x: 1, y: 2 })).toEqual([
      { x: -1, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ]);
    expect(findPath(layout, { x: -1, y: 2 }, { x: 0, y: 1 })).toEqual([
      { x: -1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ]);
  });

  test("pathfinding returns a diagonal route for valid movement", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 4, 4, { x: 0, y: 0 });

    expect(findPath(layout, { x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  test("pathfinding does not cut diagonally between blocked tiles", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 2, 2, { x: 0, y: 0 }, [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);

    expect(findPath(layout, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  test("pathfinding rejects blocked routes", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 3, 1, { x: 0, y: 0 }, [{ x: 1, y: 0 }]);

    expect(findPath(layout, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});
