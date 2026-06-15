import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import type { Graphics } from "pixi.js";

// Stateless, pure pixel-art rendering for the avatar body sprite. Split out of Avatar.ts
// (which keeps movement, chat-bubble, and composition state) so each file has one job.

export type AvatarAnimationState = "idle" | "walk";

export type AvatarRenderDirection =
  | "south"
  | "south-east"
  | "east"
  | "north-east"
  | "north"
  | "north-west"
  | "west"
  | "south-west";

export type AvatarBodyDrawOptions = {
  appearance: AvatarAppearance;
  direction: AvatarRenderDirection;
  animationState: AvatarAnimationState;
  stepFrame: number;
};

export const AVATAR_OUTLINE = 0x1d2324;
export const AVATAR_FACE_LINE = 0x6a3a26;
export const AVATAR_DETAIL_LIGHT = 0xf1e7d2;
export const AVATAR_EYE_WHITE = 0xfafaf5;
export const AVATAR_EYE_PUPIL = 0x1f1a16;
export const AVATAR_BLUSH = 0xe7867f;
export const AVATAR_SHADING_STRENGTH = 0.78;
export const AVATAR_SHADING_ALPHA = 0.32;

export function drawAvatarBody(graphics: Graphics, options: AvatarBodyDrawOptions): void {
  const { appearance, direction, animationState, stepFrame } = options;
  const skinTone = toPixiColor(appearance.skinTone);
  const skinShadow = darken(skinTone, AVATAR_SHADING_STRENGTH);
  const skinHighlight = lighten(skinTone, 1.08);
  const hairColor = toPixiColor(appearance.hairColor);
  const hairHighlight = lighten(hairColor, 1.35);
  const shirtColor = toPixiColor(appearance.shirtColor);
  const shirtShadow = darken(shirtColor, AVATAR_SHADING_STRENGTH);
  const pantsColor = toPixiColor(appearance.pantsColor);
  const pantsShadow = darken(pantsColor, AVATAR_SHADING_STRENGTH);
  const shoesColor = toPixiColor(appearance.shoesColor);
  const stride = animationState === "walk" && stepFrame === 1 ? 2 : 0;
  const bob = animationState === "walk" && stepFrame === 1 ? -1 : 0;
  const facingScale = direction.includes("west") ? -1 : 1;
  const facingBack =
    direction === "north" || direction === "north-east" || direction === "north-west";

  graphics.scale.x = facingScale;
  drawShadow(graphics);
  drawBottoms(graphics, appearance, pantsColor, pantsShadow, shoesColor, bob, stride);
  drawTorso(graphics, shirtColor, shirtShadow, bob);
  drawArms(graphics, appearance, skinTone, skinShadow, shirtColor, shirtShadow, bob);
  drawTopDetail(graphics, appearance, shirtColor, shirtShadow, bob, facingBack);
  drawNeck(graphics, skinTone, skinShadow, bob);
  drawHead(graphics, skinTone, skinShadow, skinHighlight, bob);
  drawHair(graphics, appearance, hairColor, hairHighlight, skinTone, bob, facingBack);
  drawFace(graphics, direction, bob, facingBack);
}

function drawShadow(graphics: Graphics): void {
  graphics.ellipse(0, 5, 14, 4).fill({ color: AVATAR_OUTLINE, alpha: 0.12 });
  graphics.ellipse(0, 4, 11, 3.2).fill({ color: AVATAR_OUTLINE, alpha: 0.18 });
  graphics.ellipse(0, 3, 8, 2.4).fill({ color: AVATAR_OUTLINE, alpha: 0.24 });
}

