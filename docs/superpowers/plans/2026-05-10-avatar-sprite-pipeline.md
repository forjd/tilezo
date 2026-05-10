# Avatar Sprite Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tilezo's procedural in-room avatar body and create-character preview with a manifest-driven layered sprite foundation while preserving movement, labels, and the existing appearance protocol.

**Architecture:** Add a small client avatar asset module that parses a generated manifest, resolves `AvatarAppearance` into ordered layer descriptors, and exposes tint metadata. Add starter PNG layer assets and a manifest under `assets/avatars/`, then update both `Avatar.ts` and `CharacterEditor.ts` to compose the same ordered layer set in Pixi and DOM contexts.

**Tech Stack:** Bun, TypeScript, PixiJS 8, Biome, Bun test, local project skill `.codex/skills/tilezo-avatar-sprites`.

---

## File Structure

- Create `apps/client/src/game/avatarAssets.ts`: typed manifest parsing, draw-order constants, appearance-to-layer resolution, tint conversion helpers, and asset URL resolution.
- Create `apps/client/src/game/avatarAssets.test.ts`: focused Bun tests for parser, layer ordering, fallback, and tint mapping.
- Modify `apps/client/src/game/Avatar.ts`: move procedural drawing into fallback helpers and add manifest-driven Pixi sprite composition.
- Modify `apps/client/src/game/Avatar.test.ts`: add assertions for sprite layer replacement and fallback preservation.
- Create `apps/client/src/ui/AvatarPreview.ts`: DOM preview helper that uses `avatarAssets.ts` to render the same manifest layers in the create-character UI.
- Create `apps/client/src/ui/AvatarPreview.test.ts`: focused tests for DOM layer generation and tint CSS variables.
- Modify `apps/client/src/ui/CharacterEditor.ts`: replace CSS-drawn preview bodies with manifest-driven DOM preview layers.
- Modify `apps/client/src/ui/CharacterEditor.test.ts`: assert preview layers update from controls.
- Modify `apps/client/src/styles.css`: remove or shrink procedural preview pseudo-element rules and add stable layered image preview styles.
- Create `assets/avatars/avatar-manifest.json`: starter manifest for static one-frame layers.
- Create `assets/avatars/layers/**.png`: starter transparent PNG layer strips for body, face, hair, tops, bottoms, and shoes.
- Optionally modify `apps/client/src/assets.ts`: export avatar manifest URL only if the renderer should centralize public asset paths there.
- Use `.codex/skills/tilezo-avatar-sprites/scripts/inspect_avatar_assets.py`: validate manifest and PNG dimensions.

## Task 1: Avatar Asset Model

**Files:**
- Create: `apps/client/src/game/avatarAssets.ts`
- Create: `apps/client/src/game/avatarAssets.test.ts`

- [ ] **Step 1: Write failing tests for manifest parsing and layer resolution**

Create `apps/client/src/game/avatarAssets.test.ts`:

```ts
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
    { slot: "bottoms", id: "straight", tint: "pantsColor", src: "layers/bottoms/straight.png", frames: 1 },
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun test apps/client/src/game/avatarAssets.test.ts
```

Expected: FAIL because `apps/client/src/game/avatarAssets.ts` does not exist.

- [ ] **Step 3: Implement the avatar asset model**

Create `apps/client/src/game/avatarAssets.ts`:

```ts
import {
  type AvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
} from "@tilezo/protocol";

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
export type AvatarTintKey =
  | "skinTone"
  | "hairColor"
  | "shirtColor"
  | "pantsColor"
  | "shoesColor";

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
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
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
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
bun test apps/client/src/game/avatarAssets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/game/avatarAssets.ts apps/client/src/game/avatarAssets.test.ts
git commit -m "feat(client): add avatar asset manifest model"
```

## Task 2: Starter Avatar Assets

**Files:**
- Create: `assets/avatars/avatar-manifest.json`
- Create: `assets/avatars/layers/body/base.png`
- Create: `assets/avatars/layers/face/default.png`
- Create: `assets/avatars/layers/hair/short.png`
- Create: `assets/avatars/layers/hair/side-part.png`
- Create: `assets/avatars/layers/hair/bob.png`
- Create: `assets/avatars/layers/tops/crew.png`
- Create: `assets/avatars/layers/tops/hoodie.png`
- Create: `assets/avatars/layers/bottoms/straight.png`
- Create: `assets/avatars/layers/bottoms/wide.png`
- Create: `assets/avatars/layers/shoes/boots.png`
- Create: `assets/avatars/layers/shoes/sneakers.png`

