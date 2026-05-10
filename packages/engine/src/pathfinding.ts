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

  const openSet: TilePosition[] = [start];
  const openKeys = new Set<string>([tileKey(start)]);
  const cameFrom = new Map<string, TilePosition>();
  const gScore = new Map<string, number>([[tileKey(start), 0]]);
  const hScore = new Map<string, number>([[tileKey(start), octileDistance(start, target)]]);
  const fScore = new Map<string, number>([[tileKey(start), octileDistance(start, target)]]);

  while (openSet.length > 0) {
    const currentIndex = getLowestScoreIndex(openSet, fScore, hScore);
    const current = openSet.splice(currentIndex, 1)[0];

    if (!current) {
      continue;
    }

    openKeys.delete(tileKey(current));

    if (current.x === target.x && current.y === target.y) {
      return reconstructPath(cameFrom, start, current);
    }

    for (const neighbor of grid.getNeighbors(current)) {
      const key = tileKey(neighbor);
      const tentativeScore =
        (gScore.get(tileKey(current)) ?? Number.POSITIVE_INFINITY) +
        movementCost(current, neighbor);

      if (tentativeScore >= (gScore.get(key) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(key, current);
      gScore.set(key, tentativeScore);
      hScore.set(key, octileDistance(neighbor, target));
      fScore.set(key, tentativeScore + octileDistance(neighbor, target));

      if (!openKeys.has(key)) {
        openSet.push(neighbor);
        openKeys.add(key);
      }
    }
  }

  return null;
}

function getLowestScoreIndex(
  positions: TilePosition[],
  fScore: Map<string, number>,
  hScore: Map<string, number>,
): number {
  let bestIndex = 0;
  let bestScore = fScore.get(tileKey(positions[0] ?? { x: 0, y: 0 })) ?? Number.POSITIVE_INFINITY;
  let bestHeuristic =
    hScore.get(tileKey(positions[0] ?? { x: 0, y: 0 })) ?? Number.POSITIVE_INFINITY;

  for (let index = 1; index < positions.length; index += 1) {
    const score =
      fScore.get(tileKey(positions[index] ?? { x: 0, y: 0 })) ?? Number.POSITIVE_INFINITY;
    const heuristic =
      hScore.get(tileKey(positions[index] ?? { x: 0, y: 0 })) ?? Number.POSITIVE_INFINITY;

    if (score < bestScore || (score === bestScore && heuristic < bestHeuristic)) {
      bestIndex = index;
      bestScore = score;
      bestHeuristic = heuristic;
    }
  }

  return bestIndex;
}

function movementCost(start: TilePosition, target: TilePosition): number {
  return start.x !== target.x && start.y !== target.y ? Math.SQRT2 : 1;
}

function octileDistance(start: TilePosition, target: TilePosition): number {
  const deltaX = Math.abs(start.x - target.x);
  const deltaY = Math.abs(start.y - target.y);
  const diagonalSteps = Math.min(deltaX, deltaY);
  const straightSteps = Math.max(deltaX, deltaY) - diagonalSteps;

  return diagonalSteps * Math.SQRT2 + straightSteps;
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
