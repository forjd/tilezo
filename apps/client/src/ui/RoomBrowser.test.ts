import { afterEach, describe, expect, test } from "bun:test";
import type { PublicRoomSummary } from "@tilezo/protocol";
import { RoomBrowser } from "./RoomBrowser";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("RoomBrowser", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("starts hidden and refreshes when shown", () => {
    installDocument();
    let refreshes = 0;
    const browser = new RoomBrowser({
      onJoin() {},
      onRefresh() {
        refreshes += 1;
      },
    });

    expect(browser.element.className).toBe("room-browser hidden");
    expect(getList(browser).children[0]?.textContent).toBe("No rooms available");

    browser.show();

    expect(browser.element.classList.contains("hidden")).toBe(false);
    expect(refreshes).toBe(1);

    browser.hide();

    expect(browser.element.classList.contains("hidden")).toBe(true);
  });

  test("renders public rooms and joins a selected room", () => {
    installDocument();
    const joined: string[] = [];
    const browser = new RoomBrowser({
      onJoin(roomId) {
        joined.push(roomId);
      },
      onRefresh() {},
    });
    const rooms: PublicRoomSummary[] = [
      { id: "lobby", name: "Lobby", userCount: 2, joined: false },
      { id: "studio", name: "Studio", userCount: 1, joined: false },
    ];

    browser.setCurrentRoom("studio");
    browser.setRooms(rooms);

    const lobby = getList(browser).children[0];
    const studio = getList(browser).children[1];

    expect(lobby?.children[0]?.children[0]?.textContent).toBe("Lobby");
    expect(lobby?.children[0]?.children[1]?.textContent).toBe("lobby");
    expect(lobby?.children[1]?.textContent).toBe("2 inside");
    expect(lobby?.children[2]?.textContent).toBe("Join");
    expect((lobby?.children[2] as FakeElement | undefined)?.disabled).toBe(false);
    expect(studio?.className).toBe("room-item joined");
    expect(studio?.children[2]?.textContent).toBe("Current");
    expect((studio?.children[2] as FakeElement | undefined)?.disabled).toBe(true);

    (lobby?.children[2] as FakeElement | undefined)?.dispatch("click", {});

    expect(joined).toEqual(["lobby"]);
  });
});

function getList(browser: RoomBrowser): FakeElement {
  return browser.element.children[1] as unknown as FakeElement;
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

type FakeEvent = Record<string, never>;

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  className = "";
  disabled = false;
  textContent = "";
  type = "";

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: FakeEvent): void {
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