- [ ] **Step 1: Create the manifest**

Create `assets/avatars/avatar-manifest.json`:

```json
{
  "frame": {
    "width": 64,
    "height": 96,
    "anchorX": 32,
    "anchorY": 84
  },
  "states": ["idle"],
  "directions": ["south"],
  "layers": [
    { "slot": "body", "id": "base", "tint": "skinTone", "src": "layers/body/base.png", "frames": 1 },
    { "slot": "shoes", "id": "boots", "tint": "shoesColor", "src": "layers/shoes/boots.png", "frames": 1 },
    { "slot": "shoes", "id": "sneakers", "tint": "shoesColor", "src": "layers/shoes/sneakers.png", "frames": 1 },
    { "slot": "bottoms", "id": "straight", "tint": "pantsColor", "src": "layers/bottoms/straight.png", "frames": 1 },
    { "slot": "bottoms", "id": "wide", "tint": "pantsColor", "src": "layers/bottoms/wide.png", "frames": 1 },
    { "slot": "top", "id": "crew", "tint": "shirtColor", "src": "layers/tops/crew.png", "frames": 1 },
    { "slot": "top", "id": "hoodie", "tint": "shirtColor", "src": "layers/tops/hoodie.png", "frames": 1 },
    { "slot": "face", "id": "default", "src": "layers/face/default.png", "frames": 1 },
    { "slot": "hair", "id": "short", "tint": "hairColor", "src": "layers/hair/short.png", "frames": 1 },
    { "slot": "hair", "id": "side-part", "tint": "hairColor", "src": "layers/hair/side-part.png", "frames": 1 },
    { "slot": "hair", "id": "bob", "tint": "hairColor", "src": "layers/hair/bob.png", "frames": 1 }
  ]
}
```

- [ ] **Step 2: Generate transparent starter PNG layers**

Use a short local generator for starter art only. The generator should create 64x96 transparent PNG files with simple flat regions that match the old procedural avatar proportions. Keep it outside the repo or remove it after use.

Run:

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("assets/avatars/layers")
files = [
  "body/base.png",
  "face/default.png",
  "hair/short.png",
  "hair/side-part.png",
  "hair/bob.png",
  "tops/crew.png",
  "tops/hoodie.png",
  "bottoms/straight.png",
  "bottoms/wide.png",
  "shoes/boots.png",
  "shoes/sneakers.png",
]
for file in files:
  (root / file).parent.mkdir(parents=True, exist_ok=True)

def save(name, draw_fn):
  image = Image.new("RGBA", (64, 96), (0, 0, 0, 0))
  draw = ImageDraw.Draw(image)
  draw_fn(draw)
  image.save(root / name)

