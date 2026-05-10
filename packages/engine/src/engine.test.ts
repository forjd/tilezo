import { describe, expect, test } from "bun:test";
import { createRectRoomLayout, findPath, screenToTile, TileGrid, tileToScreen } from ".";

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
});

describe("grid and pathfinding", () => {
  test("grid walkability respects blocked tiles", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 3, 3, { x: 0, y: 0 }, [{ x: 1, y: 1 }]);
    const grid = new TileGrid(layout);

    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(true);
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(false);
    expect(grid.isWalkable({ x: 10, y: 10 })).toBe(false);
  });

  test("pathfinding returns a route for valid movement", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 4, 4, { x: 0, y: 0 });

    expect(findPath(layout, { x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  test("pathfinding rejects blocked routes", () => {
    const layout = createRectRoomLayout("lobby", "Lobby", 3, 1, { x: 0, y: 0 }, [{ x: 1, y: 0 }]);

    expect(findPath(layout, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});
