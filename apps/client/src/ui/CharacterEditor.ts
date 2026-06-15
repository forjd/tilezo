import {
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_PANTS_COLORS,
  AVATAR_PANTS_STYLES,
  AVATAR_SHIRT_COLORS,
  AVATAR_SHIRT_STYLES,
  AVATAR_SHOE_COLORS,
  AVATAR_SHOE_STYLES,
  AVATAR_SKIN_TONES,
  type AvatarAppearance,
  createRandomAvatarAppearance,
  DEFAULT_AVATAR_APPEARANCE,
  sanitizeAppearance,
} from "@tilezo/protocol/appearance";
import { AvatarPreview } from "./AvatarPreview";

type CharacterEditorOptions = {
  initialAppearance: AvatarAppearance;
  onSubmit: (appearance: AvatarAppearance) => void;
  onCancel?: () => void;
  // Asks the user to confirm discarding unsaved edits when cancelling. Injectable for tests;
  // defaults to the native confirm dialog (and to allowing the discard when none is available).
  confirmDiscard?: () => boolean;
};

export class CharacterEditor {
  readonly element = document.createElement("section");

  private readonly hair = this.createSelect(PRIMARY_HAIR_STYLES);
  private readonly hairColor = this.createColorInput();
  private readonly skinTone = this.createColorInput();
  private readonly shirt = this.createSelect(PRIMARY_SHIRT_STYLES);
  private readonly shirtColor = this.createColorInput();
  private readonly pants = this.createSelect(PRIMARY_PANTS_STYLES);
  private readonly pantsColor = this.createColorInput();
  private readonly shoes = this.createSelect(PRIMARY_SHOE_STYLES);
  private readonly shoesColor = this.createColorInput();
  private readonly preview = new AvatarPreview(document);
  private readonly submitButton = document.createElement("button");
  private readonly cancelButton = document.createElement("button");
  private readonly randomizeButton = document.createElement("button");
  private readonly resetButton = document.createElement("button");
  private readonly confirmDiscard: () => boolean;
  // The last loaded (saved) look, used to detect unsaved edits before a discard.
  private baseline: AvatarAppearance = DEFAULT_AVATAR_APPEARANCE;

  constructor(private readonly options: CharacterEditorOptions) {
    this.confirmDiscard = options.confirmDiscard ?? defaultConfirmDiscard;
    this.element.className = "character-panel hidden";
    this.element.innerHTML = "";

    const header = document.createElement("header");
    const title = document.createElement("h1");
    const intro = document.createElement("p");
    header.className = "login-header";
    title.textContent = "Create your character";
    intro.textContent = "Pick a simple look before you enter the room.";
    header.append(title, intro);

    const preview = document.createElement("div");
    const previewViews = document.createElement("div");
    preview.className = "character-preview";
    previewViews.className = "character-preview-views";

    const previewAvatar = document.createElement("div");
    previewAvatar.className = "character-preview-avatar";
    previewAvatar.append(this.preview.element);
    previewViews.append(previewAvatar);
    void this.preview.mount();

    preview.append(previewViews);

    const form = document.createElement("form");
    form.className = "character-form";
    form.append(
      this.createChoiceField("Hair", this.hair),
      this.createColorField("Hair color", this.hairColor, COLOR_PALETTES.hair),
      this.createColorField("Skin tone", this.skinTone, COLOR_PALETTES.skin),
      this.createChoiceField("Top", this.shirt),
      this.createColorField("Top color", this.shirtColor, COLOR_PALETTES.shirt),
      this.createChoiceField("Bottoms", this.pants),
      this.createColorField("Bottoms color", this.pantsColor, COLOR_PALETTES.pants),
      this.createChoiceField("Shoes", this.shoes),
      this.createColorField("Shoe color", this.shoesColor, COLOR_PALETTES.shoes),
    );

    const actions = document.createElement("div");
    actions.className = "character-actions";
    this.randomizeButton.className = "secondary-button";
    this.randomizeButton.type = "button";
    this.randomizeButton.textContent = "Randomize";
    this.resetButton.className = "secondary-button";
    this.resetButton.type = "button";
    this.resetButton.textContent = "Reset";
    this.submitButton.className = "primary-button";
    this.submitButton.type = "submit";
    this.submitButton.textContent = "Enter room";
    this.cancelButton.className = "secondary-button";
    this.cancelButton.type = "button";
    this.cancelButton.textContent = "Cancel";
    actions.append(this.randomizeButton, this.resetButton, this.cancelButton, this.submitButton);
    form.append(actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.options.onSubmit(this.readAppearance());
    });
    // Randomize/Reset apply a look without touching the baseline, so they register as
    // unsaved edits (a later Cancel will confirm before discarding them).
    this.randomizeButton.addEventListener("click", () => {
      this.applyAppearance(createRandomAvatarAppearance());
    });
    this.resetButton.addEventListener("click", () => {
      this.applyAppearance(DEFAULT_AVATAR_APPEARANCE);
    });
    this.cancelButton.addEventListener("click", () => {
      if (this.hasUnsavedChanges() && !this.confirmDiscard()) {
        return;
      }
      this.options.onCancel?.();
    });
    form.addEventListener("input", () => this.updatePreview());
    form.addEventListener("change", () => this.updatePreview());