save("body/base.png", lambda d: (
  d.rounded_rectangle((22, 31, 42, 54), radius=6, fill=(255, 255, 255, 255)),
  d.rectangle((20, 54, 28, 79), fill=(255, 255, 255, 255)),
  d.rectangle((36, 54, 44, 79), fill=(255, 255, 255, 255)),
  d.rectangle((15, 34, 21, 55), fill=(255, 255, 255, 255)),
  d.rectangle((43, 34, 49, 55), fill=(255, 255, 255, 255)),
  d.ellipse((20, 10, 44, 34), fill=(255, 255, 255, 255)),
))
save("face/default.png", lambda d: (
  d.ellipse((26, 20, 29, 23), fill=(29, 35, 36, 255)),
  d.ellipse((35, 20, 38, 23), fill=(29, 35, 36, 255)),
  d.rectangle((30, 29, 36, 30), fill=(157, 95, 70, 255)),
))
save("hair/short.png", lambda d: (
  d.ellipse((21, 7, 43, 29), fill=(255, 255, 255, 255)),
  d.rectangle((20, 19, 44, 27), fill=(255, 255, 255, 255)),
))
save("hair/side-part.png", lambda d: (
  d.ellipse((19, 7, 43, 29), fill=(255, 255, 255, 255)),
  d.rectangle((17, 18, 28, 30), fill=(255, 255, 255, 255)),
  d.rectangle((39, 19, 47, 27), fill=(255, 255, 255, 255)),
))
save("hair/bob.png", lambda d: (
  d.ellipse((18, 7, 46, 33), fill=(255, 255, 255, 255)),
  d.rounded_rectangle((16, 23, 23, 42), radius=3, fill=(255, 255, 255, 255)),
  d.rounded_rectangle((41, 23, 48, 42), radius=3, fill=(255, 255, 255, 255)),
))
save("tops/crew.png", lambda d: d.rounded_rectangle((19, 32, 45, 58), radius=6, fill=(255, 255, 255, 255)))
save("tops/hoodie.png", lambda d: (
  d.rounded_rectangle((18, 31, 46, 60), radius=7, fill=(255, 255, 255, 255)),
  d.arc((22, 27, 42, 43), 180, 360, fill=(255, 255, 255, 255), width=4),
))
save("bottoms/straight.png", lambda d: (
  d.rectangle((20, 55, 29, 79), fill=(255, 255, 255, 255)),
  d.rectangle((35, 55, 44, 79), fill=(255, 255, 255, 255)),
))
save("bottoms/wide.png", lambda d: (
  d.rectangle((18, 55, 30, 80), fill=(255, 255, 255, 255)),
  d.rectangle((34, 55, 46, 80), fill=(255, 255, 255, 255)),
))
save("shoes/boots.png", lambda d: (
  d.rounded_rectangle((16, 78, 30, 84), radius=3, fill=(255, 255, 255, 255)),
  d.rounded_rectangle((34, 78, 48, 84), radius=3, fill=(255, 255, 255, 255)),
))
save("shoes/sneakers.png", lambda d: (
  d.rounded_rectangle((15, 79, 31, 84), radius=3, fill=(255, 255, 255, 255)),
  d.rounded_rectangle((33, 79, 49, 84), radius=3, fill=(255, 255, 255, 255)),
  d.rectangle((18, 78, 28, 79), fill=(255, 255, 255, 255)),
  d.rectangle((36, 78, 46, 79), fill=(255, 255, 255, 255)),
))
PY
```

If Pillow is unavailable, use the repository's bundled workspace Python dependencies or write a minimal PNG writer in a temporary script. Do not add Pillow as a project dependency for starter assets.

- [ ] **Step 3: Validate manifest dimensions**

Run:

```bash
python3 .codex/skills/tilezo-avatar-sprites/scripts/inspect_avatar_assets.py assets/avatars/avatar-manifest.json
```

Expected: `ok: validated 11 avatar layer asset(s)`.

- [ ] **Step 4: Commit**

```bash
git add assets/avatars
git commit -m "feat(client): add starter avatar sprite layers"
```

## Task 3: Pixi Layered Avatar Renderer

**Files:**
- Modify: `apps/client/src/game/Avatar.ts`
- Modify: `apps/client/src/game/Avatar.test.ts`

- [ ] **Step 1: Write failing Avatar tests for layer composition**

Add this test to `apps/client/src/game/Avatar.test.ts`:

```ts
test("rebuilds sprite layers when appearance changes", () => {
  const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 }, DEFAULT_AVATAR_APPEARANCE);

  avatar.setAppearance({
    ...DEFAULT_AVATAR_APPEARANCE,
    hair: "bob",
    hairColor: "#111111",
    shirt: "hoodie",
    shirtColor: "#222222",
  });

  const state = avatar as unknown as {
    spriteLayer?: { children: Array<{ tint?: number }> };
  };

  expect(state.spriteLayer?.children.length).toBeGreaterThanOrEqual(6);
  expect(state.spriteLayer?.children.some((child) => child.tint === 0x111111)).toBe(true);
  expect(state.spriteLayer?.children.some((child) => child.tint === 0x222222)).toBe(true);
});
```

- [ ] **Step 2: Run the focused Avatar test to verify it fails**

Run:

```bash
bun test apps/client/src/game/Avatar.test.ts
```

Expected: FAIL because `Avatar` still uses only the procedural `Graphics` body.

- [ ] **Step 3: Implement sprite layer composition with fallback**

Modify `apps/client/src/game/Avatar.ts`:

- Import `Assets`, `Container`, `Graphics`, `Sprite`, and `Text` from `pixi.js`.
- Add imports from `./avatarAssets`.
- Keep the existing procedural drawing methods as fallback methods.
- Add a `spriteLayer = new Container()` member.
- Add a `fallbackBody = new Graphics()` member.
- In the constructor, add `spriteLayer`, fallback body, and label to `view`.
- In `setAppearance`, call a new `rebuildBody()` method.
- In `rebuildBody()`, try to parse the bundled manifest and create sprites; if parsing or texture lookup fails, render the old procedural body.

Use this implementation shape:

```ts
private readonly spriteLayer = new Container();
private readonly fallbackBody = new Graphics();

