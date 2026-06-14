import {
  FURNITURE_DEFINITIONS,
  getFurnitureDefinition,
  type InventoryItem,
  type RoomItem,
} from "@tilezo/protocol";
import type { FurnitureEditMode } from "../game/RoomScene";

type FurniturePanelOptions = {
  onModeChange: (mode?: FurnitureEditMode) => void;
  onPickup: (itemId: string) => void;
  onBuy: (itemType: string) => Promise<void> | void;
  inventory: InventoryItem[];
};

export class FurniturePanel {
  readonly element = document.createElement("section");
  private readonly itemSelect = document.createElement("select");
  private readonly rotateButton = document.createElement("button");
  private readonly placeButton = document.createElement("button");
  private readonly buyButton = document.createElement("button");
  private readonly closeButton = document.createElement("button");
  private readonly itemList = document.createElement("div");
  private readonly emptyMessage = document.createElement("p");
  private readonly message = document.createElement("p");
  private items: RoomItem[] = [];
  private inventory: Map<string, number>;
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
    this.message.className = "furniture-message";

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
    this.buyButton.type = "button";
    this.buyButton.className = "primary-button furniture-buy-button";
    this.emptyMessage.textContent = "No furniture placed.";

    this.inventory = this.buildInventoryMap(options.inventory);
    this.populateItemSelect();

    this.itemSelect.addEventListener("change", () => {
      this.selectedMoveItemId = undefined;
      this.clearMessage();
      this.syncControls();
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
    this.buyButton.addEventListener("click", () => {
      void this.buySelected();
    });
    this.closeButton.addEventListener("click", () => this.hide());

    actions.append(this.itemSelect, this.rotateButton, this.placeButton, this.buyButton);
    controls.append(this.message, actions, this.itemList);
    header.append(title, this.closeButton);
    this.element.append(header, controls);
    this.renderItems();
    this.syncControls();
  }

  show(): void {
    if (!this.canEdit) {
      return;
    }

    this.element.classList.remove("hidden");
    this.syncControls();
    this.emitCurrentMode();
  }

  hide(): void {
    this.element.classList.add("hidden");
    this.clearMessage();
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

  setInventory(inventory: InventoryItem[]): void {
    this.inventory = this.buildInventoryMap(inventory);
    this.populateItemSelect();
    this.syncControls();

    if (!this.element.classList.contains("hidden") && !this.selectedMoveItemId) {
      this.emitPlaceMode();
    }
  }

  private buildInventoryMap(inventory: InventoryItem[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of inventory) {
      map.set(item.itemType, item.quantity);
    }
    return map;
  }

  private populateItemSelect(): void {
    const selectedValue = this.itemSelect.value;
    this.itemSelect.replaceChildren();

    for (const definition of FURNITURE_DEFINITIONS) {
      const option = document.createElement("option");
      option.value = definition.id;
      const owned = this.inventory.get(definition.id) ?? 0;
      option.textContent = `${definition.name} ($${definition.price.toString()}) — owned: ${owned.toString()}`;
      this.itemSelect.append(option);
    }

    const stillAvailable = FURNITURE_DEFINITIONS.some((d) => d.id === selectedValue);
    this.itemSelect.value = stillAvailable ? selectedValue : (FURNITURE_DEFINITIONS[0]?.id ?? "");
  }

  private syncControls(): void {
    const definition = getFurnitureDefinition(this.itemSelect.value);
    const owned = definition ? (this.inventory.get(definition.id) ?? 0) : 0;

    this.placeButton.disabled = owned === 0;
    this.placeButton.textContent = `Place (${owned.toString()})`;
    this.buyButton.textContent = definition ? `Buy $${definition.price.toString()}` : "Buy";
    this.buyButton.disabled = false;
  }

  private async buySelected(): Promise<void> {
    const itemType = this.itemSelect.value;
    const definition = getFurnitureDefinition(itemType);

    if (!definition) {
      return;
    }

    this.clearMessage();
    this.buyButton.disabled = true;
    try {
      await this.options.onBuy(itemType);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : "Purchase failed");
    } finally {
      this.buyButton.disabled = false;
    }
  }

  private showMessage(message: string): void {
    this.message.textContent = message;
    this.message.classList.add("visible");
  }

  private clearMessage(): void {
    this.message.textContent = "";
    this.message.classList.remove("visible");
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
    const definition = getFurnitureDefinition(this.itemSelect.value);
    const owned = definition ? (this.inventory.get(definition.id) ?? 0) : 0;

    if (owned === 0) {
      this.options.onModeChange(undefined);
      return;
    }

    this.options.onModeChange({
      type: "place",
      itemType: definition?.id ?? FURNITURE_DEFINITIONS[0].id,
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
