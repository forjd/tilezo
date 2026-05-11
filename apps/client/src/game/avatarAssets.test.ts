import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import {
  AVATAR_LAYER_DRAW_ORDER,
  parseAvatarManifest,
  resolveAvatarLayers,
  toPixiColor,
} from "./avatarAssets";

const manifest = {
  frame: { width: 64, height: 96, anchorX: 32, anchorY: 84 },
  states: ["idle", "walk"],
  directions: ["south", "south-east", "east", "north-east", "north"],
  layers: [
    { slot: "hair", id: "short", tint: "hairColor", src: "layers/hair/short.png", frames: 1 },
    { slot: "body", id: "base", tint: "skinTone", src: "layers/body/base.png", frames: 1 },
    { slot: "top", id: "crew", tint: "shirtColor", src: "layers/tops/crew.png", frames: 1 },
    {
      slot: "bottoms",
      id: "straight",
      tint: "pantsColor",
      src: "layers/bottoms/straight.png",
      frames: 1,
    },
    { slot: "shoes", id: "boots", tint: "shoesColor", src: "layers/shoes/boots.png", frames: 1 },
    { slot: "face", id: "default", src: "layers/face/default.png", frames: 1 },
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
