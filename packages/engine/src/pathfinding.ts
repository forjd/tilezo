import { TileGrid, tileKey } from "./grid";
import type { RoomLayout, TilePosition } from "./types";

export function findPath(
  layout: RoomLayout,
  start: TilePosition,
  target: TilePosition,
): TilePosition[] | null {
  const grid = new TileGrid(layout);

  if (!grid.isWalkable(start) || !grid.isWalkable(target)) {
    return null;
  }

  if (start.x === target.x && start.y === target.y) {
    return [];
  }

  const queue: TilePosition[] = [start];
  const visited = new Set<string>([tileKey(start)]);
  const cameFrom = new Map<string, TilePosition>();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];

    if (!current) {
      continue;
    }

    for (const neighbor of grid.getNeighbors(current)) {
      const key = tileKey(neighbor);

      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      cameFrom.set(key, current);

      if (neighbor.x === target.x && neighbor.y === target.y) {
        return reconstructPath(cameFrom, start, neighbor);
      }

      queue.push(neighbor);
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<string, TilePosition>,
  start: TilePosition,
  target: TilePosition,
): TilePosition[] {
  const path: TilePosition[] = [target];
  let current = target;

  while (current.x !== start.x || current.y !== start.y) {
    const parent = cameFrom.get(tileKey(current));

    if (!parent) {
      break;
    }

    current = parent;
    path.push(current);
  }

  path.reverse();
  return path;
}
