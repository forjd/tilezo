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

  test("ignores stale path prefixes that are already behind the avatar", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    avatar.update(0.36);
    avatar.update(0);

    avatar.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    avatar.update(0.18);

    expect(avatar.position).toEqual({ x: 1, y: 0 });
    expect({ x: avatar.view.x, y: avatar.view.y }).toEqual({ x: 48, y: 24 });
  });

  test("stores and updates the drawn appearance without moving the avatar", () => {
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

  test("rebuilds the drawn body when appearance changes", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 }, DEFAULT_AVATAR_APPEARANCE);

    avatar.setAppearance({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "bob",
      hairColor: "#3b2418",
      shirt: "hoodie",
      shirtColor: "#7f3b44",
    });

    const state = avatar as unknown as {
      renderedBodyKey?: string;
    };

    expect(state.renderedBodyKey).toContain("#3b2418");
    expect(state.renderedBodyKey).toContain("#7f3b44");
  });

  test("shows chat bubbles briefly above the avatar", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });
    const state = avatar as unknown as {
      chatBubble: { visible: boolean };
      chatBubbleText: { text: string };
      label: { visible: boolean };
    };

    avatar.say("hello room");

    expect(state.chatBubble.visible).toBe(true);
    expect(state.chatBubbleText.text).toBe("hello room");
    expect(state.label.visible).toBe(true);

    avatar.update(5);

    expect(state.chatBubble.visible).toBe(false);
    expect(state.label.visible).toBe(true);
  });

  test("shows typing indicators when no chat bubble is visible", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });
    const state = avatar as unknown as {
      chatBubble: { visible: boolean };
      typingIndicator: { visible: boolean };
    };

    avatar.setTyping(true);

    expect(state.typingIndicator.visible).toBe(true);

    avatar.say("hello room");

    expect(state.chatBubble.visible).toBe(true);
    expect(state.typingIndicator.visible).toBe(false);

    avatar.update(5);

    expect(state.chatBubble.visible).toBe(false);
    expect(state.typingIndicator.visible).toBe(true);

    avatar.setTyping(false);

    expect(state.typingIndicator.visible).toBe(false);
  });

  test("keeps long unbroken chat messages inside the bubble line budget", () => {
    const avatar = new Avatar("user_1", "Dan", { x: 0, y: 0 });
    const state = avatar as unknown as {
      chatBubbleText: { text: string };
    };

    avatar.say("123123123123123123123123123123123123123123123123123123123123123123");

    const lines = state.chatBubbleText.text.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.length <= 16)).toBe(true);
    expect(lines.at(-1)?.endsWith("...")).toBe(true);
  });
});
