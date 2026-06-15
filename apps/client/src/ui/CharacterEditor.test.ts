import { afterEach, describe, expect, test } from "bun:test";
import {
  AVATAR_HAIR_STYLES,
  AVATAR_SHIRT_COLORS,
  type AvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
} from "@tilezo/protocol/appearance";
import { CharacterEditor, describeColor } from "./CharacterEditor";

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
    const actions = form.children[9] as FakeElement;
    const submit = actions.children[3] as FakeElement;

    editor.setSubmitLabel("Save character");

    expect(editor.element.classList.contains("hidden")).toBe(false);
    expect(pantsColor.value).toBe("#77684b");
    expect(submit.textContent).toBe("Save character");
  });

  test("mounts an avatar preview that updates when controls change", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const preview = editor.element.children[1] as unknown as FakeElement;
    const form = editor.element.children[2] as unknown as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;
    const hairColor = form.children[1]?.children[1] as FakeElement;
    const editorState = editor as unknown as { preview: { appearance: AvatarAppearance } };

    expect(preview.className).toBe("character-preview");
    expect(preview.children[0]?.className).toBe("character-preview-views");

    const previewAvatar = preview.children[0]?.children[0] as FakeElement;
    expect(previewAvatar.className).toBe("character-preview-avatar");
    expect(previewAvatar.children).toHaveLength(1);
    expect(previewAvatar.children[0]?.className).toBe("avatar-preview");

    hairColor.value = "#8b4a24";
    form.dispatch("input", {});

    expect(editorState.preview.appearance.hairColor).toBe("#8b4a24");

    hair.value = "bob";
    form.dispatch("change", {});

    expect(editorState.preview.appearance.hair).toBe("bob");
    expect(editorState.preview.appearance.hairColor).toBe("#8b4a24");
  });

  test("populates controls from the expanded protocol catalog", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;
    const hairChoices = form.children[0]?.children[2] as FakeElement;
    const shirtColorField = form.children[4] as FakeElement;
    const shirtSwatches = shirtColorField.children[2] as FakeElement;

    expect(hair.options.map((option) => option.value)).toEqual([...AVATAR_HAIR_STYLES]);
    expect(hairChoices.children.map((choice) => choice.textContent)).toContain("Afro");
    expect(hairChoices.children.map((choice) => choice.textContent)).toContain("Locs");
    expect(shirtSwatches.children.map((swatch) => swatch.dataset.color)).toEqual([
      ...AVATAR_SHIRT_COLORS,
    ]);
  });

  test("updates the preview from visible option buttons", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const hairChoices = form.children[0]?.children[2] as FakeElement;
    const shirtSwatches = form.children[4]?.children[2] as FakeElement;
    const afro = hairChoices.children.find((choice) => choice.dataset.value === "afro");
    const blueShirt = shirtSwatches.children.find((choice) => choice.dataset.color === "#2f5f7f");
    const editorState = editor as unknown as { preview: { appearance: AvatarAppearance } };

    afro?.click();
    blueShirt?.click();

    expect(editorState.preview.appearance.hair).toBe("afro");
    expect(editorState.preview.appearance.shirtColor).toBe("#2f5f7f");
  });

  test("dispose tears down the preview and detaches the panel", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const editorState = editor as unknown as { preview: { destroy: () => void } };
    let destroyed = 0;
    editorState.preview.destroy = () => {
      destroyed += 1;
    };

    editor.dispose();

    expect(destroyed).toBe(1);
    expect((editor.element as unknown as FakeElement).removed).toBe(true);
  });

  test("cancel invokes onCancel directly when there are no unsaved changes", () => {
    installDocument();
    let cancels = 0;
    let submits = 0;
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit: () => {
        submits += 1;
      },
      onCancel: () => {
        cancels += 1;
      },
    });

    cancelButton(editor).click();

    expect(cancels).toBe(1);
    expect(submits).toBe(0);
  });

  test("cancel confirms before discarding unsaved changes", () => {
    installDocument();
    let cancels = 0;
    let confirmResult = false;
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
      onCancel: () => {
        cancels += 1;
      },
      confirmDiscard: () => confirmResult,
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;
    hair.value = "bob";

    expect(editor.hasUnsavedChanges()).toBe(true);

    cancelButton(editor).click();
    expect(cancels).toBe(0);

    confirmResult = true;
    cancelButton(editor).click();
    expect(cancels).toBe(1);
  });

  test("randomize and reset apply a look to the controls", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const actions = form.children[9] as FakeElement;
    const randomize = actions.children[0] as FakeElement;
    const reset = actions.children[1] as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;

    randomize.click();
    expect([...AVATAR_HAIR_STYLES] as string[]).toContain(hair.value);

    hair.value = "bob";
    reset.click();
    expect(hair.value).toBe(DEFAULT_AVATAR_APPEARANCE.hair);
  });

  test("coerces unknown legacy appearance values to defaults on load", () => {
    installDocument();
    const editor = new CharacterEditor({
      initialAppearance: DEFAULT_AVATAR_APPEARANCE,
      onSubmit() {},
    });
    const form = editor.element.children[2] as unknown as FakeElement;
    const hair = form.children[0]?.children[1] as FakeElement;
    const hairColor = form.children[1]?.children[1] as FakeElement;

    editor.show({
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "retired-style" as AvatarAppearance["hair"],
      hairColor: "#zzzzzz" as AvatarAppearance["hairColor"],
    });

    expect(hair.value).toBe(DEFAULT_AVATAR_APPEARANCE.hair);
    expect(hairColor.value).toBe(DEFAULT_AVATAR_APPEARANCE.hairColor);
    expect(editor.hasUnsavedChanges()).toBe(false);
  });

  test("describeColor maps palette hexes to readable spoken names", () => {
    expect(describeColor("not-a-hex")).toBe("not-a-hex");
    expect(describeColor("#000000")).toBe("black");
    expect(describeColor("#ffffff")).toBe("white");
    expect(describeColor("#808080")).toBe("gray");
    expect(describeColor("#ff0000")).toBe("red");
    expect(describeColor("#6f3f22")).toBe("dark brown");
    expect(describeColor("#f0d06a")).toBe("yellow");
    expect(describeColor("#f2c097")).toBe("light orange");
    expect(describeColor("#4c8a6a")).toBe("green");
    expect(describeColor("#2f6f6a")).toBe("teal");
    expect(describeColor("#394c6a")).toBe("blue");
    expect(describeColor("#5b3f6f")).toBe("purple");
    expect(describeColor("#cc4488")).toBe("pink");
    expect(describeColor("#ff0030")).toBe("red");
  });
});

function cancelButton(editor: CharacterEditor): FakeElement {
  const form = editor.element.children[2] as unknown as FakeElement;
  const actions = form.children[9] as FakeElement;
  return actions.children[2] as FakeElement;
}

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

  removed = false;

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  remove(): void {
    this.removed = true;
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
