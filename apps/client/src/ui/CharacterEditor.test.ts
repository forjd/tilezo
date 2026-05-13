import { afterEach, describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { CharacterEditor } from "./CharacterEditor";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("CharacterEditor", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("submits the selected drawn appearance", () => {
    installDocument();
    const submissions: unknown[] = [];
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit: (appearance) => submissions.push(appearance),
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;
    const hairColor = form.children[1]?.children[1] as FakeElement;
    const shirtColor = form.children[4]?.children[1] as FakeElement;

    hair.value = "side-part";
    hairColor.value = "#8b4a24";
    shirtColor.value = "#2f5f7f";
    form.dispatch("submit", new FakeSubmitEvent());

    expect(submissions).toEqual([
      {
        ...DEFAULT_AVATAR_APPEARANCE,
        hair: "side-part",
        hairColor: "#8b4a24",
        shirtColor: "#2f5f7f",
      },
    ]);
  });

  test("can be shown, hidden, and reset to an existing appearance", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const appearance: AvatarAppearance = { ...DEFAULT_AVATAR_APPEARANCE, pantsColor: "#77684b" };

    editor.hide();
    expect(editor.element.classList.contains("hidden")).toBe(true);

    editor.show(appearance);
    const form = editor.element.children[2] as unknown as FakeElement;
    const pantsColor = form.children[6]?.children[1] as FakeElement;

    expect(editor.element.classList.contains("hidden")).toBe(false);
    expect(pantsColor.value).toBe("#77684b");
  });

  test("renders a drawn preview and updates it when controls change", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const preview = editor.element.children[1] as unknown as FakeElement;
    const form = editor.element.children[2] as unknown as FakeElement;
    const hairColor = form.children[1]?.children[1] as FakeElement;

    hairColor.value = "#8b4a24";
    form.dispatch("input", {});

    expect(preview.className).toBe("character-preview");
    const previewAvatar = preview.children[0]?.children[0] as FakeElement;
    const previewBody = previewAvatar.children[0] as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;

    expect(preview.children[0]?.className).toBe("character-preview-views");
    expect(previewAvatar.className).toBe("character-preview-avatar");
    expect(previewAvatar.children).toHaveLength(1);
    expect(previewBody.className).toBe("avatar-preview-drawn");
    expect(previewBody.children.map((child) => child.getAttribute("data-part"))).toContain("hair");
    expect(previewBody.style.getPropertyValue("--avatar-hair")).toBe("#8b4a24");

    hair.value = "bob";
    form.dispatch("change", {});

    expect(hairColor.value).toBe("#8b4a24");
    expect(hair.value).toBe("bob");
    expect(previewBody.getAttribute("data-hair")).toBe("bob");
  });
});

function installDocument() {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tagName: string) {
        return new FakeElement(tagName, globalThis.document as Document);
      },
    } as unknown as Document,
  });
}

function restoreDocument() {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
}

type FakeEvent = {
  preventDefault?: () => void;
};

class FakeSubmitEvent {
  preventDefault(): void {}
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  readonly style = new FakeStyle();
  className = "";
  maxLength = 0;
  name = "";
  required = false;
  textContent = "";
  type = "";
  value = "";
  selectedIndex = 0;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: Document,
  ) {}

  set innerHTML(value: string) {
    if (value === "") {
      this.children.length = 0;
    }
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  add(option: FakeElement): void {
    this.children.push(option);
  }

  get options(): FakeElement[] {
    return this.children;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
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

  dispatch(type: string, event: FakeEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  dispatchEvent(event: Event): boolean {
    this.dispatch(event.type, event);
    return true;
  }

  click(): void {
    this.dispatch("click", {});
  }
}

function dataName(name: string): string {
  return name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
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

class FakeClassList {
  constructor(private readonly element: FakeElement) {}

  add(className: string): void {
    this.setClasses([...this.getClasses(), className]);
  }

  remove(className: string): void {
    this.setClasses(this.getClasses().filter((value) => value !== className));
  }

  contains(className: string): boolean {
    return this.getClasses().includes(className);
  }

  private getClasses(): string[] {
    return this.element.className.split(" ").filter(Boolean);
  }

  private setClasses(classes: string[]): void {
    this.element.className = [...new Set(classes)].join(" ");
  }
}
