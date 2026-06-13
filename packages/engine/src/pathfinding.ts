import { TileGrid, tileKey } from "./grid";
import type { RoomLayout, TilePosition } from "./types";

export function findPath(
  layoutOrGrid: RoomLayout | TileGrid,
  start: TilePosition,
  target: TilePosition,
): TilePosition[] | null {
  const grid = layoutOrGrid instanceof TileGrid ? layoutOrGrid : new TileGrid(layoutOrGrid);

  if (!grid.isWalkable(start) || !grid.isWalkable(target)) {
    return null;
  }

  if (start.x === target.x && start.y === target.y) {
    return [];
  }

  const openSet = new PriorityQueue();
  const cameFrom = new Map<string, TilePosition>();
  const gScore = new Map<string, number>([[tileKey(start), 0]]);
  const closedKeys = new Set<string>();
  openSet.push(start, octileDistance(start, target), octileDistance(start, target));

  while (openSet.size > 0) {
    const current = openSet.pop();

    if (!current) {
      continue;
    }

    const currentKey = tileKey(current);

    if (closedKeys.has(currentKey)) {
      continue;
    }

    closedKeys.add(currentKey);

    if (current.x === target.x && current.y === target.y) {
      return reconstructPath(cameFrom, start, current) ?? null;
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
      const heuristic = octileDistance(neighbor, target);
      openSet.push(neighbor, tentativeScore + heuristic, heuristic);
    }
  }

  return null;
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
): TilePosition[] | null {
  const path: TilePosition[] = [target];
  let current = target;

  while (current.x !== start.x || current.y !== start.y) {
    const parent = cameFrom.get(tileKey(current));

    if (!parent) {
      // A broken parent chain would otherwise yield a partial path that does not start
      // at `start`. Fail loudly instead of returning a truncated, authoritative-looking
      // path the server would broadcast as valid.
      return null;
    }

    current = parent;
    path.push(current);
  }

  path.reverse();
  return path;
}

type QueueEntry = {
  position: TilePosition;
  score: number;
  heuristic: number;
};

class PriorityQueue {
  private readonly entries: QueueEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(position: TilePosition, score: number, heuristic: number): void {
    this.entries.push({ position, score, heuristic });
    this.bubbleUp(this.entries.length - 1);
  }

  pop(): TilePosition | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();

    if (!first || !last) {
      return undefined;
    }

    if (this.entries.length > 0) {
      this.entries[0] = last;
      this.bubbleDown(0);
    }

    return first.position;
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (!isBetter(this.entries[currentIndex], this.entries[parentIndex])) {
        return;
      }

      this.swap(currentIndex, parentIndex);
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = leftIndex + 1;
      let bestIndex = currentIndex;

      if (isBetter(this.entries[leftIndex], this.entries[bestIndex])) {
        bestIndex = leftIndex;
      }

      if (isBetter(this.entries[rightIndex], this.entries[bestIndex])) {
        bestIndex = rightIndex;
      }

      if (bestIndex === currentIndex) {
        return;
      }

      this.swap(currentIndex, bestIndex);
      currentIndex = bestIndex;
    }
  }

  private swap(a: number, b: number): void {
    const left = this.entries[a];
    const right = this.entries[b];

    if (!left || !right) {
      return;
    }

    this.entries[a] = right;
    this.entries[b] = left;
  }
}

function isBetter(a: QueueEntry | undefined, b: QueueEntry | undefined): boolean {
  if (!a) {
    return false;
  }

  if (!b) {
    return true;
  }

  return a.score < b.score || (a.score === b.score && a.heuristic < b.heuristic);
}
