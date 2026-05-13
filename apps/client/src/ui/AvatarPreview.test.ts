import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { createAvatarPreview, updateAvatarPreview } from "./AvatarPreview";

describe("AvatarPreview", () => {
  test("renders a simple drawn preview for a selected appearance", () => {
    const documentRef = new FakeDocument();
    const preview = createAvatarPreview(
      documentRef as unknown as Document,
    ) as unknown as FakeElement;

    updateAvatarPreview(preview as unknown as HTMLElement, {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "bob",
      hairColor: "#3b2418",
      shirt: "hoodie",
      shirtColor: "#7f3b44",
    });

    expect(preview.className).toBe("avatar-preview-drawn");
    expect(preview.children.map((part) => part.getAttribute("data-part"))).toContain("hair");
    expect(preview.dataset.hair).toBe("bob");
    expect(preview.dataset.shirt).toBe("hoodie");
    expect(preview.style.getPropertyValue("--avatar-hair")).toBe("#3b2418");
    expect(preview.style.getPropertyValue("--avatar-shirt")).toBe("#7f3b44");
    expect(
      preview.children.some(
        (part) =>
          part.getAttribute("data-part") === "hair" &&
          part.style.getPropertyValue("--avatar-part-color") === "#3b2418",
      ),
    ).toBe(true);
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
