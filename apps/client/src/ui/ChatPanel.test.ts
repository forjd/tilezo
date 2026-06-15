import { afterEach, describe, expect, test } from "bun:test";
import { ChatPanel } from "./ChatPanel";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

describe("ChatPanel", () => {
  afterEach(() => {
    restoreDocument();
    restoreTimers();
  });

  test("starts hidden and becomes visible", () => {
    installDocument();
    const panel = new ChatPanel();
    const input = getInput(panel);

    expect(panel.element.className).toBe("chat-panel hidden");

    panel.show();

    expect(panel.element.classList.contains("hidden")).toBe(false);
    expect(input.focusCount).toBe(1);

    panel.hide();

    expect(panel.element.classList.contains("hidden")).toBe(true);
  });

  test("focuses the chat input only while visible", () => {
    installDocument();
    const panel = new ChatPanel();
    const input = getInput(panel);

    panel.focusInput();
    expect(input.focusCount).toBe(0);

    panel.show();
    panel.focusInput();

    expect(input.focusCount).toBe(2);
    expect(input.lastFocusOptions).toEqual({ preventScroll: true });
  });

  test("sends trimmed enter-key messages and clears the input", () => {
    installDocument();
    const panel = new ChatPanel();
    const sent: string[] = [];
    const input = getInput(panel);

    panel.onSend((text) => {
      sent.push(text);
      return undefined;
    });
    input.value = "  hello room  ";
    input.dispatch("keydown", { key: "Enter" });
    input.value = "   ";
    input.dispatch("keydown", { key: "Enter" });
    input.value = "ignored";
    input.dispatch("keydown", { key: "Escape" });

    expect(sent).toEqual(["hello room"]);
    expect(input.value).toBe("ignored");
  });

  test("keeps text when the send handler rejects the local send and disposes handlers", () => {
    installDocument();
    const panel = new ChatPanel();
    const input = getInput(panel);
    const statuses: boolean[] = [];
    const sent: string[] = [];

    panel.onSend((text) => {
      sent.push(text);
      return false;
    });
    panel.onTypingChange((isTyping) => statuses.push(isTyping));
    input.value = "  still here  ";
    input.dispatch("input", {});
    input.dispatch("keydown", { key: "Enter" });

    expect(input.value).toBe("  still here  ");
    expect(sent).toEqual(["still here"]);

    panel.dispose();
    input.value = "after dispose";
    input.dispatch("input", {});
    input.dispatch("keydown", { key: "Enter" });

    expect(sent).toEqual(["still here"]);
    expect(statuses).toEqual([true, false]);
  });

  test("emits typing status from input changes and message sends", () => {
    installDocument();
    const timers = installTimers();
    const panel = new ChatPanel();
    const statuses: boolean[] = [];
    const input = getInput(panel);

    panel.onTypingChange((isTyping) => statuses.push(isTyping));
    input.value = "h";
    input.dispatch("input", {});
    timers.at(-1)?.();
    input.value = "hi";
    input.dispatch("input", {});
    input.dispatch("keydown", { key: "Enter" });

    expect(statuses).toEqual([true, false, true, false]);
  });

  test("appends chat messages and scrolls the list", () => {
    installDocument();
    const panel = new ChatPanel();
    const list = getList(panel);
    list.scrollHeight = 120;

    panel.addMessage("Dan", "hello", new Date("2026-05-19T08:07:00.000Z"));

    const message = list.children[0];
    expect(message?.className).toBe("message");
    expect(message?.children[0]?.className).toBe("message-time");
    expect(message?.children[0]?.textContent).toMatch(/\d{2}:\d{2}/);
    expect(message?.children[1]?.textContent).toBe("Dan");
    expect(message?.children[2]?.textContent).toBe(": hello");
    expect(list.scrollTop).toBe(120);

    panel.clear();

    expect(list.children).toEqual([]);
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

function installTimers(): Array<() => void> {
  const timers: Array<() => void> = [];

  globalThis.setTimeout = ((callback: () => void) => {
    timers.push(callback);
    return timers.length;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

  return timers;
}

function restoreTimers(): void {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
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
  focusCount = 0;
  lastFocusOptions?: FocusOptions;

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

  focus(options?: FocusOptions): void {
    this.focusCount += 1;
    this.lastFocusOptions = options;
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