    this.element.append(header, preview, form);
    this.setAppearance(options.initialAppearance);
  }

  show(appearance?: AvatarAppearance): void {
    if (appearance) {
      this.setAppearance(appearance);
    }

    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  // Tears down the PIXI/WebGL preview and detaches the panel. Must be called when the editor
  // is discarded (e.g. on sign-out) so its WebGL context is not leaked — browsers cap live
  // contexts and force-lose the oldest, which can break the in-room renderer.
  dispose(): void {
    this.preview.destroy();
    this.element.remove();
  }

  setSubmitLabel(label: string): void {
    this.submitButton.textContent = label;
  }

  // True when the visible controls differ from the last loaded look. Used to warn before a
  // discard on cancel.
  hasUnsavedChanges(): boolean {
    const current = this.readAppearance();
    return (Object.keys(current) as (keyof AvatarAppearance)[]).some(
      (key) => current[key] !== this.baseline[key],
    );
  }

  private readAppearance(): AvatarAppearance {
    return {
      hair: this.hair.value as AvatarAppearance["hair"],
      hairColor: this.hairColor.value as AvatarAppearance["hairColor"],
      skinTone: this.skinTone.value as AvatarAppearance["skinTone"],
      shirt: this.shirt.value as AvatarAppearance["shirt"],
      shirtColor: this.shirtColor.value as AvatarAppearance["shirtColor"],
      pants: this.pants.value as AvatarAppearance["pants"],
      pantsColor: this.pantsColor.value as AvatarAppearance["pantsColor"],
      shoes: this.shoes.value as AvatarAppearance["shoes"],
      shoesColor: this.shoesColor.value as AvatarAppearance["shoesColor"],
    };
  }

  // Loads a saved look and resets the unsaved-changes baseline.
  private setAppearance(appearance: AvatarAppearance): void {
    this.baseline = this.applyAppearance(appearance);
  }

  // Applies an appearance to the controls without changing the baseline. Coerces any
  // unknown/legacy field to a valid default so every control has a selectable value (defense
  // in depth — the server already sanitizes appearance on read). Returns the applied look.
  private applyAppearance(appearance: AvatarAppearance): AvatarAppearance {
    const safe = sanitizeAppearance(appearance);
    this.hair.value = safe.hair;
    this.hairColor.value = safe.hairColor;
    this.skinTone.value = safe.skinTone;
    this.shirt.value = safe.shirt;
    this.shirtColor.value = safe.shirtColor;
    this.pants.value = safe.pants;
    this.pantsColor.value = safe.pantsColor;
    this.shoes.value = safe.shoes;
    this.shoesColor.value = safe.shoesColor;
    this.updatePreview();
    return safe;
  }

  private updatePreview(): void {
    this.preview.update(this.readAppearance());
    this.syncSwatches();
    this.syncChoiceButtons();
  }

  private createField(
    labelText: string,
    input: HTMLInputElement | HTMLSelectElement,
  ): HTMLLabelElement {
    const label = document.createElement("label");
    const labelContent = document.createElement("span");
    label.className = "field";
    labelContent.textContent = labelText;
    label.append(labelContent, input);
    return label;
  }

  private createChoiceField(labelText: string, select: HTMLSelectElement): HTMLLabelElement {
    const label = this.createField(labelText, select);
    const choices = document.createElement("div");
    choices.className = "option-list";
    select.classList.add("choice-select");

    for (const option of Array.from(select.options)) {
      const button = document.createElement("button");
      button.className = "option-choice";
      button.type = "button";
      button.textContent = option.textContent;
      button.setAttribute("data-value", option.value);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        select.value = option.value;
        this.updatePreview();
      });
      choices.append(button);
    }

    label.append(choices);
    return label;
  }

  private createColorField(
    labelText: string,
    input: HTMLInputElement,
    palette: readonly string[],
  ): HTMLLabelElement {
    const label = this.createField(labelText, input);
    const swatches = document.createElement("div");
    swatches.className = "swatch-list";
    input.type = "hidden";

    for (const color of palette) {
      const swatch = document.createElement("button");
      swatch.className = "color-swatch";
      swatch.type = "button";
      // Keep the hex in the tooltip but speak a readable name (a raw hex is meaningless aloud),
      // and expose selection state through aria-pressed since the input itself is hidden.
      swatch.title = color;
      swatch.setAttribute("aria-label", `${labelText}: ${describeColor(color)}`);
      swatch.setAttribute("aria-pressed", "false");
      swatch.setAttribute("data-color", color);
      swatch.style.setProperty("--swatch-color", color);
      swatch.addEventListener("click", () => {
        input.value = color;
        this.updatePreview();
      });
      swatches.append(swatch);
    }

    label.append(swatches);
    return label;
  }

  private createSelect<T extends readonly string[]>(values: T): HTMLSelectElement {
    const select = document.createElement("select");
    select.required = true;

    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = titleCase(value);
      select.add(option);
    }

    return select;
  }

  private createColorInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "hidden";
    input.autocomplete = "off";
    input.required = true;
    return input;
  }

  private syncSwatches(): void {
    for (const input of [
      this.hairColor,
      this.skinTone,
      this.shirtColor,
      this.pantsColor,
      this.shoesColor,
    ]) {
      const field = input.parentElement;
      const swatches = Array.from(
        field?.querySelectorAll<HTMLButtonElement>(".color-swatch") ?? [],
      );

      for (const swatch of swatches) {
        const selected = swatch.dataset.color === input.value;
        swatch.classList.toggle("selected", selected);
        swatch.setAttribute("aria-pressed", String(selected));
      }
    }
  }

  private syncChoiceButtons(): void {
    for (const select of [this.hair, this.shirt, this.pants, this.shoes]) {
      const field = select.parentElement;
      const choices = Array.from(
        field?.querySelectorAll<HTMLButtonElement>(".option-choice") ?? [],
      );

      for (const choice of choices) {
        const selected = choice.dataset.value === select.value;
        choice.classList.toggle("selected", selected);
        choice.setAttribute("aria-pressed", String(selected));
      }
    }
  }
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase("en-US")}${part.slice(1)}`)
    .join(" ");
}

function defaultConfirmDiscard(): boolean {
  return typeof globalThis.confirm === "function"
    ? globalThis.confirm("Discard your unsaved character changes?")
    : true;
}

const HUE_NAMES: readonly { max: number; name: string }[] = [
  { max: 15, name: "red" },
  { max: 45, name: "orange" },
  { max: 70, name: "yellow" },
  { max: 160, name: "green" },
  { max: 200, name: "teal" },
  { max: 255, name: "blue" },
  { max: 300, name: "purple" },
  { max: 345, name: "pink" },
];

// Maps a palette hex to a coarse, human-readable colour name so assistive tech announces
// something meaningful ("dark brown") instead of a raw hex code. Returns the input unchanged
// for anything that is not a 6-digit hex.
export function describeColor(hex: string): string {
  if (!/^#[\da-fA-F]{6}$/.test(hex)) {
    return hex;
  }

  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 510;
  const tone = lightness <= 0.3 ? "dark " : lightness >= 0.72 ? "light " : "";

  if (max - min <= 18) {
    if (lightness <= 0.18) return "black";
    if (lightness >= 0.82) return "white";
    return "gray";
  }

  let hue: number;
  if (max === r) {
    hue = (((g - b) / (max - min)) % 6) * 60;
  } else if (max === g) {
    hue = ((b - r) / (max - min) + 2) * 60;
  } else {
    hue = ((r - g) / (max - min) + 4) * 60;
  }
  hue = (hue + 360) % 360;

  let name = HUE_NAMES.find((bucket) => hue < bucket.max)?.name ?? "red";
  // A dark orange reads as brown, which matches the palette's many wood/earth tones.
  if (name === "orange" && lightness < 0.5) {
    name = "brown";
  }

  return `${tone}${name}`.trim();
}

const COLOR_PALETTES = {
  hair: AVATAR_HAIR_COLORS,
  skin: AVATAR_SKIN_TONES,
  shirt: AVATAR_SHIRT_COLORS,
  pants: AVATAR_PANTS_COLORS,
  shoes: AVATAR_SHOE_COLORS,
} satisfies Record<string, readonly string[]>;

const PRIMARY_HAIR_STYLES = AVATAR_HAIR_STYLES;
const PRIMARY_SHIRT_STYLES = AVATAR_SHIRT_STYLES;
const PRIMARY_PANTS_STYLES = AVATAR_PANTS_STYLES;
const PRIMARY_SHOE_STYLES = AVATAR_SHOE_STYLES;
