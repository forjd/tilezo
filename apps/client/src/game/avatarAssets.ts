import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";

export const AVATAR_LAYER_DRAW_ORDER = [
  "body",
  "shoes",
  "bottoms",
  "top",
  "face",
  "hair",
  "accessory",
] as const;

export type AvatarLayerSlot = (typeof AVATAR_LAYER_DRAW_ORDER)[number];
export type AvatarTintKey = "skinTone" | "hairColor" | "shirtColor" | "pantsColor" | "shoesColor";

export type AvatarManifest = {
  frame: {
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
  };
  states: string[];
  directions: string[];
  layers: AvatarLayerDefinition[];
};

export type AvatarLayerDefinition = {
  slot: AvatarLayerSlot;
  id: string;
  src: string;
  frames: number;
  tint?: AvatarTintKey;
  optional?: boolean;
};

export type ResolvedAvatarLayer = AvatarLayerDefinition & {
  tintColor?: number;
};

export function parseAvatarManifest(value: unknown): AvatarManifest {
  if (!isRecord(value)) {
    throw new Error("avatar manifest must be an object");
  }

  const frame = parseFrame(value.frame);
  const states = parseStringArray(value.states, "states");
  const directions = parseStringArray(value.directions, "directions");
  const layers = parseLayers(value.layers);

  return { frame, states, directions, layers };
}

export function resolveAvatarLayers(
  manifest: AvatarManifest,
  appearance: AvatarAppearance,
): ResolvedAvatarLayer[] {
  const selection = {
    body: "base",
    shoes: appearance.shoes || DEFAULT_AVATAR_APPEARANCE.shoes,
    bottoms: appearance.pants || DEFAULT_AVATAR_APPEARANCE.pants,
    top: appearance.shirt || DEFAULT_AVATAR_APPEARANCE.shirt,
    face: "default",
    hair: appearance.hair || DEFAULT_AVATAR_APPEARANCE.hair,
    accessory: undefined,
  } satisfies Partial<Record<AvatarLayerSlot, string | undefined>>;

  return AVATAR_LAYER_DRAW_ORDER.flatMap((slot) => {
    const id = selection[slot];

    if (!id) {
      return [];
    }

    const layer = findLayer(manifest, slot, id);
    if (!layer) {
      return [];
    }

    return [
      {
        ...layer,
        tintColor: layer.tint ? toPixiColor(appearance[layer.tint]) : undefined,
      },
    ];
  });
}

export function resolveAvatarAssetUrl(src: string): string {
  return new URL(`/assets/avatars/${src}`, globalThis.location?.origin ?? "http://localhost").href;
}

export function toPixiColor(value: string): number {
  if (!/^#[\da-fA-F]{6}$/.test(value)) {
    return 0xffffff;
  }

  return Number.parseInt(value.slice(1), 16);
}

function parseFrame(value: unknown): AvatarManifest["frame"] {
  if (!isRecord(value)) {
    throw new Error("avatar manifest frame must be an object");
  }

  return {
    width: positiveNumber(value.width, "frame.width"),
    height: positiveNumber(value.height, "frame.height"),
    anchorX: positiveNumber(value.anchorX, "frame.anchorX"),
    anchorY: positiveNumber(value.anchorY, "frame.anchorY"),
  };
}

function parseLayers(value: unknown): AvatarLayerDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("avatar manifest layers must be a non-empty array");
  }

  return value.map((layer, index) => {
    if (!isRecord(layer)) {
      throw new Error(`avatar manifest layer ${index} must be an object`);
    }

    return {
      slot: parseSlot(layer.slot, index),
      id: stringValue(layer.id, `layers[${index}].id`),
      src: stringValue(layer.src, `layers[${index}].src`),
      frames: positiveNumber(layer.frames, `layers[${index}].frames`),
      tint: parseTint(layer.tint, index),
      optional: layer.optional === true,
    };
  });
}

function findLayer(
  manifest: AvatarManifest,
  slot: AvatarLayerSlot,
  id: string,
): AvatarLayerDefinition | undefined {
  return manifest.layers.find((layer) => layer.slot === slot && layer.id === id);
}

function parseStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`avatar manifest ${key} must be a string array`);
  }

  return value;
}

function parseSlot(value: unknown, index: number): AvatarLayerSlot {
  if (AVATAR_LAYER_DRAW_ORDER.includes(value as AvatarLayerSlot)) {
    return value as AvatarLayerSlot;
  }

  throw new Error(`avatar manifest layers[${index}].slot is invalid`);
}

function parseTint(value: unknown, index: number): AvatarTintKey | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "skinTone" ||
    value === "hairColor" ||
    value === "shirtColor" ||
    value === "pantsColor" ||
    value === "shoesColor"
  ) {
    return value;
  }

  throw new Error(`avatar manifest layers[${index}].tint is invalid`);
}

function positiveNumber(value: unknown, key: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  throw new Error(`avatar manifest ${key} must be a positive number`);
}

function stringValue(value: unknown, key: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`avatar manifest ${key} must be a non-empty string`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
