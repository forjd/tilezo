# Avatar Sprite Pipeline Design

## Summary

Tilezo should replace procedural Pixi `Graphics` avatars with manifest-driven, layered sprites. The implementation should keep the current room loop unchanged while introducing a repeatable asset workflow inspired by the curated `hatch-pet` pipeline: grounded generation, deterministic packing, manifest validation, and visual QA.

## Scope

This pass covers avatar rendering foundations only:

- A repo-local Codex skill for repeatable avatar sprite work.
- A first manifest format under `assets/avatars/`.
- A client-side asset loader and layer resolver.
- Pixi sprite composition in `Avatar.ts`.
- Focused tests for manifest parsing and appearance mapping.

This pass does not add catalogue, inventory, unlocks, trading, economy, moderation, pets, bots, or quests.

## Architecture

The asset pipeline produces individual layer strips for body, hair, top, bottoms, shoes, face, and optional accessories. Every layer shares a common frame size, anchor, direction order, and animation-state indexing. The client reads `assets/avatars/avatar-manifest.json`, resolves the current `AvatarAppearance` into ordered layer textures, applies tints, and composes the final avatar at runtime.

The first renderer milestone can use simple generated PNG layers while preserving the manifest shape needed for final art. That lets implementation land before final art quality is perfect.

## Asset Format

The manifest lives at `assets/avatars/avatar-manifest.json`. Paths inside it are relative to `assets/avatars/`.

Required manifest concepts:

- `frame`: width, height, anchorX, anchorY.
- `states`: initially `idle` and `walk`.
- `directions`: initially `south`, `south-east`, `east`, `north-east`, `north`.
- `layers`: entries with slot, id, source image, optional tint key, and frame count.

Draw order is body, shoes, bottoms, top, face, hair, accessory.

## Data Flow

Existing protocol appearance fields remain the source of truth. `hair`, `shirt`, `pants`, and `shoes` select layer IDs. `skinTone`, `hairColor`, `shirtColor`, `pantsColor`, and `shoesColor` tint their matching layers.

Movement state should drive animation later, but the initial integration can choose idle frames for all states if only static art exists.

## Project Skill

Create `.codex/skills/tilezo-avatar-sprites` as the project skill. It should explain when to use the workflow, point agents to the relevant Tilezo files, define asset rules, and include a deterministic manifest inspection helper.

The skill is intentionally project-local so the workflow travels with the repository.

## Error Handling

The client should fail gracefully if sprite assets are unavailable during development. A missing or invalid manifest should fall back to the current procedural avatar or a minimal static sprite until the sprite assets are ready. Tests should verify that invalid appearance options resolve to defaults rather than crashing the room.

The validation script should fail fast for missing layer files, invalid dimensions, and malformed manifests.

## Testing

Use Bun tests for TypeScript behavior and the skill validation script for asset manifest checks.

Focused tests should cover:

- Manifest parsing.
- Required layer ordering.
- Appearance-to-layer resolution.
- Tint key mapping.
- Missing optional layer behavior.
- Fallback rendering when assets are unavailable.

Before broad validation, run `bun run test:coverage` and then `bun run coverage:check`, because the coverage check reads `coverage/lcov.info`.
