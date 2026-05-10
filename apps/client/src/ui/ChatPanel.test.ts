import { afterEach, describe, expect, test } from "bun:test";
import { ChatPanel } from "./ChatPanel";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("ChatPanel", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("starts hidden and becomes visible", () => {
    installDocument();
    const panel = new ChatPanel();

    expect(panel.element.className).toBe("chat-panel hidden");

    panel.show();

    expect(panel.element.classList.contains("hidden")).toBe(false);
  });

  test("sends trimmed enter-key messages and clears the input", () => {
    installDocument();
    const panel = new ChatPanel();
    const sent: string[] = [];
    const input = getInput(panel);

    panel.onSend((text) => sent.push(text));
    input.value = "  hello room  ";
    input.dispatch("keydown", { key: "Enter" });
    input.value = "   ";
    input.dispatch("keydown", { key: "Enter" });
    input.value = "ignored";
    input.dispatch("keydown", { key: "Escape" });

    expect(sent).toEqual(["hello room"]);
    expect(input.value).toBe("ignored");
  });

  test("appends chat messages and scrolls the list", () => {
    installDocument();
    const panel = new ChatPanel();
    const list = getList(panel);
    list.scrollHeight = 120;

    panel.addMessage("Dan", "hello");

    const message = list.children[0];
    expect(message?.className).toBe("message");
    expect(message?.children[0]?.textContent).toBe("Dan");
    expect(message?.children[1]?.textContent).toBe(": hello");
    expect(list.scrollTop).toBe(120);
  });
});

function getList(panel: ChatPanel): FakeElement {
  return panel.element.children[0] as unknown as FakeElement;
}

function getInput(panel: ChatPanel): FakeElement {
  return panel.element.children[1] as unknown as FakeElement;
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

type FakeEvent = {
  key?: string;
};

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  autocomplete = "";
  className = "";
  maxLength = 0;
  placeholder = "";
  required = false;
  scrollHeight = 0;
  scrollTop = 0;
  textContent = "";
  type = "";
  value = "";

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
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
    this.setClasses(this.getClasses().filter((name) => name !== className));
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
