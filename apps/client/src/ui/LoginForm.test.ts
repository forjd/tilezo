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
    const { username, password, roomId, loginModeButton, registerModeButton, button } =
      getFields(form);

    expect(form.element.className).toBe("login-panel");
    expect(username.maxLength).toBe(24);
    expect(username.required).toBe(true);
    expect(username.placeholder).toBe("dan");
    expect(password.required).toBe(true);
    expect(password.type).toBe("password");
    expect(roomId.maxLength).toBe(64);
    expect(roomId.required).toBe(true);
    expect(roomId.value).toBe(DEFAULT_ROOM_ID);
    expect(loginModeButton.classList.contains("active")).toBe(true);
    expect(registerModeButton.classList.contains("active")).toBe(false);
    expect(button.textContent).toBe("Enter room");

    form.hide();

    expect(form.element.classList.contains("hidden")).toBe(true);
  });

  test("submits trimmed login values with password and mode", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, password, roomId, registerModeButton, button } = getFields(form);
    const event = new FakeSubmitEvent();

    username.value = "  Dan  ";
    password.value = "  secret phrase  ";
    roomId.value = "  studio  ";
    registerModeButton.dispatch("click", {});
    element.dispatch("submit", event);

    expect(event.defaultPrevented).toBe(true);
    expect(button.textContent).toBe("Create and enter");
    expect(submissions).toEqual([
      { mode: "register", username: "Dan", password: "secret phrase", roomId: "studio" },
    ]);
  });

  test("shows and clears inline errors", () => {
    installDocument();
    const form = new LoginForm(() => {});
    const { message } = getFields(form);

    form.showError("Invalid username or password");

    expect(message.textContent).toBe("Invalid username or password");
    expect(message.classList.contains("visible")).toBe(true);

    form.clearError();

    expect(message.textContent).toBe("");
    expect(message.classList.contains("visible")).toBe(false);
  });

  test("ignores blank usernames, passwords, and room IDs", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, password, roomId } = getFields(form);

    username.value = " ";
    password.value = "password";
    roomId.value = "lobby";
    element.dispatch("submit", new FakeSubmitEvent());
    username.value = "Dan";
    password.value = " ";
    roomId.value = "lobby";
    element.dispatch("submit", new FakeSubmitEvent());
    username.value = "Dan";
    password.value = "password";
    roomId.value = " ";
    element.dispatch("submit", new FakeSubmitEvent());

    expect(submissions).toEqual([]);
  });
});

function getFields(form: LoginForm): {
  element: FakeElement;
  username: FakeElement;
  password: FakeElement;
  roomId: FakeElement;
  loginModeButton: FakeElement;
  registerModeButton: FakeElement;
  button: FakeElement;
  message: FakeElement;
} {
  const element = form.element.children[2] as unknown as FakeElement;
  const modeGroup = element.children[0];
  const usernameLabel = element.children[1];
  const passwordLabel = element.children[2];
  const roomLabel = element.children[3];

  return {
    element,
    username: usernameLabel?.children[1] as FakeElement,
    password: passwordLabel?.children[1] as FakeElement,
    roomId: roomLabel?.children[1] as FakeElement,
    loginModeButton: modeGroup?.children[0] as FakeElement,
    registerModeButton: modeGroup?.children[1] as FakeElement,
    button: element.children[4] as FakeElement,
    message: form.element.children[1] as unknown as FakeElement,
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
  ariaPressed = "";

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

  setAttribute(name: string, value: string): void {
    if (name === "aria-pressed") {
      this.ariaPressed = value;
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
