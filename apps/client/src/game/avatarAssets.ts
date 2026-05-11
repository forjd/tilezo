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

const AVATAR_ASSET_URLS: Readonly<Record<string, string>> = {
  "layers/body/base.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAq0lEQVR42u3YOQ6AMAwAwfz/0yYVLQUOOPFsD5JH4ojHkCRJkn4pZu0Gfqrt4MdCxItaD789QiTWevgtEVoDxMIAAADQd3gIHgEAAPwJAnAatA+wEQLgEag/3IqXYDkkAADqBAAAAAAAAAAAAAAAAIchAACKAGSvxLYEyFyK+gqcAvD1PcuhrLweAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACBJkiRJknR3AcfARBxa7TW8AAAAAElFTkSuQmCC",
  "layers/bottoms/straight.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAUElEQVR42u3QIQ4AAAjEsPv/p8GTkCCQrZ9ZAgAAAAAAAAAAAAAAAABs6ui7NcAAAwwwwAADDDDAAAMMMMAAAwwwwAADDDDAAAMMAAAAAJga/PTImrjz3OgAAAAASUVORK5CYII=",
  "layers/bottoms/wide.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAT0lEQVR42u3QIRIAAAjDsP3/0+AnOWTia5oAAAAAAAAAAAAAAAAAAG0OPnsDDDDAAAMMMMAAAwwwwAADDDDAAAMMMMAAAwwwwAADAAAAgLaBtYYHbP5P9AAAAABJRU5ErkJggg==",
  "layers/face/default.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAS0lEQVR42u3QsQkAIBAEQRsx0lpsw8qs9cUCBEEMhBnY7KJLCQAAAACAN3KpsbrdOAAA/jZ6i10OAAAAAAAAAAAAAAAAAAAAAODcBAk+KqeXxLI9AAAAAElFTkSuQmCC",
  "layers/hair/bob.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAjElEQVR42u3Z0Q2AMAhAwe6/NDqCUVQodwtQXtKfdi0A4C9xGrXsVWMX3y5EJBi7eNsQ8SIBJi/fIsLoAPEhAQQQYO7yIrgCAsT4+18qxOgAUYAAAgggQNkAGa/C7QM8/RfYJsDdn6GtA1SZIYAAAgggQPYBu80QIOuQ3WcAAAAAAAAAAAAAAAAAtHUAeqSIIRZNOpIAAAAASUVORK5CYII=",
  "layers/hair/short.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAZUlEQVR42u3YsRGAQAwDwe+/aUEHBPAwRrsd6CKP1wIAvpJT3eArtcN/GyI3VI8fHyEPEqB5/MgIAghQHCAbVY8fEUEAAQQQQAABBEj1MeQn6CsMAAAAAAAAAAAAAAAAAAAAwGsOWOXFj6Wm6tEAAAAASUVORK5CYII=",
  "layers/hair/side-part.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAaklEQVR42u3YwQHAIAwDMfZfOu0G/VAIWNrA9/QYAMAO9Yob/CV2+JUhaoLo8cdGqB8IkDz+qAgCCBAYoBaKD9AyiAACCCCAAAIIMH1YZICI9+e6Vzjy8AQAAAAAAAAAAAAAAAAAAADo4gG7uXABy2hrMQAAAABJRU5ErkJggg==",
  "layers/shoes/boots.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAATklEQVR42u3VwQkAMAgEMPdful2goA8pgskAhyeCEQAAAAAAAAAAAAAAAAAAAAAAAAAsdwp+5owqXinQlWMB08u/hu/KcQEW4AsAAAC5CzC7pXeluY0sAAAAAElFTkSuQmCC",
  "layers/shoes/sneakers.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAVElEQVR42u3TOQoAIBADQP//aW2tFoTggTO1hE3A1gAAAAAAAAAAAAAAAAAAAAAAAAD4WF+wI+fK4lWBVI4BXik/H5/KMYAvYICzQyTepXIAAKA2AFP8VNbkXBVxAAAAAElFTkSuQmCC",
  "layers/tops/crew.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAXklEQVR42u3ZuQ0AMAgEQfpvGudO/UjoZjpgw6MKAAAAAAAAAOCCPhB59PgY/VD08SMiCJAcoD8SQAABBBBAAAEEEEAAAQQQQAB7gAACWIX9BXyGAAAAAAAAAAAA2Cx4bHoT6rB8GAAAAABJRU5ErkJggg==",
  "layers/tops/hoodie.png":
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABgCAYAAACtxXToAAAAdUlEQVR42u3ZyQGAQAwDsfTfdGgAXrDsYakDzzOpAgAAAAAAYKy+ETn6Sezw40L0B6LHbx0hOkAPIEDy+G0i9A+ixy8dQYDkAD2BAAIIIIAAAggggAACCCCAAAII4CAigADO4h4jXmOnxSgAAAAAAAAAAOCNCwKMyuwcTvu6AAAAAElFTkSuQmCC",
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
  const bundledUrl = AVATAR_ASSET_URLS[src];

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
