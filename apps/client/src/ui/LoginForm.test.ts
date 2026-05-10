import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_ROOM_ID } from "../assets";
import { LoginForm } from "./LoginForm";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("LoginForm", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("renders default fields and hides on request", () => {
    installDocument();
    const form = new LoginForm(() => {});
    const { username, roomId } = getFields(form);

    expect(form.element.className).toBe("login-panel");
    expect(username.maxLength).toBe(24);
    expect(username.required).toBe(true);
    expect(username.placeholder).toBe("dan");
    expect(roomId.maxLength).toBe(64);
    expect(roomId.required).toBe(true);
    expect(roomId.value).toBe(DEFAULT_ROOM_ID);

    form.hide();

    expect(form.element.classList.contains("hidden")).toBe(true);
  });

  test("submits trimmed login values", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, roomId } = getFields(form);
    const event = new FakeSubmitEvent();

    username.value = "  Dan  ";
    roomId.value = "  studio  ";
    element.dispatch("submit", event);

    expect(event.defaultPrevented).toBe(true);
    expect(submissions).toEqual([{ username: "Dan", roomId: "studio" }]);
  });

  test("ignores blank usernames and room IDs", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, roomId } = getFields(form);

    username.value = " ";
    roomId.value = "lobby";
    element.dispatch("submit", new FakeSubmitEvent());
    username.value = "Dan";
    roomId.value = " ";
    element.dispatch("submit", new FakeSubmitEvent());

    expect(submissions).toEqual([]);
  });
});

function getFields(form: LoginForm): {
  element: FakeElement;
  username: FakeElement;
  roomId: FakeElement;
} {
  const element = form.element.children[2] as unknown as FakeElement;
  const usernameLabel = element.children[0];
  const roomLabel = element.children[1];

  return {
    element,
    username: usernameLabel?.children[1] as FakeElement,
    roomId: roomLabel?.children[1] as FakeElement,
  };
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
  preventDefault?: () => void;
};

class FakeSubmitEvent {
  defaultPrevented = false;

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  autocomplete = "";
  className = "";
  maxLength = 0;
  placeholder = "";
  required = false;
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
