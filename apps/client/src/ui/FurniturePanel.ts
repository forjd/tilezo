import { FURNITURE_DEFINITIONS, getFurnitureDefinition, type RoomItem } from "@tilezo/protocol";
import type { FurnitureEditMode } from "../game/RoomScene";

type FurniturePanelOptions = {
  onModeChange: (mode?: FurnitureEditMode) => void;
  onPickup: (itemId: string) => void;
};

export class FurniturePanel {
  readonly element = document.createElement("section");
  private readonly itemSelect = document.createElement("select");
  private readonly rotateButton = document.createElement("button");
  private readonly placeButton = document.createElement("button");
  private readonly closeButton = document.createElement("button");
  private readonly itemList = document.createElement("div");
  private readonly emptyMessage = document.createElement("p");
  private items: RoomItem[] = [];
  private canEdit = false;
  private rotation = 0;
  private selectedMoveItemId?: string;

  constructor(private readonly options: FurniturePanelOptions) {
    const header = document.createElement("header");
    const title = document.createElement("h2");
    const controls = document.createElement("div");
    const actions = document.createElement("div");

    this.element.className = "furniture-panel hidden";
    header.className = "room-browser-header";
    controls.className = "furniture-controls";
    actions.className = "furniture-actions";
    this.itemList.className = "furniture-list";
    this.emptyMessage.className = "room-list-empty";

    title.textContent = "Furniture";
    this.closeButton.type = "button";
    this.closeButton.className = "room-browser-close secondary-button";
    this.closeButton.textContent = "Close";
    this.itemSelect.className = "furniture-select";
    this.rotateButton.type = "button";
    this.rotateButton.className = "secondary-button furniture-rotate-button";
    this.rotateButton.textContent = "Rotate";
    this.placeButton.type = "button";
    this.placeButton.className = "primary-button furniture-place-button";
    this.placeButton.textContent = "Place";
    this.emptyMessage.textContent = "No furniture placed.";

    for (const definition of FURNITURE_DEFINITIONS) {
      const option = document.createElement("option");
      option.value = definition.id;
      option.textContent = definition.name;
      this.itemSelect.append(option);
    }

    this.itemSelect.addEventListener("change", () => {
      this.selectedMoveItemId = undefined;
      this.emitPlaceMode();
    });
    this.rotateButton.addEventListener("click", () => {
      this.rotation = (this.rotation + 1) % 4;
      this.emitCurrentMode();
    });
    this.placeButton.addEventListener("click", () => {
      this.selectedMoveItemId = undefined;
      this.emitPlaceMode();
    });
    this.closeButton.addEventListener("click", () => this.hide());

    actions.append(this.itemSelect, this.rotateButton, this.placeButton);
    controls.append(actions, this.itemList);
    header.append(title, this.closeButton);
    this.element.append(header, controls);
    this.renderItems();
  }

  show(): void {
    if (!this.canEdit) {
      return;
    }

    this.element.classList.remove("hidden");
    this.emitCurrentMode();
  }

  hide(): void {
    this.element.classList.add("hidden");
    this.options.onModeChange(undefined);
  }

  setCanEdit(canEdit: boolean): void {
    this.canEdit = canEdit;

    if (!canEdit) {
      this.hide();
    }
  }

  setItems(items: readonly RoomItem[]): void {
    this.items = items.map((item) => ({ ...item, state: { ...item.state } }));
    this.renderItems();

    if (
      this.selectedMoveItemId &&
      !this.items.some((item) => item.id === this.selectedMoveItemId)
    ) {
      this.selectedMoveItemId = undefined;
      this.emitPlaceMode();
    }
  }

  private renderItems(): void {
    this.itemList.replaceChildren();

    if (this.items.length === 0) {
      this.itemList.append(this.emptyMessage);
      return;
    }

    for (const item of this.items) {
      this.itemList.append(this.createItemRow(item));
    }
  }

  private createItemRow(item: RoomItem): HTMLElement {
    const definition = getFurnitureDefinition(item.itemType);
    const row = document.createElement("article");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    const position = document.createElement("span");
    const actions = document.createElement("div");
    const moveButton = document.createElement("button");
    const pickupButton = document.createElement("button");

    row.className =
      item.id === this.selectedMoveItemId ? "furniture-item selected" : "furniture-item";
    details.className = "furniture-item-details";
    actions.className = "furniture-item-actions";
    moveButton.type = "button";
    moveButton.className = "secondary-button furniture-item-action";
    moveButton.textContent = "Move";
    pickupButton.type = "button";
    pickupButton.className = "secondary-button furniture-item-action";
    pickupButton.textContent = "Pick up";
    name.textContent = definition?.name ?? item.itemType;
    position.textContent = `${item.x}, ${item.y}`;

    moveButton.addEventListener("click", () => {
      this.selectedMoveItemId = item.id;
      this.rotation = item.rotation;
      this.emitMoveMode(item.id);
      this.renderItems();
    });
    pickupButton.addEventListener("click", () => {
      this.options.onPickup(item.id);
    });

    details.append(name, position);
    actions.append(moveButton, pickupButton);
    row.append(details, actions);
    return row;
  }

  private emitCurrentMode(): void {
    if (this.selectedMoveItemId) {
      this.emitMoveMode(this.selectedMoveItemId);
      return;
    }

    this.emitPlaceMode();
  }

  private emitPlaceMode(): void {
    this.options.onModeChange({
      type: "place",
      itemType: this.itemSelect.value || FURNITURE_DEFINITIONS[0].id,
      rotation: this.rotation,
    });
  }

  private emitMoveMode(itemId: string): void {
    this.options.onModeChange({
      type: "move",
      itemId,
      rotation: this.rotation,
    });
  }
}
