# Art Design Principles

Tilezo should take inspiration from classic browser hotel pixel art without copying
Habbo's protected assets, mascots, badges, logos, furniture, UI icons, or named
visual systems. The target is a custom social room language with the same strengths:
instant readability, tactile room building, crisp pixels, and playful social presence.

## Sources

These principles are based on the local inspiration references:

- `inspiration/BadgeDesignGuide.pdf`
- `inspiration/btp_02.pdf`
- `inspiration/btp_05.pdf`
- `docs/overview.md`
- `docs/realtime-room-loop.md`

The interview references are useful because they describe the production mindset
behind the style: designers gather moodboards, sketch simple forms first, move into
low-color pixel versions, then add color, texture, shade, and technical slicing. They
also emphasize functional furniture, reusable building blocks, and the idea that every
pixel should have meaning.

## Core Direction

Tilezo's art should feel like a small physical world made from deliberate pixel
decisions. Rooms should be easy to scan at a glance, avatars should separate cleanly
from floors and furniture, and objects should feel useful even before deeper systems
exist.

The near-term art direction is:

- Crisp hand-authored pixel art.
- Near-isometric room geometry with no vanishing point.
- Dark separating outlines around major forms.
- Vibrant, readable color with controlled palettes.
- Simple lighting and shadow rules.
- Furniture and props that support room building, presence, movement, and chat.
- Original Tilezo motifs instead of Habbo-specific symbols.

## Pixel Craft

Author assets at native resolution. Do not paint large and shrink down. Do not
pixelize photos, scanned drawings, digital paintings, or vector art and call the result
pixel art.

Use nearest-neighbor scaling only when previewing or displaying pixel art at whole
number multiples. If an asset needs to be smaller, redraw it for that size.

Avoid effects that remove pixel-level control:

- Blur.
- Soft drop shadows.
- Smooth gradient tools.
- Automatic dithering.
- Anti-aliased scaling.
- Semi-random texture noise.
- Photographic material overlays.

Use deliberate pixel clusters instead. A highlight, bevel, scratch, seam, or shadow
should be placed because it improves form or recognition.

## Perspective

Tilezo rooms should use a stable near-isometric projection. The world should look
slightly tilted, with parallel edges staying parallel and no vanishing point.

Use this consistently for:

- Floor tiles.
- Wall planes.
- Furniture footprints.
- Object tops.
- Avatar placement.
- Clickable walk targets.

Do not mix perspective systems inside the same room. Front-facing UI, badges,
portraits, and icons can use their own flat pixel style, but room objects should obey
the room projection.

## Shape Language

Readable silhouettes matter more than surface detail. A player should be able to
recognize a chair, bed, plant, door, tile edge, chat bubble, or avatar direction before
they notice the decorative pixels.

Use compact, blocky forms with enough depth to feel physical:

- One strong outer silhouette.
- Clear top, front, and side planes.
- Small bevels to show thickness.
- High-contrast contact points where objects meet the floor.
- Fewer details on small assets.
- More detail only where the object size can support it.

Avoid cluttered miniatures. If an object only reads after zooming in, simplify it.

## Outlines

Use dark outlines to separate important objects from the room and from each other.
The outline can be black or a dark local hue, but it should read as a firm boundary.

Use full dark outlines for:

- Avatars.
- Furniture.
- Interactive props.
- Walls and major architectural edges.
- Collectible or status icons.

Use lighter internal lines where a full black line would make stacked furniture look
dirty or too segmented. Adjacent modular pieces should connect cleanly when the user
builds with them.

## Color

The palette should be bright and social, not realistic or muted. Colors can be
saturated, but the scene still needs hierarchy.

Use color to separate:

- Walkable floor from blocked objects.
- Foreground furniture from wall and floor planes.
- Avatar clothing from skin, hair, and room background.
- Interactive states from passive decoration.
- Chat and account UI from the canvas.

Keep each asset palette small. Prefer a base color, one shadow family, one highlight
family, and a few accent pixels. Avoid large smooth ramps.

## Light And Shadow

Use one implied light direction per room set. A practical default is light from the
upper left/front, with darker right and lower planes.

Recommended shading model:

- Top planes are lightest.
- Front planes are mid-value.
- Side planes are darker.
- Contact shadows are hard-edged and pixel-authored.
- Cast shadows stay simple and low-opacity, if used at all.