function drawBottoms(
  graphics: Graphics,
  appearance: AvatarAppearance,
  pantsColor: number,
  pantsShadow: number,
  shoesColor: number,
  bob: number,
  stride: number,
): void {
  if (appearance.pants === "skirt") {
    graphics.roundRect(-9, -11 + bob, 18, 9, 3).fill(pantsColor);
    graphics
      .roundRect(-9, -11 + bob, 18, 9, 3)
      .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
    graphics.rect(5, -10 + bob, 3, 7).fill({ color: pantsShadow, alpha: AVATAR_SHADING_ALPHA });
    graphics.roundRect(-5, -4 + bob - stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    graphics.roundRect(2, -4 + bob + stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    drawShoes(graphics, appearance, shoesColor, stride, 5);
    return;
  }

  if (appearance.pants === "pleated-skirt") {
    graphics.roundRect(-10, -12 + bob, 20, 10, 2).fill(pantsColor);
    graphics
      .roundRect(-10, -12 + bob, 20, 10, 2)
      .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
    for (const x of [-6, -2, 2, 6]) {
      graphics.rect(x, -11 + bob, 1, 8).fill({ color: pantsShadow, alpha: 0.45 });
    }
    graphics.roundRect(-5, -4 + bob - stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    graphics.roundRect(2, -4 + bob + stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    drawShoes(graphics, appearance, shoesColor, stride, 5);
    return;
  }

  if (appearance.pants === "shorts") {
    graphics.roundRect(-8, -11 + bob - stride, 7, 8, 2).fill(pantsColor);
    graphics.roundRect(1, -11 + bob + stride, 7, 8, 2).fill(pantsColor);
    graphics
      .roundRect(-8, -11 + bob - stride, 7, 8, 2)
      .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
    graphics
      .roundRect(1, -11 + bob + stride, 7, 8, 2)
      .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
    graphics.roundRect(-6, -4 + bob - stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    graphics.roundRect(2, -4 + bob + stride, 5, 6, 2).fill(darken(pantsColor, 0.82));
    drawShoes(graphics, appearance, shoesColor, stride, 4);
    return;
  }

  const legWidth =
    appearance.pants === "wide" || appearance.pants === "cargo"
      ? 7
      : appearance.pants === "tapered" || appearance.pants === "leggings"
        ? 4
        : 5;
  const leftX = appearance.pants === "wide" || appearance.pants === "cargo" ? -7 : -5;
  const rightX = appearance.pants === "wide" || appearance.pants === "cargo" ? 1 : 2;
  const legRadius = appearance.pants === "leggings" ? 3 : 2;

  graphics.roundRect(leftX, -11 + bob - stride, legWidth, 13, legRadius).fill(pantsColor);
  graphics.roundRect(rightX, -11 + bob + stride, legWidth, 13, legRadius).fill(pantsColor);
  graphics
    .roundRect(leftX, -11 + bob - stride, legWidth, 13, legRadius)
    .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics
    .roundRect(rightX, -11 + bob + stride, legWidth, 13, legRadius)
    .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics
    .rect(leftX + legWidth - 2, -10 + bob - stride, 1, 11)
    .fill({ color: pantsShadow, alpha: AVATAR_SHADING_ALPHA });
  graphics
    .rect(rightX + legWidth - 2, -10 + bob + stride, 1, 11)
    .fill({ color: pantsShadow, alpha: AVATAR_SHADING_ALPHA });

  if (appearance.pants === "cargo") {
    graphics.rect(leftX + 1, -7 + bob - stride, 4, 3).fill({ color: pantsShadow, alpha: 0.55 });
    graphics.rect(rightX + 1, -7 + bob + stride, 4, 3).fill({ color: pantsShadow, alpha: 0.55 });
  } else if (appearance.pants === "joggers") {
    graphics.rect(leftX, 0 + bob - stride, legWidth, 2).fill(darken(pantsColor, 0.72));
    graphics.rect(rightX, 0 + bob + stride, legWidth, 2).fill(darken(pantsColor, 0.72));
  } else if (appearance.pants === "cuffed") {
    // Rolled cuff: a dark fold with a lighter highlight band above it, distinct from the
    // single flat elastic band that joggers use.
    graphics.rect(leftX, 0 + bob - stride, legWidth, 2).fill(darken(pantsColor, 0.72));
    graphics.rect(rightX, 0 + bob + stride, legWidth, 2).fill(darken(pantsColor, 0.72));
    graphics.rect(leftX, -2 + bob - stride, legWidth, 1).fill(lighten(pantsColor, 1.12));
    graphics.rect(rightX, -2 + bob + stride, legWidth, 1).fill(lighten(pantsColor, 1.12));
  } else if (appearance.pants === "leggings") {
    graphics.rect(leftX + 1, -10 + bob - stride, 1, 11).fill({ color: pantsShadow, alpha: 0.25 });
    graphics.rect(rightX + 1, -10 + bob + stride, 1, 11).fill({
      color: pantsShadow,
      alpha: 0.25,
    });
  }

  drawShoes(
    graphics,
    appearance,
    shoesColor,
    stride,
    appearance.shoes === "high-tops" || appearance.shoes === "work-boots" ? 5 : 4,
  );
}

function drawArms(
  graphics: Graphics,
  appearance: AvatarAppearance,
  skinTone: number,
  skinShadow: number,
  shirtColor: number,
  shirtShadow: number,
  bob: number,
): void {
  const isLongSleeve = ["hoodie", "jacket", "sweater", "blazer", "overshirt", "workwear"].includes(
    appearance.shirt,
  );
  const isSleeveless = appearance.shirt === "tank" || appearance.shirt === "vest";
  const armColor = isLongSleeve ? shirtColor : skinTone;
  const armTop = -27 + bob;
  const armHeight = 14;
  const armBottom = armTop + armHeight;

  // Arm fills (rounded for soft silhouette)
  graphics.roundRect(-11, armTop, 4, armHeight, 1.5).fill(armColor);
  graphics.roundRect(7, armTop, 4, armHeight, 1.5).fill(armColor);

  // Short sleeve cap (only when shirt is short-sleeved)
  if (!isLongSleeve && !isSleeveless) {
    graphics.rect(-11, armTop, 4, 4).fill(shirtColor);
    graphics.rect(7, armTop, 4, 4).fill(shirtColor);
    graphics.rect(-11, armTop + 3, 4, 1).fill({ color: shirtShadow, alpha: 0.6 });
    graphics.rect(7, armTop + 3, 4, 1).fill({ color: shirtShadow, alpha: 0.6 });
  } else if (isSleeveless) {
    graphics.rect(-10, armTop, 2, 3).fill(shirtColor);
    graphics.rect(8, armTop, 2, 3).fill(shirtColor);
  }

  // Outer-edge shading
  graphics
    .rect(-10, armTop + 1, 1, armHeight - 2)
    .fill({ color: isLongSleeve ? shirtShadow : skinShadow, alpha: 0.22 });
  graphics
    .rect(9, armTop + 1, 1, armHeight - 2)
    .fill({ color: isLongSleeve ? shirtShadow : skinShadow, alpha: 0.22 });

  // Outlines: outer edge + top + bottom only (no inner edge — torso outline is the divider)
  graphics.rect(-11, armTop, 1, armHeight).fill(AVATAR_OUTLINE);
  graphics.rect(-11, armTop, 4, 1).fill(AVATAR_OUTLINE);
  graphics.rect(-11, armBottom - 1, 4, 1).fill(AVATAR_OUTLINE);
  graphics.rect(10, armTop, 1, armHeight).fill(AVATAR_OUTLINE);
  graphics.rect(7, armTop, 4, 1).fill(AVATAR_OUTLINE);
  graphics.rect(7, armBottom - 1, 4, 1).fill(AVATAR_OUTLINE);
}

function drawShoes(
  graphics: Graphics,
  appearance: AvatarAppearance,
  color: number,
  stride: number,
  height: number,
): void {
  const shoeWidth =
    appearance.shoes === "flats" || appearance.shoes === "sandals" || appearance.shoes === "loafers"
      ? 7
      : appearance.shoes === "platforms"
        ? 9
        : 8;
  const leftY = -1 - stride - (height - 4);
  const rightY = -1 + stride - (height - 4);
  const shoeShadow = darken(color, 0.7);
  const soleColor =
    appearance.shoes === "sneakers" ||
    appearance.shoes === "high-tops" ||
    appearance.shoes === "runners"
      ? AVATAR_DETAIL_LIGHT
      : shoeShadow;

  graphics.roundRect(-8, leftY, shoeWidth, height, 2).fill(color);
  graphics.roundRect(1, rightY, shoeWidth, height, 2).fill(color);
  graphics
    .roundRect(-8, leftY, shoeWidth, height, 2)
    .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics
    .roundRect(1, rightY, shoeWidth, height, 2)
    .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics.rect(-8, leftY + height - 1, shoeWidth, 1).fill(soleColor);
  graphics.rect(1, rightY + height - 1, shoeWidth, 1).fill(soleColor);

  if (appearance.shoes === "sneakers" || appearance.shoes === "high-tops") {
    graphics.rect(-6, leftY + height - 2, 4, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(3, rightY + height - 2, 4, 1).fill(AVATAR_DETAIL_LIGHT);
  } else if (appearance.shoes === "runners") {
    graphics.rect(-7, leftY + 1, 3, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(2, rightY + 1, 3, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(-3, leftY + 2, 3, 1).fill(darken(color, 0.55));
    graphics.rect(6, rightY + 2, 3, 1).fill(darken(color, 0.55));
  } else if (appearance.shoes === "loafers") {
    graphics.rect(-6, leftY + 1, 4, 1).fill(darken(color, 0.55));
    graphics.rect(3, rightY + 1, 4, 1).fill(darken(color, 0.55));
  } else if (appearance.shoes === "sandals") {
    graphics.rect(-7, leftY + 1, 5, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(2, rightY + 1, 5, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(-5, leftY, 1, height).fill(darken(color, 0.55));
    graphics.rect(4, rightY, 1, height).fill(darken(color, 0.55));
  } else if (appearance.shoes === "platforms") {
    graphics.rect(-8, leftY + height, shoeWidth, 2).fill(shoeShadow);
    graphics.rect(1, rightY + height, shoeWidth, 2).fill(shoeShadow);
  } else if (appearance.shoes === "slip-ons") {
    graphics.rect(-6, leftY, 5, 1).fill(darken(color, 0.55));
    graphics.rect(3, rightY, 5, 1).fill(darken(color, 0.55));
  } else if (appearance.shoes === "work-boots") {
    graphics.rect(-7, leftY + 1, 5, 1).fill(darken(color, 0.55));
    graphics.rect(2, rightY + 1, 5, 1).fill(darken(color, 0.55));
    graphics.rect(-4, leftY + 2, 2, 1).fill(AVATAR_DETAIL_LIGHT);
    graphics.rect(5, rightY + 2, 2, 1).fill(AVATAR_DETAIL_LIGHT);
  }
}

function drawTorso(graphics: Graphics, shirtColor: number, shirtShadow: number, bob: number): void {
  graphics.roundRect(-9, -28 + bob, 18, 19, 4).fill(shirtColor);
  graphics
    .roundRect(-9, -28 + bob, 18, 19, 4)
    .stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics.rect(5, -26 + bob, 3, 15).fill({ color: shirtShadow, alpha: AVATAR_SHADING_ALPHA });
}

function drawTopDetail(
  graphics: Graphics,
  appearance: AvatarAppearance,
  color: number,
  shadow: number,
  bob: number,
  facingBack: boolean,
): void {
  if (appearance.shirt === "hoodie") {
    graphics
      .roundRect(-8, -32 + bob, 16, 6, 3)
      .fill(darken(color, 0.74))
      .stroke({ color: AVATAR_OUTLINE, width: 1 });

    if (!facingBack) {
      graphics.rect(-2, -27 + bob, 1, 11).fill(AVATAR_DETAIL_LIGHT);
      graphics.rect(1, -27 + bob, 1, 11).fill(AVATAR_DETAIL_LIGHT);
      graphics.roundRect(-5, -18 + bob, 10, 5, 2).fill({ color: shadow, alpha: 0.55 });
    }
    return;
  }

  if (appearance.shirt === "jacket") {
    graphics.rect(-9, -29 + bob, 4, 20).fill(darken(color, 0.72));
    graphics.rect(5, -29 + bob, 4, 20).fill(darken(color, 0.72));

    if (!facingBack) {
      graphics.rect(-2, -28 + bob, 4, 18).fill(AVATAR_DETAIL_LIGHT);
      graphics.rect(-4, -29 + bob, 2, 2).fill(darken(color, 0.6));
      graphics.rect(2, -29 + bob, 2, 2).fill(darken(color, 0.6));
    }
    return;
  }

  if (appearance.shirt === "striped") {
    graphics.rect(-9, -24 + bob, 18, 3).fill(darken(color, 0.74));
    graphics.rect(-9, -17 + bob, 18, 3).fill(darken(color, 0.74));
    return;
  }

  if (appearance.shirt === "tee") {
    graphics.rect(-8, -28 + bob, 16, 3).fill(darken(color, 0.72));
    graphics.rect(-4, -20 + bob, 8, 1).fill({ color: shadow, alpha: 0.45 });
    return;
  }

  if (appearance.shirt === "tank") {
    graphics.rect(-8, -28 + bob, 3, 10).fill(darken(color, 0.78));
    graphics.rect(5, -28 + bob, 3, 10).fill(darken(color, 0.78));
    graphics.roundRect(-4, -30 + bob, 8, 3, 2).fill(darken(color, 0.7));
    return;
  }

  if (appearance.shirt === "sweater") {
    graphics.roundRect(-8, -30 + bob, 16, 5, 2).fill(darken(color, 0.76));
    graphics.rect(-8, -21 + bob, 16, 2).fill(darken(color, 0.7));
    graphics.rect(-5, -25 + bob, 10, 1).fill({ color: shadow, alpha: 0.5 });
    return;
  }

  if (appearance.shirt === "vest") {
    graphics.rect(-9, -28 + bob, 5, 19).fill(darken(color, 0.68));
    graphics.rect(4, -28 + bob, 5, 19).fill(darken(color, 0.68));
    if (!facingBack) {
      graphics.rect(-2, -27 + bob, 4, 18).fill(AVATAR_DETAIL_LIGHT);
    }
    return;
  }

  if (appearance.shirt === "blazer") {
    graphics.rect(-9, -29 + bob, 5, 20).fill(darken(color, 0.66));
    graphics.rect(4, -29 + bob, 5, 20).fill(darken(color, 0.66));
    if (!facingBack) {
      graphics.rect(-2, -28 + bob, 4, 18).fill(AVATAR_DETAIL_LIGHT);
      graphics.rect(-1, -20 + bob, 2, 2).fill(darken(color, 0.45));
      graphics.rect(-6, -25 + bob, 3, 1).fill({ color: shadow, alpha: 0.6 });
    }
    return;
  }

  if (appearance.shirt === "overshirt") {
    graphics.rect(-9, -28 + bob, 5, 19).fill(darken(color, 0.7));
    graphics.rect(4, -28 + bob, 5, 19).fill(darken(color, 0.7));
    graphics.rect(-8, -21 + bob, 16, 2).fill({ color: shadow, alpha: 0.5 });
    if (!facingBack) {
      graphics.rect(-1, -28 + bob, 2, 18).fill(AVATAR_DETAIL_LIGHT);
    }
    return;
  }

  if (appearance.shirt === "polo") {
    graphics.roundRect(-5, -30 + bob, 10, 4, 2).fill(darken(color, 0.68));
    if (!facingBack) {
      graphics.rect(-1, -28 + bob, 2, 5).fill(AVATAR_DETAIL_LIGHT);
      graphics.rect(-4, -28 + bob, 3, 2).fill(darken(color, 0.58));
      graphics.rect(1, -28 + bob, 3, 2).fill(darken(color, 0.58));
    }
    return;
  }

  if (appearance.shirt === "workwear") {
    graphics.rect(-9, -21 + bob, 18, 2).fill(darken(color, 0.62));
    graphics.rect(-5, -27 + bob, 3, 8).fill(darken(color, 0.68));
    graphics.rect(2, -27 + bob, 3, 8).fill(darken(color, 0.68));
    graphics.rect(-6, -17 + bob, 4, 3).fill({ color: shadow, alpha: 0.6 });
    graphics.rect(2, -17 + bob, 4, 3).fill({ color: shadow, alpha: 0.6 });
    return;
  }

  graphics.roundRect(-5, -30 + bob, 10, 3, 2).fill(darken(color, 0.7));

  if (!facingBack) {
    graphics.rect(-3, -28 + bob, 6, 1).fill({ color: shadow, alpha: 0.6 });
  }
}

function drawNeck(graphics: Graphics, skinTone: number, skinShadow: number, bob: number): void {
  graphics.rect(-3, -30 + bob, 6, 3).fill(skinTone);
  graphics.rect(-3, -28 + bob, 6, 1).fill({ color: skinShadow, alpha: 0.55 });
}

function drawHead(
  graphics: Graphics,
  skinTone: number,
  skinShadow: number,
  skinHighlight: number,
  bob: number,
): void {
  graphics.circle(0, -38 + bob, 11).fill(skinTone);
  graphics.circle(0, -38 + bob, 11).stroke({ color: AVATAR_OUTLINE, width: 1, alignment: 0 });
  graphics.circle(3, -36 + bob, 7).fill({ color: skinShadow, alpha: AVATAR_SHADING_ALPHA });
  graphics.ellipse(-4, -42 + bob, 3, 2).fill({ color: skinHighlight, alpha: 0.35 });
}

function drawFace(
  graphics: Graphics,
  direction: AvatarRenderDirection,
  bob: number,
  facingBack: boolean,
): void {
  if (facingBack) {
    return;
  }

  const facingSide = direction === "east" || direction === "west";
  const leftEyeX = facingSide ? -3 : -4;
  const rightEyeX = facingSide ? 5 : 4;
  const eyeY = -36 + bob;

  // Eye whites
  graphics.rect(leftEyeX - 1, eyeY - 1, 3, 3).fill(AVATAR_EYE_WHITE);
  graphics.rect(rightEyeX - 1, eyeY - 1, 3, 3).fill(AVATAR_EYE_WHITE);

  // Pupils
  graphics.rect(leftEyeX, eyeY, 2, 2).fill(AVATAR_EYE_PUPIL);
  graphics.rect(rightEyeX, eyeY, 2, 2).fill(AVATAR_EYE_PUPIL);

  // Catchlight
  graphics.rect(leftEyeX, eyeY, 1, 1).fill(AVATAR_EYE_WHITE);
  graphics.rect(rightEyeX, eyeY, 1, 1).fill(AVATAR_EYE_WHITE);

  // Cheek blush (subtle)
  graphics.ellipse(leftEyeX - 2, eyeY + 4, 2, 1).fill({ color: AVATAR_BLUSH, alpha: 0.35 });
  graphics.ellipse(rightEyeX + 2, eyeY + 4, 2, 1).fill({ color: AVATAR_BLUSH, alpha: 0.35 });

  // Mouth (small flat line, slight smile)
  const mouthY = -31 + bob;
  graphics.rect(-2, mouthY, 4, 1).fill(AVATAR_FACE_LINE);
}

function drawHair(
  graphics: Graphics,
  appearance: AvatarAppearance,
  color: number,
  highlight: number,
  skinTone: number,
  bob: number,
  facingBack: boolean,
): void {
  const headCenterY = -38 + bob;
  const headRadius = 11;

  // Buzz: short stubble. Cover the top half of the head with a darker hair tone.
  if (appearance.hair === "buzz") {
    graphics.circle(0, headCenterY, headRadius).fill(darken(color, 0.55));
    // Carve out the face area (lower 2/3 of head) by redrawing as skin
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    // Skin shadow on right side of face — preserve drawHead's shading
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    // Tiny highlight on the buzz crown
    graphics.rect(-3, headCenterY - 9, 5, 1).fill({ color: highlight, alpha: 0.5 });
    return;
  }

  // For other styles: fill the entire head circle with hair colour,
  // then carve out the face with a skin-coloured oval (and style-specific bangs).
  graphics.circle(0, headCenterY, headRadius).fill(color);

  if (appearance.hair === "short") {
    drawShortHair(graphics, color, highlight, skinTone, headCenterY, headRadius, facingBack);
    return;
  }

  if (appearance.hair === "side-part") {
    // Face oval — slightly higher so the side-part shape sits over the forehead
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

    if (!facingBack) {
      // Sweep across the forehead, longer on the right
      graphics.rect(-9, headCenterY - 4, 5, 2).fill(color);
      graphics.rect(-4, headCenterY - 4, 12, 3).fill(color);
      // The part — a single skin-coloured pixel column
      graphics.rect(-4, headCenterY - 4, 1, 2).fill(skinTone);
      // Temple wisps
      graphics.rect(-10, headCenterY - 3, 1, 5).fill(color);
      graphics.rect(9, headCenterY - 3, 1, 4).fill(color);
    }

    graphics.rect(0, headCenterY - 9, 6, 1).fill({ color: highlight, alpha: 0.55 });
    return;
  }

  if (appearance.hair === "bob") {
    // Smaller face oval — bob hair extends further down on the sides
    graphics.ellipse(0, headCenterY + 5, headRadius - 2, 5).fill(skinTone);
    graphics
      .circle(3, headCenterY + 3, 6)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

    // Side flaps that hug the jawline (curved, not boxy)
    graphics.ellipse(-9, headCenterY + 2, 2, 5).fill(color);
    graphics.ellipse(9, headCenterY + 2, 2, 5).fill(color);

    if (!facingBack) {
      // Centre fringe across the forehead
      graphics.rect(-7, headCenterY - 4, 14, 3).fill(color);
    }

    graphics.rect(-3, headCenterY - 9, 6, 1).fill({ color: highlight, alpha: 0.5 });
    return;
  }

  if (appearance.hair === "curls") {
    // Face oval first to constrain the hair
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

    // Curly clumps along the top — small overlapping circles
    const curls: ReadonlyArray<readonly [number, number, number]> = [
      [-7, headCenterY - 5, 3],
      [-3, headCenterY - 7, 3],
      [2, headCenterY - 7, 3],
      [7, headCenterY - 5, 3],
      [0, headCenterY - 4, 3],
    ];
    for (const [x, y, r] of curls) {
      graphics.circle(x, y, r).fill(color);
    }
    if (!facingBack) {
      // Small curl tendril on the forehead
      graphics.circle(-2, headCenterY - 3, 2).fill(color);
    }
    graphics.circle(-3, headCenterY - 8, 1).fill({ color: highlight, alpha: 0.7 });
    graphics.circle(3, headCenterY - 8, 1).fill({ color: highlight, alpha: 0.7 });
    return;
  }

  if (appearance.hair === "afro") {
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

    for (const [x, y, r] of [
      [-9, headCenterY - 4, 5],
      [-5, headCenterY - 9, 5],
      [0, headCenterY - 11, 5],
      [5, headCenterY - 9, 5],
      [9, headCenterY - 4, 5],
      [0, headCenterY - 5, 6],
    ] as const) {
      graphics.circle(x, y, r).fill(color);
    }
    graphics.circle(-4, headCenterY - 11, 1).fill({ color: highlight, alpha: 0.7 });
    graphics.circle(4, headCenterY - 10, 1).fill({ color: highlight, alpha: 0.7 });
    return;
  }

  if (appearance.hair === "ponytail") {
    graphics.ellipse(11, headCenterY - 1, 4, 8).fill(color);
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

    if (!facingBack) {
      graphics.rect(-6, headCenterY - 4, 10, 2).fill(color);
      graphics.rect(3, headCenterY - 3, 6, 3).fill(color);
    }
    graphics.rect(2, headCenterY - 9, 5, 1).fill({ color: highlight, alpha: 0.55 });
    return;
  }

  if (appearance.hair === "braids") {
    graphics.ellipse(0, headCenterY + 4, headRadius - 2, 6).fill(skinTone);
    graphics
      .circle(3, headCenterY + 3, 6)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    graphics.roundRect(-11, headCenterY - 1, 3, 14, 2).fill(color);
    graphics.roundRect(8, headCenterY - 1, 3, 14, 2).fill(color);
    for (const y of [headCenterY + 2, headCenterY + 6, headCenterY + 10]) {
      graphics.rect(-11, y, 3, 1).fill({ color: highlight, alpha: 0.55 });
      graphics.rect(8, y, 3, 1).fill({ color: highlight, alpha: 0.55 });
    }
    if (!facingBack) {
      graphics.rect(-7, headCenterY - 5, 14, 3).fill(color);
    }
    return;
  }

  if (appearance.hair === "undercut") {
    graphics.circle(0, headCenterY, headRadius).fill(darken(color, 0.55));
    graphics.roundRect(-8, headCenterY - 10, 15, 7, 3).fill(color);
    graphics.rect(-2, headCenterY - 9, 8, 2).fill({ color: highlight, alpha: 0.5 });
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    return;
  }

  if (appearance.hair === "waves") {
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    for (const [x, y, width] of [
      [-8, headCenterY - 5, 5],
      [-2, headCenterY - 7, 6],
      [5, headCenterY - 5, 5],
    ] as const) {
      graphics.rect(x, y, width, 2).fill(color);
      graphics.rect(x + 1, y - 1, width - 2, 1).fill({ color: highlight, alpha: 0.55 });
    }
    graphics.rect(-10, headCenterY - 3, 1, 4).fill(color);
    graphics.rect(9, headCenterY - 3, 1, 4).fill(color);
    return;
  }

  if (appearance.hair === "bun") {
    graphics.circle(0, headCenterY - 12, 5).fill(color);
    graphics.circle(0, headCenterY - 12, 5).stroke({
      color: AVATAR_OUTLINE,
      width: 1,
      alignment: 0,
    });
    graphics.ellipse(0, headCenterY + 4, headRadius - 1, 6).fill(skinTone);
    graphics
      .circle(3, headCenterY + 3, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    if (!facingBack) {
      graphics.rect(-7, headCenterY - 4, 14, 2).fill(color);
      graphics.rect(-9, headCenterY - 2, 1, 5).fill(color);
      graphics.rect(8, headCenterY - 2, 1, 5).fill(color);
    }
    graphics.rect(-3, headCenterY - 15, 5, 1).fill({ color: highlight, alpha: 0.55 });
    return;
  }

  if (appearance.hair === "pixie") {
    graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
    graphics
      .circle(3, headCenterY + 2, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    if (!facingBack) {
      graphics.rect(-9, headCenterY - 6, 7, 4).fill(color);
      graphics.rect(-2, headCenterY - 8, 6, 3).fill(color);
      graphics.rect(4, headCenterY - 6, 6, 4).fill(color);
      graphics.rect(-10, headCenterY - 2, 1, 3).fill(color);
    }
    graphics.rect(-2, headCenterY - 10, 6, 1).fill({ color: highlight, alpha: 0.55 });
    return;
  }

  if (appearance.hair === "mohawk") {
    graphics.circle(0, headCenterY, headRadius).fill(darken(color, 0.55));
    graphics.roundRect(-3, headCenterY - 13, 6, 14, 2).fill(color);
    graphics.rect(-1, headCenterY - 14, 2, 2).fill({ color: highlight, alpha: 0.65 });
    graphics.ellipse(0, headCenterY + 4, headRadius - 1, 6).fill(skinTone);
    graphics
      .circle(3, headCenterY + 3, 7)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    return;
  }

  if (appearance.hair === "locs") {
    graphics.ellipse(0, headCenterY + 4, headRadius - 2, 6).fill(skinTone);
    graphics
      .circle(3, headCenterY + 3, 6)
      .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });
    for (const [x, length] of [
      [-10, 11],
      [-6, 14],
      [5, 13],
      [9, 10],
    ] as const) {
      graphics.roundRect(x, headCenterY - 3, 3, length, 2).fill(color);
      graphics.rect(x + 1, headCenterY + 2, 1, 2).fill({ color: highlight, alpha: 0.55 });
    }
    if (!facingBack) {
      graphics.rect(-7, headCenterY - 5, 14, 3).fill(color);
    }
    return;
  }

  // Fallback for any unknown/legacy hair value (e.g. a retired enum value still held by a
  // persisted row): render the neutral "short" silhouette so the face is never hidden behind a
  // solid hair-coloured head. Mirrors the chat-bubble face fallback in Avatar.ts.
  drawShortHair(graphics, color, highlight, skinTone, headCenterY, headRadius, facingBack);
}

function drawShortHair(
  graphics: Graphics,
  color: number,
  highlight: number,
  skinTone: number,
  headCenterY: number,
  headRadius: number,
  facingBack: boolean,
): void {
  // Face oval shows below the hair line
  graphics.ellipse(0, headCenterY + 3, headRadius - 1, 7).fill(skinTone);
  graphics
    .circle(3, headCenterY + 2, 7)
    .fill({ color: darken(skinTone, AVATAR_SHADING_STRENGTH), alpha: AVATAR_SHADING_ALPHA });

  if (!facingBack) {
    // Small fringe over the forehead
    graphics.rect(-5, headCenterY - 4, 10, 2).fill(color);
    // Subtle side hair just below the temples
    graphics.rect(-10, headCenterY - 3, 1, 4).fill(color);
    graphics.rect(9, headCenterY - 3, 1, 4).fill(color);
  }

  graphics.rect(-3, headCenterY - 9, 6, 1).fill({ color: highlight, alpha: 0.55 });
}

export function toPixiColor(value: string): number {
  if (!/^#[\da-fA-F]{6}$/.test(value)) {
    return 0xffffff;
  }

  return Number.parseInt(value.slice(1), 16);
}

export function darken(color: number, amount: number): number {
  const red = Math.round(((color >> 16) & 0xff) * amount);
  const green = Math.round(((color >> 8) & 0xff) * amount);
  const blue = Math.round((color & 0xff) * amount);

  return (red << 16) + (green << 8) + blue;
}

export function lighten(color: number, amount: number): number {
  const red = Math.min(255, Math.round(((color >> 16) & 0xff) * amount));
  const green = Math.min(255, Math.round(((color >> 8) & 0xff) * amount));
  const blue = Math.min(255, Math.round((color & 0xff) * amount));

  return (red << 16) + (green << 8) + blue;
}
