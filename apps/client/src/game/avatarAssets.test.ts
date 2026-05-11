import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import {
  AVATAR_LAYER_DRAW_ORDER,
  parseAvatarManifest,
  resolveAvatarFrame,
  resolveAvatarLayers,
  resolveLayerFrameIndex,
  toPixiColor,
} from "./avatarAssets";

const manifest = {
  frame: { width: 64, height: 96, anchorX: 32, anchorY: 84 },
  states: ["idle", "walk"],
  directions: ["south", "south-east", "east", "north-east", "north"],
  animations: {
    idle: { start: 0, framesPerDirection: 1, frameDuration: 0.5 },
    walk: { start: 5, framesPerDirection: 4, frameDuration: 0.12 },
  },
  layers: [
    { slot: "hair", id: "short", tint: "hairColor", src: "layers/hair/short.png", frames: 25 },
    { slot: "body", id: "base", tint: "skinTone", src: "layers/body/base.png", frames: 25 },
    { slot: "top", id: "crew", tint: "shirtColor", src: "layers/tops/crew.png", frames: 25 },
    {
      slot: "bottoms",
      id: "straight",
      tint: "pantsColor",
      src: "layers/bottoms/straight.png",
      frames: 25,
    },
    { slot: "shoes", id: "boots", tint: "shoesColor", src: "layers/shoes/boots.png", frames: 25 },
    { slot: "face", id: "default", src: "layers/face/default.png", frames: 25 },
  ],
};

describe("avatarAssets", () => {
  test("parses a valid avatar manifest", () => {
    const parsed = parseAvatarManifest(manifest);

    expect(parsed.frame).toEqual({ width: 64, height: 96, anchorX: 32, anchorY: 84 });
    expect(parsed.layers).toHaveLength(6);
  });

  test("rejects malformed manifest data", () => {
    expect(() => parseAvatarManifest({ ...manifest, frame: { width: 0 } })).toThrow(
      "avatar manifest frame.width must be a positive number",
    );
  });

  test("resolves appearance layers in draw order", () => {
    const parsed = parseAvatarManifest(manifest);
    const layers = resolveAvatarLayers(parsed, DEFAULT_AVATAR_APPEARANCE);

    expect(layers.map((layer) => layer.slot)).toEqual([
      "body",
      "shoes",
      "bottoms",
      "top",
      "face",
      "hair",
    ]);
    expect(layers.map((layer) => layer.id)).toEqual([
      "base",
      "boots",
      "straight",
      "crew",
      "default",
      "short",
    ]);
  });

  test("uses default appearance values when a selected style is unavailable", () => {
    const parsed = parseAvatarManifest({
      ...manifest,
      layers: manifest.layers.filter((layer) => layer.id !== "short"),
    });

    const layers = resolveAvatarLayers(parsed, {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part",
    });

    expect(layers.map((layer) => layer.slot)).toEqual(["body", "shoes", "bottoms", "top", "face"]);
  });

  test("converts css hex colors for pixi tint", () => {
    expect(toPixiColor("#f2c097")).toBe(0xf2c097);
  });

  test("resolves animation frames and mirrors unsupported west-facing directions", () => {
    const parsed = parseAvatarManifest(manifest);
    const frame = resolveAvatarFrame(parsed, "walk", "south-west", 0.25);

    expect(frame).toEqual({
      index: 11,
      direction: "south-east",
      mirrored: true,
      animationFrame: 2,
    });

    const [layer] = parsed.layers;

    if (!layer) {
      throw new Error("expected test layer");
    }

    expect(resolveLayerFrameIndex(layer, frame.index)).toBe(11);
    expect(resolveLayerFrameIndex({ ...layer, frames: 1 }, frame.index)).toBe(0);
  });

  test("keeps layer draw order stable", () => {
    expect(AVATAR_LAYER_DRAW_ORDER).toEqual([
      "body",
      "shoes",
      "bottoms",
      "top",
      "face",
      "hair",
      "accessory",
    ]);
  });
});
