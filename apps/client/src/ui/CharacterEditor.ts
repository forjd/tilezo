import {
  AVATAR_HAIR_STYLES,
  AVATAR_PANTS_STYLES,
  AVATAR_SHIRT_STYLES,
  AVATAR_SHOE_STYLES,
  type AvatarAppearance,
} from "@tilezo/protocol";
import { createAvatarPreview, updateAvatarPreview } from "./AvatarPreview";

const PREVIEW_DIRECTIONS = ["south", "south-east", "east", "north-east", "north"] as const;

type CharacterEditorOptions = {
  initialAppearance: AvatarAppearance;
  onSubmit: (appearance: AvatarAppearance) => void;
  onCancel?: () => void;
};

export class CharacterEditor {
  readonly element = document.createElement("section");

  private readonly hair = this.createSelect(AVATAR_HAIR_STYLES);
  private readonly hairColor = this.createColorInput();
  private readonly skinTone = this.createColorInput();
  private readonly shirt = this.createSelect(AVATAR_SHIRT_STYLES);
  private readonly shirtColor = this.createColorInput();
  private readonly pants = this.createSelect(AVATAR_PANTS_STYLES);
  private readonly pantsColor = this.createColorInput();
  private readonly shoes = this.createSelect(AVATAR_SHOE_STYLES);
  private readonly shoesColor = this.createColorInput();
  private readonly previewBody = createAvatarPreview(document);
  private readonly previewSwatches = new Map<HTMLInputElement, HTMLButtonElement>();
  private readonly submitButton = document.createElement("button");
  private readonly cancelButton = document.createElement("button");
  private previewDirectionIndex = 0;

  constructor(private readonly options: CharacterEditorOptions) {
    this.element.className = "character-panel hidden";
    this.element.innerHTML = "";

    const header = document.createElement("header");
    const title = document.createElement("h1");
    const intro = document.createElement("p");
    header.className = "login-header";
    title.textContent = "Create your character";
    intro.textContent = "Pick a layered look before you enter the room.";
    header.append(title, intro);

    const preview = document.createElement("div");
    const previewViews = document.createElement("div");
    const previewLabel = document.createElement("p");
    preview.className = "character-preview";
    previewViews.className = "character-preview-views";
    previewLabel.textContent = "Live room avatars use these layers and colors.";

    const previewAvatar = document.createElement("div");
    const caption = document.createElement("span");
    const leftControls = document.createElement("div");
    const rightControls = document.createElement("div");
    previewAvatar.className = "character-preview-avatar";
    leftControls.className = "character-preview-controls";
    rightControls.className = "character-preview-controls";
    caption.textContent = "Preview";
    leftControls.append(
      this.createPreviewStepper("Hair", this.hair),
      this.createPreviewStepper("Top", this.shirt),
      this.createPreviewStepper("Bottoms", this.pants),
      this.createPreviewStepper("Shoes", this.shoes),
      this.createPreviewDirectionStepper(),
    );
    rightControls.append(
      this.createPreviewSwatch("Hair color", this.hairColor),
      this.createPreviewSwatch("Skin tone", this.skinTone),
      this.createPreviewSwatch("Top color", this.shirtColor),
      this.createPreviewSwatch("Bottoms color", this.pantsColor),
      this.createPreviewSwatch("Shoe color", this.shoesColor),
    );
    previewAvatar.append(leftControls, this.previewBody, rightControls, caption);
    previewViews.append(previewAvatar);

    preview.append(previewViews, previewLabel);

    const form = document.createElement("form");
    form.className = "character-form";
    form.append(
      this.createField("Hair", this.hair),
      this.createField("Hair color", this.hairColor),
      this.createField("Skin tone", this.skinTone),
      this.createField("Top", this.shirt),
      this.createField("Top color", this.shirtColor),
      this.createField("Bottoms", this.pants),
      this.createField("Bottoms color", this.pantsColor),
      this.createField("Shoes", this.shoes),
      this.createField("Shoe color", this.shoesColor),
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
      hairColor: this.hairColor.value,
      skinTone: this.skinTone.value,
      shirt: this.shirt.value as AvatarAppearance["shirt"],
      shirtColor: this.shirtColor.value,
      pants: this.pants.value as AvatarAppearance["pants"],
      pantsColor: this.pantsColor.value,
      shoes: this.shoes.value as AvatarAppearance["shoes"],
      shoesColor: this.shoesColor.value,
    };
  }

  private setAppearance(appearance: AvatarAppearance): void {
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
  }

  private updatePreview(): void {
    updateAvatarPreview(this.previewBody, this.readAppearance(), {
      direction: PREVIEW_DIRECTIONS[this.previewDirectionIndex] ?? "south",
    });

    for (const [input, swatch] of this.previewSwatches) {
      swatch.style.setProperty("--preview-swatch-color", input.value);
    }
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
    input.type = "color";
    input.required = true;
    return input;
  }

  private createPreviewStepper(label: string, select: HTMLSelectElement): HTMLDivElement {
    const control = document.createElement("div");
    const previous = document.createElement("button");
    const next = document.createElement("button");

    control.className = "character-preview-stepper";
    previous.type = "button";
    next.type = "button";
    previous.setAttribute("aria-label", `Previous ${label}`);
    next.setAttribute("aria-label", `Next ${label}`);
    previous.textContent = "<";
    next.textContent = ">";
    previous.addEventListener("click", () => this.cycleSelect(select, -1));
    next.addEventListener("click", () => this.cycleSelect(select, 1));
    control.append(previous, next);

    return control;
  }

  private createPreviewDirectionStepper(): HTMLDivElement {
    const control = document.createElement("div");
    const previous = document.createElement("button");
    const next = document.createElement("button");

    control.className = "character-preview-stepper";
    previous.type = "button";
    next.type = "button";
    previous.setAttribute("aria-label", "Previous view");
    next.setAttribute("aria-label", "Next view");
    previous.textContent = "<";
    next.textContent = ">";
    previous.addEventListener("click", () => this.cyclePreviewDirection(-1));
    next.addEventListener("click", () => this.cyclePreviewDirection(1));
    control.append(previous, next);

    return control;
  }

  private createPreviewSwatch(label: string, input: HTMLInputElement): HTMLButtonElement {
    const swatch = document.createElement("button");
    swatch.className = "character-preview-swatch";
    swatch.type = "button";
    swatch.setAttribute("aria-label", `Change ${label}`);
    swatch.addEventListener("click", () => input.click());
    this.previewSwatches.set(input, swatch);

    return swatch;
  }

  private cycleSelect(select: HTMLSelectElement, direction: -1 | 1): void {
    const optionCount = select.options.length;

    if (optionCount === 0) {
      return;
    }

    select.selectedIndex = (select.selectedIndex + direction + optionCount) % optionCount;
    select.value = select.options[select.selectedIndex]?.value ?? select.value;
    this.updatePreview();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private cyclePreviewDirection(direction: -1 | 1): void {
    this.previewDirectionIndex =
      (this.previewDirectionIndex + direction + PREVIEW_DIRECTIONS.length) %
      PREVIEW_DIRECTIONS.length;
    this.updatePreview();
  }
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase("en-US")}${part.slice(1)}`)
    .join(" ");
}
