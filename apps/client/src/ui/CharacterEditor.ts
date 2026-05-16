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
} from "@tilezo/protocol/appearance";
import { AvatarPreview } from "./AvatarPreview";

type CharacterEditorOptions = {
  initialAppearance: AvatarAppearance;
  onSubmit: (appearance: AvatarAppearance) => void;
  onCancel?: () => void;
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

  constructor(private readonly options: CharacterEditorOptions) {
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
      this.createField("Hair", this.hair),
      this.createColorField("Hair color", this.hairColor, COLOR_PALETTES.hair),
      this.createColorField("Skin tone", this.skinTone, COLOR_PALETTES.skin),
      this.createField("Top", this.shirt),
      this.createColorField("Top color", this.shirtColor, COLOR_PALETTES.shirt),
      this.createField("Bottoms", this.pants),
      this.createColorField("Bottoms color", this.pantsColor, COLOR_PALETTES.pants),
      this.createField("Shoes", this.shoes),
      this.createColorField("Shoe color", this.shoesColor, COLOR_PALETTES.shoes),
    );

    const actions = document.createElement("div");
    actions.className = "character-actions";
    this.submitButton.className = "primary-button";
    this.submitButton.type = "submit";
    this.submitButton.textContent = "Enter room";
    this.cancelButton.className = "secondary-button";
    this.cancelButton.type = "button";
    this.cancelButton.textContent = "Cancel";
    actions.append(this.cancelButton, this.submitButton);
    form.append(actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.options.onSubmit(this.readAppearance());
    });
    this.cancelButton.addEventListener("click", () => this.options.onCancel?.());
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

  setSubmitLabel(label: string): void {
    this.submitButton.textContent = label;
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

  private setAppearance(appearance: AvatarAppearance): void {
    this.ensureSelectOption(this.hair, appearance.hair);
    this.ensureSelectOption(this.shirt, appearance.shirt);
    this.ensureSelectOption(this.pants, appearance.pants);
    this.ensureSelectOption(this.shoes, appearance.shoes);
    this.hair.value = appearance.hair;
    this.hairColor.value = appearance.hairColor;
    this.skinTone.value = appearance.skinTone;
    this.shirt.value = appearance.shirt;
    this.shirtColor.value = appearance.shirtColor;
    this.pants.value = appearance.pants;
    this.pantsColor.value = appearance.pantsColor;
    this.shoes.value = appearance.shoes;
    this.shoesColor.value = appearance.shoesColor;
    this.updatePreview();
    this.syncSwatches();
  }

  private updatePreview(): void {
    this.preview.update(this.readAppearance());
    this.syncSwatches();
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
      swatch.title = color;
      swatch.setAttribute("aria-label", `${labelText} ${color}`);
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

  private ensureSelectOption(select: HTMLSelectElement, value: string): void {
    if (Array.from(select.options).some((option) => option.value === value)) {
      return;
    }

    const option = document.createElement("option");
    option.value = value;
    option.textContent = titleCase(value);
    select.add(option);
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
        swatch.classList.toggle("selected", swatch.dataset.color === input.value);
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
