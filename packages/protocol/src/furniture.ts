import type { TilePosition } from "@tilezo/engine";

export type FurnitureKind = "seat" | "surface" | "divider" | "decor" | "floor";

export type FurnitureInteractionKind = "none" | "sit" | "toggle";

export type FurnitureFootprint = {
  width: number;
  depth: number;
};

export type FurnitureDefinition = {
  id: string;
  name: string;
  kind: FurnitureKind;
  footprint: FurnitureFootprint;
  height: number;
  canWalkOn: boolean;
  canSitOn: boolean;
  canStackOn: boolean;
  canRotate: boolean;
  spriteKey: string;
  interactionKind: FurnitureInteractionKind;
  defaultState: Record<string, unknown>;
};

export type RoomItem = {
  id: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  state: Record<string, unknown>;
};

export const FURNITURE_DEFINITIONS = [
  {
    id: "woven_rug",
    name: "Woven Rug",
    kind: "floor",
    footprint: { width: 2, depth: 1 },
    height: 0,
    canWalkOn: true,
    canSitOn: false,
    canStackOn: false,
    canRotate: true,
    spriteKey: "woven_rug",
    interactionKind: "none",
    defaultState: {},
  },
  {
    id: "crate_table",
    name: "Crate Table",
    kind: "surface",
    footprint: { width: 1, depth: 1 },
    height: 1,
    canWalkOn: false,
    canSitOn: false,
    canStackOn: true,
    canRotate: true,
    spriteKey: "crate_table",
    interactionKind: "none",
    defaultState: {},
  },
  {
    id: "low_stool",
    name: "Low Stool",
    kind: "seat",
    footprint: { width: 1, depth: 1 },
    height: 1,
    canWalkOn: true,
    canSitOn: true,
    canStackOn: false,
    canRotate: true,
    spriteKey: "low_stool",
    interactionKind: "sit",
    defaultState: {},
  },
  {
    id: "reed_divider",
    name: "Reed Divider",
    kind: "divider",
    footprint: { width: 1, depth: 2 },
    height: 2,
    canWalkOn: false,
    canSitOn: false,
    canStackOn: false,
    canRotate: true,
    spriteKey: "reed_divider",
    interactionKind: "none",
    defaultState: {},
  },
  {
    id: "glass_lamp",
    name: "Glass Lamp",
    kind: "decor",
    footprint: { width: 1, depth: 1 },
    height: 2,
    canWalkOn: false,
    canSitOn: false,
    canStackOn: false,
    canRotate: false,
    spriteKey: "glass_lamp",
    interactionKind: "toggle",
    defaultState: { on: false },
  },
] as const satisfies readonly FurnitureDefinition[];

const FURNITURE_DEFINITION_MAP = new Map<string, FurnitureDefinition>(
  FURNITURE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getFurnitureDefinition(itemType: string): FurnitureDefinition | undefined {
  return FURNITURE_DEFINITION_MAP.get(itemType);
}

export function getRotatedFurnitureFootprint(
  definition: FurnitureDefinition,
  rotation: number,
): FurnitureFootprint {
  return normalizeFurnitureRotation(rotation) % 2 === 0
    ? { ...definition.footprint }
    : { width: definition.footprint.depth, depth: definition.footprint.width };
}

export function getFurnitureFootprintTiles(
  item: Pick<RoomItem, "x" | "y" | "rotation">,
  definition: FurnitureDefinition,
): TilePosition[] {
  const footprint = getRotatedFurnitureFootprint(definition, item.rotation);
  const tiles: TilePosition[] = [];

  for (let y = 0; y < footprint.depth; y += 1) {
    for (let x = 0; x < footprint.width; x += 1) {
      tiles.push({ x: item.x + x, y: item.y + y });
    }
  }

  return tiles;
}

export function isValidFurnitureRotation(
  definition: FurnitureDefinition,
  rotation: number,
): boolean {
  return (
    Number.isInteger(rotation) &&
    rotation >= 0 &&
    rotation <= 3 &&
    (definition.canRotate || rotation === 0)
  );
}

export function normalizeFurnitureRotation(rotation: number): number {
  return ((Math.trunc(rotation) % 4) + 4) % 4;
}
