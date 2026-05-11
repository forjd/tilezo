import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import avatarAssetUrls from "../../../../assets/avatars/avatar-asset-urls.json";

export const AVATAR_LAYER_DRAW_ORDER = [
  "body",
  "shoes",
  "bottoms",
  "top",
  "face",
  "hair",
  "accessory",
] as const;

export const AVATAR_DIRECTIONS = ["south", "south-east", "east", "north-east", "north"] as const;

export const AVATAR_RENDER_DIRECTIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

export type AvatarLayerSlot = (typeof AVATAR_LAYER_DRAW_ORDER)[number];
export type AvatarDirection = (typeof AVATAR_DIRECTIONS)[number];
export type AvatarRenderDirection = (typeof AVATAR_RENDER_DIRECTIONS)[number];
export type AvatarAnimationState = "idle" | "walk";
export type AvatarTintKey = "skinTone" | "hairColor" | "shirtColor" | "pantsColor" | "shoesColor";

export type AvatarManifest = {
  frame: {
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
  };
  states: string[];
  directions: AvatarDirection[];
  animations: Record<string, AvatarAnimationDefinition>;
  layers: AvatarLayerDefinition[];
};

export type AvatarAnimationDefinition = {
  start: number;
  framesPerDirection: number;
  frameDuration: number;
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

export type AvatarFrameSelection = {
  index: number;
  direction: AvatarDirection;
  mirrored: boolean;
  animationFrame: number;
};

const FALLBACK_ANIMATION: AvatarAnimationDefinition = {
  start: 0,
  framesPerDirection: 1,
  frameDuration: 1,
};

const MIRRORED_DIRECTIONS: Partial<Record<AvatarRenderDirection, AvatarDirection>> = {
  "south-west": "south-east",
  west: "east",
  "north-west": "north-east",
};

export function parseAvatarManifest(value: unknown): AvatarManifest {
  if (!isRecord(value)) {
    throw new Error("avatar manifest must be an object");
  }

  const frame = parseFrame(value.frame);
  const states = parseStringArray(value.states, "states");
  const directions = parseDirections(value.directions);
  const animations = parseAnimations(value.animations);
  const layers = parseLayers(value.layers);

  return { frame, states, directions, animations, layers };
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

    const layer = findLayer(manifest, slot, id) ?? findLayer(manifest, slot, defaultLayerId(slot));
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

export function resolveAvatarFrame(
  manifest: AvatarManifest,
  state: AvatarAnimationState,
  direction: AvatarRenderDirection,
  elapsedSeconds: number,
): AvatarFrameSelection {
  const normalized = normalizeAvatarDirection(manifest, direction);
  const animation = manifest.animations[state] ?? manifest.animations.idle ?? FALLBACK_ANIMATION;
  const directionIndex = Math.max(0, manifest.directions.indexOf(normalized.direction));
  const frameCount = Math.max(1, Math.floor(animation.framesPerDirection));
  const frameDuration = Math.max(0.01, animation.frameDuration);
  const animationFrame = Math.floor(elapsedSeconds / frameDuration) % frameCount;

  return {
    index: animation.start + directionIndex * frameCount + animationFrame,
    direction: normalized.direction,
    mirrored: normalized.mirrored,
    animationFrame,
  };
}

export function resolveLayerFrameIndex(layer: AvatarLayerDefinition, frameIndex: number): number {
  return Math.max(0, Math.min(layer.frames - 1, frameIndex));
}

export function resolveAvatarAssetUrl(src: string): string {
  const bundledUrl = (avatarAssetUrls as Readonly<Record<string, string>>)[src];

  if (bundledUrl) {
    return bundledUrl;
  }

  return new URL(`/assets/avatars/${src}`, globalThis.location?.origin ?? "http://localhost").href;
}

export function toPixiColor(value: string): number {
  if (!/^#[\da-fA-F]{6}$/.test(value)) {
    return 0xffffff;
  }

  return Number.parseInt(value.slice(1), 16);
}

function normalizeAvatarDirection(
  manifest: AvatarManifest,
  direction: AvatarRenderDirection,
): { direction: AvatarDirection; mirrored: boolean } {
  const mirroredDirection = MIRRORED_DIRECTIONS[direction];

  if (mirroredDirection && manifest.directions.includes(mirroredDirection)) {
    return { direction: mirroredDirection, mirrored: true };
  }

  if (manifest.directions.includes(direction as AvatarDirection)) {
    return { direction: direction as AvatarDirection, mirrored: false };
  }

  return { direction: manifest.directions[0] ?? "south", mirrored: false };
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

function parseAnimations(value: unknown): Record<string, AvatarAnimationDefinition> {
  if (value === undefined) {
    return { idle: FALLBACK_ANIMATION, walk: FALLBACK_ANIMATION };
  }

  if (!isRecord(value)) {
    throw new Error("avatar manifest animations must be an object");
  }

  return Object.fromEntries(
    Object.entries(value).map(([state, animation]) => {
      if (!isRecord(animation)) {
        throw new Error(`avatar manifest animations.${state} must be an object`);
      }

      return [
        state,
        {
          start: nonNegativeNumber(animation.start, `animations.${state}.start`),
          framesPerDirection: positiveNumber(
            animation.framesPerDirection,
            `animations.${state}.framesPerDirection`,
          ),
          frameDuration: positiveNumber(
            animation.frameDuration,
            `animations.${state}.frameDuration`,
          ),
        },
      ];
    }),
  );
}

function parseDirections(value: unknown): AvatarDirection[] {
  const directions = parseStringArray(value, "directions");

  for (const [index, direction] of directions.entries()) {
    if (!AVATAR_DIRECTIONS.includes(direction as AvatarDirection)) {
      throw new Error(`avatar manifest directions[${index}] is invalid`);
    }
  }

  return directions as AvatarDirection[];
}

function findLayer(
  manifest: AvatarManifest,
  slot: AvatarLayerSlot,
  id: string,
): AvatarLayerDefinition | undefined {
  return manifest.layers.find((layer) => layer.slot === slot && layer.id === id);
}

function defaultLayerId(slot: AvatarLayerSlot): string {
  switch (slot) {
    case "body":
      return "base";
    case "shoes":
      return DEFAULT_AVATAR_APPEARANCE.shoes;
    case "bottoms":
      return DEFAULT_AVATAR_APPEARANCE.pants;
    case "top":
      return DEFAULT_AVATAR_APPEARANCE.shirt;
    case "face":
      return "default";
    case "hair":
      return DEFAULT_AVATAR_APPEARANCE.hair;
    case "accessory":
      return "";
  }
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

function nonNegativeNumber(value: unknown, key: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  throw new Error(`avatar manifest ${key} must be a non-negative number`);
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
