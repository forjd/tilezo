import { afterEach, describe, expect, test } from "bun:test";
import { DisconnectedDialog } from "./DisconnectedDialog";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("DisconnectedDialog", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("shows retry countdown state and triggers actions", () => {
    installDocument();
    const actions: string[] = [];
    const dialog = new DisconnectedDialog({
      onRetry() {
        actions.push("retry");
      },
      onReturnToLobby() {
        actions.push("lobby");
      },
    });

    dialog.showDisconnected("The room connection dropped.", 5);

    expect(dialog.element.classList.contains("hidden")).toBe(false);
    expect(dialog.element.children[0]?.children[0]?.textContent).toBe("Connection paused");
    expect(dialog.element.children[1]?.textContent).toBe("The room connection dropped.");
    expect(dialog.element.children[2]?.textContent).toBe("Retrying in 5s");

    dialog.setCountdown(0);

    expect(dialog.element.children[2]?.textContent).toBe("Retrying now...");

    const actionsElement = dialog.element.children[3] as unknown as FakeElement;
    actionsElement.children[0]?.dispatch("click", {});
    actionsElement.children[1]?.dispatch("click", {});

    expect(actions).toEqual(["retry", "lobby"]);
  });

  test("disables actions while reconnecting and can hide", () => {
    installDocument();
    const dialog = new DisconnectedDialog({
      onRetry() {},
      onReturnToLobby() {},
    });

    dialog.showRetrying("Reconnecting to room.");

    const actionsElement = dialog.element.children[3] as unknown as FakeElement;
    expect(dialog.element.children[0]?.children[0]?.textContent).toBe("Reconnecting");
    expect(dialog.element.children[1]?.textContent).toBe("Reconnecting to room.");
    expect(dialog.element.children[2]?.textContent).toBe("Checking the room server...");
    expect(actionsElement.children[0]?.disabled).toBe(true);
    expect(actionsElement.children[1]?.disabled).toBe(true);

    dialog.hide();

    expect(dialog.element.classList.contains("hidden")).toBe(true);
  });
});

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

type FakeEvent = {
  target?: FakeElement;
};

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  className = "";
  disabled = false;
  parentElement?: FakeElement;
  textContent = "";
  type = "";

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
    }

    this.children.push(...children);
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