private rebuildBody(): void {
  this.spriteLayer.removeChildren();
  this.fallbackBody.clear();

  const manifest = getBundledAvatarManifest();

  if (!manifest) {
    this.drawFallbackBody();
    return;
  }

  const layers = resolveAvatarLayers(manifest, this.appearance);

  if (layers.length === 0) {
    this.drawFallbackBody();
    return;
  }

  for (const layer of layers) {
    const texture = Texture.from(resolveAvatarAssetUrl(layer.src));
    const sprite = new Sprite(texture);
    sprite.x = -manifest.frame.anchorX;
    sprite.y = -manifest.frame.anchorY;

    if (layer.tintColor !== undefined) {
      sprite.tint = layer.tintColor;
    }

    this.spriteLayer.addChild(sprite);
  }
}
```

Add `getBundledAvatarManifest()` near the bottom of the file:

```ts
function getBundledAvatarManifest(): AvatarManifest | undefined {
  try {
    return parseAvatarManifest(avatarManifest);
  } catch {
    return undefined;
  }
}
```

Import the JSON manifest with:

```ts
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
```

If TypeScript rejects JSON imports, add the minimal `resolveJsonModule` setting in `tsconfig.base.json` and include that change in this task.

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test apps/client/src/game/avatarAssets.test.ts apps/client/src/game/Avatar.test.ts apps/client/src/game/RoomScene.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/game/Avatar.ts apps/client/src/game/Avatar.test.ts tsconfig.base.json
git commit -m "feat(client): render avatars from sprite layers"
```

## Task 4: Create-Character Layered Preview

**Files:**
- Create: `apps/client/src/ui/AvatarPreview.ts`
- Create: `apps/client/src/ui/AvatarPreview.test.ts`
- Modify: `apps/client/src/ui/CharacterEditor.ts`
- Modify: `apps/client/src/ui/CharacterEditor.test.ts`
- Modify: `apps/client/src/styles.css`

- [ ] **Step 1: Write failing AvatarPreview tests**

Create `apps/client/src/ui/AvatarPreview.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { createAvatarPreview, updateAvatarPreview } from "./AvatarPreview";

describe("AvatarPreview", () => {
  test("renders manifest layers for a selected appearance", () => {
    const preview = createAvatarPreview(document);

    updateAvatarPreview(preview, {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "bob",
      hairColor: "#111111",
      shirt: "hoodie",
      shirtColor: "#222222",
    });

    const layers = Array.from(preview.querySelectorAll(".avatar-preview-layer"));

    expect(layers.length).toBeGreaterThanOrEqual(6);
    expect(layers.map((layer) => layer.getAttribute("data-slot"))).toEqual([
      "body",
      "shoes",
      "bottoms",
      "top",
      "face",
      "hair",
    ]);
    expect(
      layers.some((layer) => (layer as HTMLElement).style.getPropertyValue("--layer-tint") === "#111111"),
    ).toBe(true);
    expect(
      layers.some((layer) => (layer as HTMLElement).style.getPropertyValue("--layer-tint") === "#222222"),
    ).toBe(true);
  });
});
```

If Bun's DOM implementation is unavailable for this test, use the existing `FakeElement` pattern from `apps/client/src/ui/CharacterEditor.test.ts` and assert `children`, `className`, `dataset`, and `style` values instead.

- [ ] **Step 2: Run the focused preview test to verify it fails**

Run:

```bash
bun test apps/client/src/ui/AvatarPreview.test.ts
```

Expected: FAIL because `apps/client/src/ui/AvatarPreview.ts` does not exist.

- [ ] **Step 3: Implement the shared DOM preview helper**

Create `apps/client/src/ui/AvatarPreview.ts`:

