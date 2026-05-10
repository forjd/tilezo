---
name: tilezo-avatar-sprites
description: Design, generate, validate, and integrate layered isometric avatar sprites for Tilezo. Use when working on Habbo-like character assets, avatar spritesheets, avatar layer manifests, character appearance options, PixiJS avatar rendering, or replacing procedural Graphics avatars with proper layered sprites.
---

# Tilezo Avatar Sprites

## Overview

Use this skill for Tilezo avatar asset work. The goal is a repeatable pipeline for layered, tintable, isometric character sprites that can replace the current Pixi `Graphics` avatar while preserving the existing `AvatarAppearance` model.

Tilezo avatars are not single rendered characters. Treat them as ordered layers: body, face, hair, top, bottoms, shoes, and optional accessories. Every layer must share the same frame geometry so the client can compose appearances at runtime.

## Workflow

1. Read `docs/overview.md`, `docs/realtime-room-loop.md`, `packages/protocol/src/appearance.ts`, `apps/client/src/game/Avatar.ts`, and `apps/client/src/ui/CharacterEditor.ts`.
2. Read `references/avatar-asset-spec.md` before changing asset schemas, prompts, packing scripts, or renderer assumptions.
3. Keep scope inside the current room, presence, movement, chat, and persistence foundations. Leave explicit future-work notes for catalogue, inventory, economy, trading, or non-room systems.
4. Generate or source sprite art as layer rows, not full character composites.
5. Run deterministic validation before accepting asset packs:

```bash
python3 .codex/skills/tilezo-avatar-sprites/scripts/inspect_avatar_assets.py assets/avatars/avatar-manifest.json
```

6. Visually review contact sheets or in-game screenshots. Deterministic validation catches geometry and manifest problems, not style drift.

## Asset Rules

- Use transparent PNG or WebP for final game assets.
- Keep one manifest at `assets/avatars/avatar-manifest.json`.
- Keep all layers anchored to the same frame size, origin, and frame order.
- Prefer a first milestone with `idle` and `walk` states and these directions: `south`, `south-east`, `east`, `north-east`, `north`.
- Use horizontal mirroring only for layers that stay visually correct when flipped. Do not mirror asymmetric hair, logos, accessories, or lighting cues without explicit review.
- Keep color-customizable regions tint-friendly: flat base colors, limited shading, no baked gradients that fight Pixi tinting.
- Do not add gameplay systems while doing avatar asset work.

## Generation Guidance

Use the same discipline as a curated asset pipeline:

- Create a base identity sheet first.
- Generate grounded rows from the base identity and layout guides.
- Preserve silhouette, scale, outline weight, face placement, and palette across rows.
- Reject rows with visible guide marks, frame labels, backgrounds, shadows, detached effects, cropped limbs, or poses crossing into neighboring frames.
- For clothing and hair, generate isolated layers on transparent or clean chroma-key backgrounds. Avoid full-body composites unless they are only used as visual references.

If using image generation, delegate visual generation through the installed image generation skill when available. Use local scripts only for deterministic work: manifest validation, slicing, packing, contact sheets, and format conversion.

## Renderer Integration

When integrating assets in the client:

- Keep `AvatarAppearance` protocol-compatible unless a schema migration is intentionally part of the task.
- Replace the procedural body in `apps/client/src/game/Avatar.ts` with a small renderer that owns Pixi sprites by layer.
- Load textures through a manifest-aware module rather than hard-coding asset paths in `Avatar.ts`.
- Apply tints per layer for `skinTone`, `hairColor`, `shirtColor`, `pantsColor`, and `shoesColor`.
- Keep the username label behavior and tile movement behavior unchanged.
- Keep the character editor usable while art is incomplete. A CSS preview may remain temporarily, but the long-term target is a shared manifest-driven preview.

## Testing

Use Bun tooling and focused tests.

- Add unit tests for manifest parsing, layer ordering, appearance-to-layer resolution, and fallback behavior.
- Keep existing movement and room scene tests passing.
- Run `bun test` for focused changes, then `bun run test:coverage` before `bun run coverage:check` when validating coverage locally.
