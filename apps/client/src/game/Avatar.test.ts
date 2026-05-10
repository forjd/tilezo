import { describe, expect, test } from "bun:test";
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
});