Do not use soft shadow filters. For small assets, one or two rows of darker pixels are
usually enough to attach the object to the floor.

## Texture

Texture should describe material without weakening readability.

Use sparse, intentional clusters for:

- Wood grain.
- Tile grout.
- Fabric folds.
- Metal highlights.
- Glass shine.
- Plant leaves.
- Water sparkle.

Do not fill large surfaces with noisy patterns. Repeating tiles should survive
side-by-side placement without obvious seams or distracting dark lines.

## Furniture And Props

Furniture should favor the room-builder fantasy. It should be useful as a component,
not just a decoration.

Prioritize assets that support the current product loop:

- Floors and walls.
- Doors, rugs, plants, lamps, tables, chairs, sofas, counters, and dividers.
- Spawn markers and room exits.
- Chat-friendly social props.
- Small animated ambience only when it does not distract from users.

Good furniture is:

- Easy to place on the grid.
- Clear about its footprint.
- Stackable or repeatable where the object type allows it.
- Distinct from avatars.
- Designed as part of a set, not as a one-off novelty.

## Avatars

Avatars need strong silhouettes, high contrast, and clean separation from floors and
furniture. The sprite should remain readable while walking, idling, and standing near
other users.

Avatar art should define:

- Directional poses that match the room projection.
- Distinct head, torso, legs, and feet.
- Clothing layers with restrained detail.
- Hair and skin palettes that stay readable on common room colors.
- Small expression changes only where the pixel budget supports them.

Avoid exact Habbo body proportions, faces, clothing cuts, animations, and avatar
parts. Tilezo should develop its own character proportions and fashion vocabulary.

## Rooms

Rooms are the main product surface. They should be dense enough to feel social, but
clear enough that the player can understand movement and occupancy immediately.

Room composition should support:

- A visible walkable floor grid.
- Obvious blocked areas.
- Clear avatar positions.
- Chat bubbles that do not fight with wall art or tall furniture.
- Strong room boundaries.
- Furniture sets that help users create zones.

Keep decoration subordinate to presence and movement. A beautiful room that hides
where users can walk is failing the game loop.

## UI And Badges

Interface art should share the pixel discipline but stay legally and visually distinct.
Do not reuse Habbo UI iconography, staff imagery, subscription icons, achievement
styles, logo forms, or old badge concepts.

For Tilezo badges and small icons:

- Keep the concept singular.
- Make the silhouette readable at final size.
- Use transparency for empty space.
- Use a dark outline when it improves recognition.
- Test on light and dark backgrounds.
- Prefer original symbols from Tilezo's own world.

Avoid cropped, multipart, over-detailed, too-dark, or unreadable badges.

## Originality Rules

Do not copy:

- Habbo logos, logo fonts, mascots, staff characters, bots, public-space names, badges,
  UI icons, catalogue icons, subscription marks, or event symbols.
- Old Habbo furniture silhouettes as direct templates.
- Pixel art from forums, fansites, other games, films, comics, bands, or shows.
- Screenshots as asset bases.

Acceptable inspiration:

- Pixel craft discipline.
- Near-isometric construction.
- Clear outlines and compact forms.
- Moodboard-driven visual research.
- The social-room design pattern.
- The idea of furniture as modular building blocks.

## Asset Production Workflow

Use this workflow for new Tilezo asset sets:

1. Define the gameplay role: walkable, blocked, seat, divider, ambience, avatar layer,
   status icon, or UI element.
2. Gather a moodboard for the theme and material language.
3. Sketch several silhouettes before drawing details.
4. Draw a flat-color pixel version at native size.
5. Check projection, footprint, and room readability.
6. Add controlled shading, texture, and accents.
7. Test on common floor and wall colors.
8. Test at the exact in-game scale.
9. Export without blur, smoothing, or automatic dithering.
10. Add metadata for grid footprint, anchor point, blocking behavior, and layer order.

## Review Checklist

Before an asset lands in the product, check:

- Is it original Tilezo art?
- Is every visible pixel intentional?
- Does it use the correct projection?
- Does it remain crisp at in-game scale?
- Does it avoid blur, soft shadows, smooth gradients, and automatic dithering?
- Does the silhouette read quickly?
- Does the outline separate it from nearby objects?
- Does the palette work on light and dark room contexts?
- Is the footprint obvious to a player?
- Does it support the current room, presence, movement, chat, or persistence scope?

If the answer is no, simplify, redraw, or defer the asset.
