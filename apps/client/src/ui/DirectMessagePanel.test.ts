import { afterEach, describe, expect, test } from "bun:test";
import type { DirectMessage } from "@tilezo/protocol/messages";
import { DirectMessagePanel } from "./DirectMessagePanel";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalPrompt = globalThis.prompt;

function dm(over: Partial<DirectMessage>): DirectMessage {
  return {
    type: "dm.message",
    id: "dm_1",
    fromUserId: "user_2",
    toUserId: "user_1",
    text: "hi",
    sentAt: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}

describe("DirectMessagePanel", () => {
  afterEach(() => {
    restoreDocument();
    globalThis.prompt = originalPrompt;
  });

  test("opens a conversation, renders history, and aligns own messages", () => {
    installDocument();
    const read: string[] = [];
    const panel = new DirectMessagePanel({
      onSend: () => undefined,
      onRead(friendId) {
        read.push(friendId);
      },
    });

    panel.open(
      { id: "user_2", username: "Kai" },
      [dm({ text: "hello" }), dm({ fromUserId: "user_1", text: "hey", readAt: "2026-06-13" })],
      "user_1",
    );

    expect(panel.element.classList.contains("hidden")).toBe(false);
    expect(panel.isOpenFor("user_2")).toBe(true);
    const list = panel.element.children[1] as unknown as FakeElement;
    expect(messageTexts(list)).toEqual(["hello", "hey"]);
    expect(list.children[0]?.className).toBe("dm-message dm-message-theirs");
    expect(list.children[1]?.className).toBe("dm-message dm-message-mine");
    expect(list.children[1]?.dataset.read).toBe("true");
    expect(read).toEqual(["user_2"]);
  });

  test("appends only messages that belong to the open conversation", () => {
    installDocument();
    const read: string[] = [];
    const panel = new DirectMessagePanel({
      onSend: () => undefined,
      onRead(friendId) {
        read.push(friendId);
      },
    });
    panel.open({ id: "user_2", username: "Kai" }, [], "user_1");
    const list = panel.element.children[1] as unknown as FakeElement;

    expect(panel.append(dm({ text: "live" }))).toBe(true);
    expect(panel.append(dm({ fromUserId: "user_3", toUserId: "user_1", text: "other" }))).toBe(
      false,
    );
    expect(messageTexts(list)).toEqual(["live"]);
    expect(read).toEqual(["user_2", "user_2"]);
  });

  test("sends the typed message for the open friend and clears the input", () => {
    installDocument();
    const sent: Array<{ friendId: string; text: string }> = [];
    const panel = new DirectMessagePanel({
      onSend(friendId, text) {
        sent.push({ friendId, text });
        return undefined;
      },
    });
    panel.open({ id: "user_2", username: "Kai" }, [], "user_1");

    const form = panel.element.children[3] as unknown as FakeElement;
    const input = form.children[0] as FakeElement;
    input.value = "  yo  ";
    form.dispatch("submit", { preventDefault() {} });

    expect(sent).toEqual([{ friendId: "user_2", text: "yo" }]);
    expect(input.value).toBe("");
  });

  test("keeps the typed message when local send fails", () => {
    installDocument();
    const panel = new DirectMessagePanel({
      onSend() {
        return false;
      },
    });
    panel.open({ id: "user_2", username: "Kai" }, [], "user_1");

    const form = panel.element.children[3] as unknown as FakeElement;
    const input = form.children[0] as FakeElement;
    input.value = "  try again  ";
    form.dispatch("submit", { preventDefault() {} });

    expect(input.value).toBe("  try again  ");
  });

  test("emits local typing changes and clears them after send", () => {
    installDocument();
    const typing: Array<{ friendId: string; isTyping: boolean }> = [];
    const panel = new DirectMessagePanel({
      onSend: () => undefined,
      onTypingChange(friendId, isTyping) {
        typing.push({ friendId, isTyping });
      },
    });
    panel.open({ id: "user_2", username: "Kai" }, [], "user_1");

    const form = panel.element.children[3] as unknown as FakeElement;
    const input = form.children[0] as FakeElement;
    input.value = "hey";
    input.dispatch("input", {});
    input.value = "hey there";
    input.dispatch("input", {});
    form.dispatch("submit", { preventDefault() {} });

    expect(typing).toEqual([
      { friendId: "user_2", isTyping: true },
      { friendId: "user_2", isTyping: false },
    ]);
  });

  test("shows incoming typing state for the open conversation", () => {
    installDocument();
    const panel = new DirectMessagePanel({ onSend: () => undefined });
    panel.open({ id: "user_2", username: "Kai" }, [], "user_1");
    const typingStatus = panel.element.children[2] as unknown as FakeElement;

    expect(panel.setFriendTyping("user_3", true)).toBe(false);
    expect(panel.setFriendTyping("user_2", true)).toBe(true);
    expect(typingStatus.textContent).toBe("Kai is typing");
    expect(typingStatus.classList.contains("visible")).toBe(true);

    expect(panel.append(dm({ text: "sent" }))).toBe(true);
    expect(typingStatus.textContent).toBe("");
    expect(typingStatus.classList.contains("visible")).toBe(false);
  });

  test("marks own messages read from receipts", () => {
    installDocument();
    const panel = new DirectMessagePanel({ onSend: () => undefined });
    panel.open(
      { id: "user_2", username: "Kai" },
      [dm({ id: "dm_own", fromUserId: "user_1", text: "hey" })],
      "user_1",
    );
    const list = panel.element.children[1] as unknown as FakeElement;

    expect(list.children[0]?.dataset.read).toBe("false");
    expect(panel.markRead(["dm_other"])).toBe(false);
    expect(panel.markRead(["dm_own"])).toBe(true);
    expect(list.children[0]?.dataset.read).toBe("true");
  });

  test("updates edited and deleted messages", () => {
    installDocument();
    const panel = new DirectMessagePanel({ onSend: () => undefined });
    panel.open(
      { id: "user_2", username: "Kai" },
      [dm({ id: "dm_own", fromUserId: "user_1", text: "first" })],
      "user_1",
    );
    const list = panel.element.children[1] as unknown as FakeElement;

    expect(panel.updateEdited({ id: "dm_own", text: "second", editedAt: "2026-06-13" })).toBe(true);
    expect(messageTexts(list)).toEqual(["second (edited)"]);
    expect(list.children[0]?.dataset.edited).toBe("true");

    expect(panel.markDeleted("dm_own")).toBe(true);
    expect(messageTexts(list)).toEqual(["Message deleted"]);
    expect(list.children[0]?.dataset.deleted).toBe("true");
    expect(list.children[0]?.classList.contains("dm-message-deleted")).toBe(true);
  });

  test("routes edit and delete message actions", () => {
    installDocument();
    const edited: Array<{ messageId: string; text: string }> = [];
    const deleted: string[] = [];
    globalThis.prompt = (() => "edited text") as typeof prompt;
    const panel = new DirectMessagePanel({
      onSend: () => undefined,
      onEdit(messageId, text) {
        edited.push({ messageId, text });
        return undefined;
      },
      onDelete(messageId) {
        deleted.push(messageId);
        return undefined;
      },
    });
    panel.open(
      { id: "user_2", username: "Kai" },
      [dm({ id: "dm_own", fromUserId: "user_1", text: "first" })],
      "user_1",
    );
    const list = panel.element.children[1] as unknown as FakeElement;
    const actions = list.children[0]?.children[1];

    (actions?.children[0] as FakeElement | undefined)?.dispatch("click", {});
    (actions?.children[1] as FakeElement | undefined)?.dispatch("click", {});

    expect(edited).toEqual([{ messageId: "dm_own", text: "edited text" }]);
    expect(deleted).toEqual(["dm_own"]);
  });
});

function messageTexts(list: FakeElement): string[] {
  return list.children.map((item) => item.children[0]?.textContent ?? "");
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

type FakeEvent = { preventDefault?: () => void; target?: FakeElement };

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList(this);
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  autocomplete = "";
  className = "";
  maxLength = 0;
  name = "";
  parentElement?: FakeElement;
  placeholder = "";
  scrollHeight = 0;
  scrollTop = 0;
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
    this.parentElement?.dispatch(type, event);
  }

  closest(selector: string): FakeElement | undefined {
    if (
      selector === "button[data-edit-message-id]" &&
      this.tagName === "button" &&
      this.dataset.editMessageId
    ) {
      return this;
    }

    if (
      selector === "button[data-delete-message-id]" &&
      this.tagName === "button" &&
      this.dataset.deleteMessageId
    ) {
      return this;
    }

    return this.parentElement?.closest(selector);
  }

  focus(): void {}
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

  toggle(className: string, force?: boolean): boolean {
    const hasClass = this.contains(className);
    const shouldAdd = force ?? !hasClass;

    if (shouldAdd && !hasClass) {
      this.add(className);
    } else if (!shouldAdd && hasClass) {
      this.remove(className);
    }

    return shouldAdd;
  }

  private getClasses(): string[] {
    return this.element.className.split(" ").filter(Boolean);
  }

  private setClasses(classes: string[]): void {
    this.element.className = [...new Set(classes)].join(" ");
  }
}