```ts
import type { AvatarAppearance } from "@tilezo/protocol";
import avatarManifest from "../../../../assets/avatars/avatar-manifest.json";
import {
  type AvatarManifest,
  parseAvatarManifest,
  resolveAvatarAssetUrl,
  resolveAvatarLayers,
} from "../game/avatarAssets";

const manifest = getManifest();

export function createAvatarPreview(documentRef: Document): HTMLDivElement {
  const preview = documentRef.createElement("div");
  preview.className = "avatar-preview-sprite";
  preview.style.setProperty("--avatar-frame-width", `${manifest.frame.width}px`);
  preview.style.setProperty("--avatar-frame-height", `${manifest.frame.height}px`);
  return preview;
}

export function updateAvatarPreview(
  preview: HTMLElement,
  appearance: AvatarAppearance,
): void {
  preview.innerHTML = "";

  for (const layer of resolveAvatarLayers(manifest, appearance)) {
    const layerElement = preview.ownerDocument.createElement("span");
    layerElement.className = "avatar-preview-layer";
    layerElement.dataset.slot = layer.slot;
    layerElement.dataset.layerId = layer.id;
    layerElement.style.setProperty("--layer-image", `url("${resolveAvatarAssetUrl(layer.src)}")`);

    if (layer.tint) {
      layerElement.style.setProperty("--layer-tint", appearance[layer.tint]);
    }

    preview.append(layerElement);
  }
}

function getManifest(): AvatarManifest {
  return parseAvatarManifest(avatarManifest);
}
```

If the `FakeElement` test environment lacks `ownerDocument` or `dataset`, update the helper to avoid hard dependency on those DOM APIs:

```ts
const documentRef = preview.ownerDocument ?? document;
layerElement.setAttribute("data-slot", layer.slot);
layerElement.setAttribute("data-layer-id", layer.id);
```

- [ ] **Step 4: Update CharacterEditor to use AvatarPreview**

Modify `apps/client/src/ui/CharacterEditor.ts`:

- Import `createAvatarPreview` and `updateAvatarPreview`.
- Replace `previewBodies` with a single `previewBody = createAvatarPreview(document)`.
- In the preview DOM, create one `character-preview-avatar` containing `previewBody` and a caption of `Preview`.
- In `updatePreview()`, call `updateAvatarPreview(this.previewBody, appearance)`.
- Remove `createPreviewBody()` and the `titleCase(view)` use for preview captions if it is no longer needed.

The resulting preview block should preserve the existing form layout:

```ts
const previewAvatar = document.createElement("div");
const caption = document.createElement("span");
previewAvatar.className = "character-preview-avatar";
caption.textContent = "Preview";
previewAvatar.append(this.previewBody, caption);
previewViews.append(previewAvatar);
```

- [ ] **Step 5: Update CharacterEditor tests for manifest layers**

Modify the existing preview test in `apps/client/src/ui/CharacterEditor.test.ts` so it expects one manifest-driven preview instead of three CSS-drawn views:

```ts
test("renders a manifest-driven preview and updates it when controls change", () => {
  installDocument();
  const editor = new CharacterEditor({
    initialAppearance: DEFAULT_AVATAR_APPEARANCE,
    onSubmit() {},
  });
  const preview = editor.element.children[1] as unknown as FakeElement;
  const form = editor.element.children[2] as unknown as FakeElement;
  const hairColor = form.children[1]?.children[1] as FakeElement;

  hairColor.value = "#8b4a24";
  form.dispatch("input", {});

  const previewAvatar = preview.children[0]?.children[0] as FakeElement;
  const previewBody = previewAvatar.children[0] as FakeElement;

  expect(preview.children[0]?.className).toBe("character-preview-views");
  expect(previewAvatar.className).toBe("character-preview-avatar");
  expect(previewAvatar.children[1]?.textContent).toBe("Preview");
  expect(previewBody.className).toBe("avatar-preview-sprite");
  expect(previewBody.children.map((child) => child.className)).toContain("avatar-preview-layer");
  expect(
    previewBody.children.some(
      (child) => child.style.getPropertyValue("--layer-tint") === "#8b4a24",
    ),
  ).toBe(true);
});
```

Extend `FakeElement` with the DOM methods used by `AvatarPreview.ts`:

```ts
readonly dataset: Record<string, string> = {};
ownerDocument = globalThis.document as Document;

setAttribute(name: string, value: string): void {
  if (name.startsWith("data-")) {
    this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
}

getAttribute(name: string): string | undefined {
  if (name.startsWith("data-")) {
    return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
  }

  return undefined;
}
```

- [ ] **Step 6: Replace procedural preview CSS with layer styles**

Modify `apps/client/src/styles.css`:

- Keep `.character-preview`, `.character-preview-views`, `.character-preview-avatar`, and caption styles.
- Remove `.character-preview-body` pseudo-element drawing rules.
- Add fixed-size layer preview styles:

