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

  test("converts invalid CSS colors to white", () => {
    expect(toPixiColor("not-a-color")).toBe(0xffffff);
  });
});

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
