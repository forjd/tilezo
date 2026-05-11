import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { createAvatarPreview, updateAvatarPreview } from "./AvatarPreview";

describe("AvatarPreview", () => {
  test("renders manifest layers for a selected appearance", () => {
    const documentRef = new FakeDocument();
    const preview = createAvatarPreview(
      documentRef as unknown as Document,
    ) as unknown as FakeElement;

    updateAvatarPreview(
      preview as unknown as HTMLElement,
      {
        ...DEFAULT_AVATAR_APPEARANCE,
        hair: "bob",
        hairColor: "#111111",
        shirt: "hoodie",
        shirtColor: "#222222",
      },
      { state: "walk", direction: "east", elapsedSeconds: 0.13 },
    );

    expect(preview.children.length).toBeGreaterThanOrEqual(6);
    expect(preview.children.map((layer) => layer.getAttribute("data-slot"))).toEqual([
      "body",
      "shoes",
      "bottoms",
      "top",
      "face",
      "hair",
    ]);
    expect(
      preview.children.some((layer) => layer.style.getPropertyValue("--layer-tint") === "#111111"),
    ).toBe(true);
    expect(
      preview.children.some((layer) => layer.style.getPropertyValue("--layer-tint") === "#222222"),
    ).toBe(true);
    expect(preview.children.every((layer) => layer.getAttribute("data-frame-index") === "14")).toBe(
      true,
    );
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
  readonly style = new FakeStyle();
  className = "";

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  set innerHTML(value: string) {
    if (value === "") {
      this.children.length = 0;
    }
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith("data-")) {
      this.dataset[dataName(name)] = value;
    }
  }

  getAttribute(name: string): string | undefined {
    if (name.startsWith("data-")) {
      return this.dataset[dataName(name)];
    }

    return undefined;
  }
}

class FakeStyle {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

function dataName(name: string): string {
  return name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
