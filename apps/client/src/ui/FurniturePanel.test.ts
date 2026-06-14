import { afterEach, describe, expect, test } from "bun:test";
import type { RoomItem } from "@tilezo/protocol";
import type { FurnitureEditMode } from "../game/RoomScene";
import { FurniturePanel } from "./FurniturePanel";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("FurniturePanel", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("gates editing, emits placement mode, and routes item actions", () => {
    installDocument();
    const modes: Array<FurnitureEditMode | undefined> = [];
    const pickups: string[] = [];
    const buys: string[] = [];
    const panel = new FurniturePanel({
      onModeChange(mode) {
        modes.push(mode);
      },
      onPickup(itemId) {
        pickups.push(itemId);
      },
      onBuy(itemType) {
        buys.push(itemType);
      },
      inventory: [{ itemType: "woven_rug", quantity: 1 }],
    });

    panel.show();
    expect(panel.element.classList.contains("hidden")).toBe(true);
    expect(modes).toEqual([]);

    panel.setCanEdit(true);
    panel.show();
    expect(panel.element.classList.contains("hidden")).toBe(false);
    expect(modes.at(-1)).toEqual({ type: "place", itemType: "woven_rug", rotation: 0 });

    getRotateButton(panel).dispatch("click", {});
    expect(modes.at(-1)).toEqual({ type: "place", itemType: "woven_rug", rotation: 1 });

    panel.setItems([roomItem]);
    const row = getItemList(panel).children[0];
    expect(row?.children[0]?.children[0]?.textContent).toBe("Crate Table");
    expect(row?.children[0]?.children[1]?.textContent).toBe("2, 1");

    const moveButton = row?.children[1]?.children[0];
    const pickupButton = row?.children[1]?.children[1];
    moveButton?.dispatch("click", {});
    expect(modes.at(-1)).toEqual({ type: "move", itemId: "item_1", rotation: 0 });

    pickupButton?.dispatch("click", {});
    expect(pickups).toEqual(["item_1"]);

    panel.hide();
    expect(panel.element.classList.contains("hidden")).toBe(true);
    expect(modes.at(-1)).toBeUndefined();
  });

  test("shows owned counts, disables place when none owned, and buys on click", () => {
    installDocument();
    const buys: string[] = [];
    const panel = new FurniturePanel({
      onModeChange() {},
      onPickup() {},
      onBuy(itemType) {
        buys.push(itemType);
      },
      inventory: [{ itemType: "woven_rug", quantity: 2 }],
    });

    panel.setCanEdit(true);
    panel.show();

    const options = getItemSelect(panel).children;
    expect(options[0]?.textContent).toContain("Woven Rug");
    expect(options[0]?.textContent).toContain("owned: 2");

    expect(getPlaceButton(panel).disabled).toBe(false);
    expect(getPlaceButton(panel).textContent).toBe("Place (2)");

    getBuyButton(panel).dispatch("click", {});
    expect(buys).toEqual(["woven_rug"]);
  });

  test("disables place and shows zero owned when inventory is empty", () => {
    installDocument();
    const panel = new FurniturePanel({
      onModeChange() {},
      onPickup() {},
      onBuy() {},
      inventory: [],
    });

    panel.setCanEdit(true);
    panel.show();

    expect(getPlaceButton(panel).disabled).toBe(true);
    expect(getPlaceButton(panel).textContent).toBe("Place (0)");
  });

  test("shows inline error when purchase fails", async () => {
    installDocument();
    const panel = new FurniturePanel({
      onModeChange() {},
      onPickup() {},
      onBuy: async () => {
        throw new Error("Not enough cash");
      },
      inventory: [],
    });

    panel.setCanEdit(true);
    panel.show();
    await getBuyButton(panel).dispatch("click", {});

    expect(getMessage(panel).textContent).toBe("Not enough cash");
    expect(getMessage(panel).classList.contains("visible")).toBe(true);
    expect(getBuyButton(panel).disabled).toBe(false);
  });
});

const roomItem: RoomItem = {
  id: "item_1",
  itemType: "crate_table",
  x: 2,
  y: 1,
  z: 0,
  rotation: 0,
  state: {},
};

function getRotateButton(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[1]?.children[1] as unknown as FakeElement;
}

function getItemList(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[2] as unknown as FakeElement;
}

function getItemSelect(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[1]?.children[0] as unknown as FakeElement;
}

function getPlaceButton(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[1]?.children[2] as unknown as FakeElement;
}

function getBuyButton(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[1]?.children[3] as unknown as FakeElement;
}

function getMessage(panel: FurniturePanel): FakeElement {
  return panel.element.children[1]?.children[0] as unknown as FakeElement;
}

function installDocument() {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tagName: string) {
        return new FakeElement(tagName);
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

type FakeEvent = { target?: FakeElement };

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  className = "";
  disabled = false;
  parentElement?: FakeElement;
  textContent = "";
  type = "";
  value = "";

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
    }

    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
    }

    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: FakeEvent): void {
    event.target ??= this;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
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
