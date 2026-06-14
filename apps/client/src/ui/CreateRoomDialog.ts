import { ROOM_CREATION_COST } from "@tilezo/protocol";
import type { CreateRoomRequest, RoomTemplateSummary } from "../rooms/RoomClient";

type CreateRoomDialogOptions = {
  onSubmit: (room: CreateRoomRequest) => void;
  onCancel: () => void;
};

export class CreateRoomDialog {
  readonly element = document.createElement("section");

  private readonly form = document.createElement("form");
  private readonly message = document.createElement("p");
  private readonly costDisplay = document.createElement("p");
  private readonly nameInput = document.createElement("input");
  private readonly descriptionInput = document.createElement("input");
  private readonly templateSelect = document.createElement("select");
  private readonly visibilitySelect = document.createElement("select");
  private readonly accessSelect = document.createElement("select");
  private readonly capacityInput = document.createElement("input");
  private readonly doorSelect = document.createElement("select");
  private readonly submitButton = document.createElement("button");
  private templates: RoomTemplateSummary[] = [];

  constructor(private readonly options: CreateRoomDialogOptions) {
    const header = document.createElement("header");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const actions = document.createElement("div");
    const cancel = document.createElement("button");

    this.element.className = "create-room-panel hidden";
    header.className = "login-header";
    this.form.className = "create-room-form";
    this.message.className = "login-message";
    actions.className = "character-actions";

    title.textContent = "Create room";
    subtitle.textContent = "Choose a Tilezo layout and basic access settings.";
    this.costDisplay.className = "room-cost";
    header.append(title, subtitle, this.costDisplay);

    this.nameInput.type = "text";
    this.nameInput.maxLength = 40;
    this.nameInput.required = true;

    this.descriptionInput.type = "text";
    this.descriptionInput.maxLength = 160;

    this.templateSelect.required = true;
    this.templateSelect.addEventListener("change", () => this.syncTemplateOptions());

    this.visibilitySelect.append(option("public", "Public"), option("private", "Private"));

    this.accessSelect.append(option("open", "Open"), option("knock", "Knock only"));

    this.capacityInput.type = "number";
    this.capacityInput.min = "2";
    this.capacityInput.max = "50";
    this.capacityInput.step = "1";
    this.capacityInput.required = true;

    this.doorSelect.required = true;

    this.submitButton.type = "submit";
    this.submitButton.className = "primary-button create-room-submit";
    this.submitButton.textContent = "Create";

    cancel.type = "button";
    cancel.className = "secondary-button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      this.hide();
      this.options.onCancel();
    });

    actions.append(this.submitButton, cancel);
    this.form.append(
      field("Name", this.nameInput),
      field("Description", this.descriptionInput),
      field("Layout", this.templateSelect),
      field("Visibility", this.visibilitySelect),
      field("Access", this.accessSelect),
      field("Capacity", this.capacityInput),
      field("Entrance", this.doorSelect),
      actions,
    );
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit();
    });

    this.element.append(header, this.message, this.form);
  }

  show(templates: RoomTemplateSummary[], balance: number): void {
    this.templates = templates;
    this.message.classList.remove("visible");
    this.message.textContent = "";
    this.costDisplay.textContent = `Room cost: $${ROOM_CREATION_COST.toString()} — Your balance: $${balance.toString()}`;
    this.submitButton.disabled = balance < ROOM_CREATION_COST;
    this.templateSelect.replaceChildren(
      ...templates.map((template) => option(template.id, template.name)),
    );
    this.templateSelect.value = templates[0]?.id ?? "";
    this.nameInput.value = "";
    this.descriptionInput.value = "";
    this.visibilitySelect.value = "public";
    this.accessSelect.value = "open";
    this.syncTemplateOptions();
    this.element.classList.remove("hidden");
    this.nameInput.focus();
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  showError(message: string): void {
    this.message.textContent = message;
    this.message.classList.add("visible");
  }

  private submit(): void {
    const template = this.currentTemplate();
    const name = this.nameInput.value.trim();

    if (!template || !name) {
      this.showError("Choose a layout and name the room");
      return;
    }

    const defaultDoorY = template.doorOptions[0]?.y ?? 0;

    this.options.onSubmit({
      name,
      description: this.descriptionInput.value.trim(),
      templateId: template.id,
      visibility: this.visibilitySelect.value === "private" ? "private" : "public",
      access: this.accessSelect.value === "knock" ? "knock" : "open",
      capacity: Number(this.capacityInput.value || template.defaultCapacity),
      doorY: Number(this.doorSelect.value || defaultDoorY),
    });
  }

  private syncTemplateOptions(): void {
    const template = this.currentTemplate();

    if (!template) {
      this.capacityInput.value = "";
      this.doorSelect.replaceChildren();
      return;
    }

    this.capacityInput.value = String(template.defaultCapacity);
    this.doorSelect.replaceChildren(
      ...template.doorOptions.map((door) => option(String(door.y), door.label)),
    );
    this.doorSelect.value = String(template.doorOptions[0]?.y ?? 0);
  }

  private currentTemplate(): RoomTemplateSummary | undefined {
    return this.templates.find((template) => template.id === this.templateSelect.value);
  }
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  const span = document.createElement("span");

  label.className = "field";
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}
