# Tilezo Avatar Asset Spec

## Manifest Shape

The first supported manifest should be simple enough for tests and hand-authored starter assets:

```json
{
  "frame": {
    "width": 64,
    "height": 96,
    "anchorX": 32,
    "anchorY": 84
  },
  "states": ["idle", "walk"],
  "directions": ["south", "south-east", "east", "north-east", "north"],
  "layers": [
    {
      "slot": "body",
      "id": "base",
      "tint": "skinTone",
      "src": "layers/body/base.png",
      "frames": 10
    }
  ]
}
```

Paths are relative to `assets/avatars/`. Every layer image must use the same frame width and height. A layer with `frames: 10` must be exactly `frame.width * 10` pixels wide and `frame.height` pixels tall.

## Slots

Use this draw order:

1. `body`
2. `shoes`
3. `bottoms`
4. `top`
5. `face`
6. `hair`
7. `accessory`

The renderer should ignore unknown optional slots only when the manifest marks them optional. Product code should fail fast for missing required base layers.

## Appearance Mapping

Map the current protocol fields directly:

- `skinTone` tints `body`
- `hair` chooses a `hair` layer and `hairColor` tints it
- `shirt` chooses a `top` layer and `shirtColor` tints it
- `pants` chooses a `bottoms` layer and `pantsColor` tints it
- `shoes` chooses a `shoes` layer and `shoesColor` tints it

Do not add inventory ownership, unlock state, pricing, rarity, or catalogue metadata to the first manifest.

## Animation Rows

For the first pass, use one horizontal strip per layer. Keep animation state and direction indexing in data so the renderer can choose frames without filename parsing.

Recommended first-pass frame counts:

- `idle`: 1 frame per direction
- `walk`: 4 frames per direction

With five directions, that yields 25 frames per complete layer strip. If this is too much for initial art, support a static fallback layer with one frame and let the renderer reuse it for all states and directions.

## Visual Quality Bar

Avatar assets are not acceptable just because the manifest validates. The default composed avatar must pass a visual review at native resolution and at the in-game preview scale.

Minimum target for the first high-quality avatar pack:

- The south-east idle frame is the hero pose and must read as a compact social-room avatar, not a front-facing icon or a procedural doll.
- The figure should occupy roughly the middle of the 64x96 frame, with the floor anchor staying near `anchorX`/`anchorY`.
- Head, neck, torso, arms, legs, and shoes must remain distinguishable after tinting.
- Outer outlines should be crisp and dark, with softer internal lines only where needed.
- Each tintable layer should contain a limited shade ramp that survives runtime tinting.
- Faces should use very few pixels and avoid oversized noses, smeared mouths, or drifting eyes.
- Walk frames should move feet and arms without changing the character's identity, head size, or standing height.
- Direction changes should rotate one character consistently; they should not look like separate drawings.

The deterministic generator is allowed for scaffolding and regression fixtures. It should not be treated as the production art source unless its contact sheet meets the same bar as authored pixel art.

## QA Checklist

Before accepting a generated layer pack:

- All required files exist.
- All layer images match declared dimensions.
- Transparent backgrounds are clean.
- The body anchor sits consistently on the same floor point.
- Walk frames do not change body height or head position unexpectedly.
- Layers align when composed with the default appearance.
- East-facing layers still read correctly if used for west-facing mirror fallback.
- The in-room avatar remains readable at gameplay zoom.
- A contact sheet has been rendered with `render_avatar_contact_sheet.py` and visually reviewed.
- A browser or game screenshot has been reviewed with the default appearance.