```css
.avatar-preview-sprite {
  position: relative;
  width: var(--avatar-frame-width, 64px);
  height: var(--avatar-frame-height, 96px);
  transform: scale(1.1);
  transform-origin: bottom center;
  image-rendering: pixelated;
}

.avatar-preview-layer {
  position: absolute;
  inset: 0;
  display: block;
  background-color: var(--layer-tint, transparent);
  mask: var(--layer-image) 0 0 / contain no-repeat;
}

.avatar-preview-layer[data-slot="face"] {
  background-color: transparent;
  background-image: var(--layer-image);
  background-position: 0 0;
  background-repeat: no-repeat;
  background-size: contain;
  mask: none;
}
```

Use `-webkit-mask` alongside `mask` if Safari compatibility is needed:

```css
  -webkit-mask: var(--layer-image) 0 0 / contain no-repeat;
```

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
bun test apps/client/src/ui/AvatarPreview.test.ts apps/client/src/ui/CharacterEditor.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/ui/AvatarPreview.ts apps/client/src/ui/AvatarPreview.test.ts apps/client/src/ui/CharacterEditor.ts apps/client/src/ui/CharacterEditor.test.ts apps/client/src/styles.css
git commit -m "feat(client): preview characters from avatar layers"
```

## Task 5: Build and Asset Validation

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run Biome**

Run:

```bash
bun run lint
```

Expected: PASS. If Biome reports formatting or import-order issues, run `bun run format`, inspect the diff, and keep only relevant formatting changes.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS. Fix any JSON import, Pixi type, or asset URL type errors in the smallest responsible file.

- [ ] **Step 3: Run asset validation**

Run:

```bash
python3 .codex/skills/tilezo-avatar-sprites/scripts/inspect_avatar_assets.py assets/avatars/avatar-manifest.json
```

Expected: `ok: validated 11 avatar layer asset(s)`.

- [ ] **Step 4: Run coverage validation**

Run:

```bash
bun run test:coverage
bun run coverage:check
```

Expected: both commands PASS.

- [ ] **Step 5: Commit fixes if validation required changes**

If any files changed during validation:

```bash
git diff --name-only
git add apps/client/src/game/avatarAssets.ts apps/client/src/game/Avatar.ts apps/client/src/game/Avatar.test.ts apps/client/src/ui/AvatarPreview.ts apps/client/src/ui/CharacterEditor.ts apps/client/src/ui/CharacterEditor.test.ts apps/client/src/styles.css tsconfig.base.json assets/avatars/avatar-manifest.json
git commit -m "fix(client): stabilize avatar sprite validation"
```

If no files changed, skip this commit.

## Task 6: Browser Verification

**Files:**
- Modify only files required by issues found in browser verification.

- [ ] **Step 1: Start the client dev server**

Run:

```bash
bun run dev:client
```

Expected: client available at `http://localhost:3001`.

- [ ] **Step 2: Open the in-app browser**

Use the Browser plugin to navigate to:

```text
http://localhost:3001
```

Expected: login/create-character UI loads without a blank canvas or console crash.

- [ ] **Step 3: Verify rendered avatar assets**

Use a test account flow or the fastest local authenticated path available in the repo. Confirm:

- The character still appears in the room.
- The username label remains above the avatar.
- The create-character preview uses the same layer art as the in-room avatar.
- Changing appearance updates visible hair/top/bottom/shoe colors.
- Clicking a walkable tile still moves the avatar.
- No sprite layer is visibly offset from the body.

- [ ] **Step 4: Capture a screenshot for review**

Use the Browser plugin screenshot capability and save or reference the image in the session. Inspect it for obvious layer alignment issues.

- [ ] **Step 5: Commit browser fixes if needed**

If browser verification required code or asset changes:

```bash
git diff --name-only
git add apps/client/src/game/Avatar.ts apps/client/src/ui/AvatarPreview.ts apps/client/src/ui/CharacterEditor.ts apps/client/src/styles.css assets/avatars
git commit -m "fix(client): align avatar sprite layers"
```

If no files changed, skip this commit.

## Self-Review

- Spec coverage: The plan covers the repo-local skill output, manifest format, starter assets, manifest validation, Pixi in-game rendering, create-character DOM preview rendering, fallback behavior, tests, and browser review.
- Placeholder scan: The plan contains no unresolved implementation markers or unspecified code steps.
- Type consistency: Manifest types, slot names, tint keys, and appearance fields match `packages/protocol/src/appearance.ts` and `.codex/skills/tilezo-avatar-sprites/references/avatar-asset-spec.md`.
