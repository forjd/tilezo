import { describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import type { Graphics } from "pixi.js";
import { type AvatarBodyDrawOptions, drawAvatarBody, toPixiColor } from "./avatarBody";

type AvatarVariant = Partial<AvatarAppearance> & {
  animationState?: AvatarBodyDrawOptions["animationState"];
  direction?: AvatarBodyDrawOptions["direction"];
  stepFrame?: number;
};

describe("drawAvatarBody", () => {
  test("draws every catalog style branch", () => {
    const variants: AvatarVariant[] = [
      { direction: "north" },
      {
        animationState: "walk",
        hair: "buzz",
        pants: "skirt",
        shirt: "hoodie",
        shoes: "sneakers",
        stepFrame: 1,
      },
      { hair: "curls", pants: "pleated-skirt", shirt: "jacket", shoes: "high-tops" },
      { hair: "ponytail", pants: "shorts", shirt: "striped", shoes: "runners" },
      { hair: "braids", pants: "leggings", shirt: "tee", shoes: "loafers" },
      { hair: "undercut", pants: "wide", shirt: "tank", shoes: "sandals" },
      { hair: "waves", pants: "cargo", shirt: "sweater", shoes: "platforms" },
      { hair: "bun", pants: "joggers", shirt: "vest", shoes: "slip-ons" },
      { hair: "pixie", pants: "tapered", shirt: "overshirt", shoes: "work-boots" },
      { hair: "mohawk", pants: "cuffed", shirt: "polo", shoes: "flats" },
      { hair: "locs", shirt: "blazer" },
      { hair: "afro", shirt: "workwear" },
      { direction: "west", hair: "side-part" },
    ];

    for (const variant of variants) {
      const graphics = new FakeGraphics();
      drawAvatarBody(graphics as unknown as Graphics, {
        animationState: variant.animationState ?? "idle",
        appearance: { ...DEFAULT_AVATAR_APPEARANCE, ...variant },
        direction: variant.direction ?? "south",
        stepFrame: variant.stepFrame ?? 0,
      });

      expect(graphics.calls.length).toBeGreaterThan(0);
    }
  });

  test("renders unknown/legacy hair as the short fallback silhouette", () => {
    const unknown = renderCalls({ hair: "retired-style" as AvatarAppearance["hair"] });
    const short = renderCalls({ hair: "short" });
    const buzz = renderCalls({ hair: "buzz" });

    // The fallback reuses the neutral "short" silhouette exactly...
    expect(unknown).toEqual(short);
    // ...and is not a no-op (it differs from a real, distinct style).
    expect(unknown).not.toEqual(buzz);
  });

  test("renders cuffed pants distinctly from joggers", () => {
    const cuffed = renderCalls({ pants: "cuffed" });
    const joggers = renderCalls({ pants: "joggers" });

    expect(cuffed).not.toEqual(joggers);
    expect(cuffed.length).toBeGreaterThan(joggers.length);
  });

  test("converts invalid CSS colors to white", () => {
    expect(toPixiColor("not-a-color")).toBe(0xffffff);
  });
});

function renderCalls(variant: AvatarVariant): DrawCall[] {
  const graphics = new FakeGraphics();
  drawAvatarBody(graphics as unknown as Graphics, {
    animationState: variant.animationState ?? "idle",
    appearance: { ...DEFAULT_AVATAR_APPEARANCE, ...variant },
    direction: variant.direction ?? "south",
    stepFrame: variant.stepFrame ?? 0,
  });
  return graphics.calls;
}

type DrawCall = {
  args: unknown[];
  method: string;
};

class FakeGraphics {
  readonly calls: DrawCall[] = [];
  readonly scale = { x: 1 };

  circle(...args: unknown[]): this {
    return this.record("circle", args);
  }

  ellipse(...args: unknown[]): this {
    return this.record("ellipse", args);
  }

  fill(...args: unknown[]): this {
    return this.record("fill", args);
  }

  rect(...args: unknown[]): this {
    return this.record("rect", args);
  }

  roundRect(...args: unknown[]): this {
    return this.record("roundRect", args);
  }

  stroke(...args: unknown[]): this {
    return this.record("stroke", args);
  }

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
}
