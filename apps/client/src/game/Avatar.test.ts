import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  test("rerouting through the active segment keeps the current interpolation", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    avatar.update(0.18);

    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual({ x: 16, y: 8 });

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    avatar.update(0);

    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual({ x: 16, y: 8 });
  });

  test("rerouting away from the active segment starts from the current rendered position", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    avatar.update(0.18);

    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual({ x: 16, y: 8 });

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    avatar.update(0);

    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual({ x: 16, y: 8 });
  });

  test("stores and updates the layered appearance without moving the avatar", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 1, y: 1 }, DEFAULT_AVATAR_APPEARANCE);
    const before = { x: avatar.view.x, y: avatar.view.y };

    avatar.setAppearance({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part",
      hairColor: "#8b4a24",
      shirtColor: "#2f5f7f",
    });

    expect(avatar.appearance).toEqual({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part",
      hairColor: "#8b4a24",
      shirtColor: "#2f5f7f",
    });
    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual(before);
  });
});
