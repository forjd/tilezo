import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { AvatarPreview } from "./AvatarPreview";

describe("AvatarPreview", () => {
  test("creates a wrapper element marked for the avatar preview", () => {
    const documentRef = new FakeDocument();
    const preview = new AvatarPreview(documentRef as unknown as Document);
    const element = preview.element as unknown as FakeElement;

    expect(element.className).toBe("avatar-preview");
    expect(element.dataset.ariaHidden ?? element.getAttribute("aria-hidden")).toBe("true");
  });

  test("captures the latest appearance applied via update", () => {
    const documentRef = new FakeDocument();
    const preview = new AvatarPreview(documentRef as unknown as Document);

    expect(preview.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);

    preview.update({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "afro",
      hairColor: "#5b3f6f",
      shirt: "blazer",
      shirtColor: "#5a4b7f",
      pants: "cargo",
      shoes: "platforms",
    });

    expect(preview.appearance).toEqual({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "afro",
      hairColor: "#5b3f6f",
      shirt: "blazer",
      shirtColor: "#5a4b7f",
      pants: "cargo",
      shoes: "platforms",
    });
  });

  test("skips redrawing when the appearance has not changed", () => {
    const documentRef = new FakeDocument();
    const preview = new AvatarPreview(documentRef as unknown as Document);
    const state = preview as unknown as { renderedKey: string };
    const initialKey = state.renderedKey;

    preview.update({ ...DEFAULT_AVATAR_APPEARANCE });

    expect(state.renderedKey).toBe(initialKey);

    preview.update({ ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" });

    expect(state.renderedKey).not.toBe(initialKey);
  });
});

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = "";

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    if (name === "aria-hidden") {
      this.dataset.ariaHidden = value;
      return;
    }

    if (name.startsWith("data-")) {
      this.dataset[dataName(name)] = value;
    }
  }

  getAttribute(name: string): string | undefined {
    if (name === "aria-hidden") {
      return this.dataset.ariaHidden;
    }

    if (name.startsWith("data-")) {
      return this.dataset[dataName(name)];
    }

    return undefined;
  }
}

function dataName(name: string): string {
  return name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
