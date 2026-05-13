import { afterEach, describe, expect, test } from "bun:test";
import { LoginForm } from "./LoginForm";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("LoginForm", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("renders default fields and hides on request", () => {
    installDocument();
    const form = new LoginForm(() => {});
    const { username, password, confirmPassword, loginModeButton, registerModeButton, button } =
      getFields(form);

    expect(form.element.className).toBe("login-panel");
    expect(username.maxLength).toBe(24);
    expect(username.required).toBe(true);
    expect(username.placeholder).toBe("");
    expect(password.required).toBe(true);
    expect(password.type).toBe("password");
    expect(confirmPassword.required).toBe(false);
    expect(confirmPassword.type).toBe("password");
    expect(confirmPassword.parentElement?.classList.contains("hidden")).toBe(true);
    expect(loginModeButton.classList.contains("active")).toBe(true);
    expect(registerModeButton.classList.contains("active")).toBe(false);
    expect(button.textContent).toBe("Continue");

    form.hide();

    expect(form.element.classList.contains("hidden")).toBe(true);
  });

  test("submits trimmed login values with password and mode", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, password, confirmPassword, registerModeButton, button } =
      getFields(form);
    const event = new FakeSubmitEvent();

    username.value = "  Dan  ";
    password.value = "  secret phrase  ";
    registerModeButton.dispatch("click", {});
    confirmPassword.value = "  secret phrase  ";
    element.dispatch("submit", event);

    expect(event.defaultPrevented).toBe(true);
    expect(button.textContent).toBe("Create account");
    expect(submissions).toEqual([{ mode: "register", username: "Dan", password: "secret phrase" }]);
  });

  test("requires matching password confirmation when creating accounts", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, password, confirmPassword, registerModeButton, message } =
      getFields(form);

    registerModeButton.dispatch("click", {});
    username.value = "Dan";
    password.value = "secret phrase";
    confirmPassword.value = "different phrase";
    element.dispatch("submit", new FakeSubmitEvent());

    expect(confirmPassword.required).toBe(true);
    expect(confirmPassword.parentElement?.classList.contains("hidden")).toBe(false);
    expect(message.textContent).toBe("Passwords do not match");
    expect(message.classList.contains("visible")).toBe(true);
    expect(submissions).toEqual([]);
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

  test("ignores blank usernames and passwords", () => {
    installDocument();
    const submissions: unknown[] = [];
    const form = new LoginForm((values) => submissions.push(values));
    const { element, username, password } = getFields(form);

    username.value = " ";
    password.value = "password";
    element.dispatch("submit", new FakeSubmitEvent());
    username.value = "Dan";
    password.value = " ";
    element.dispatch("submit", new FakeSubmitEvent());

    expect(submissions).toEqual([]);
  });
});

function getFields(form: LoginForm): {
  element: FakeElement;
  username: FakeElement;
  password: FakeElement;
  confirmPassword: FakeElement;
  loginModeButton: FakeElement;
  registerModeButton: FakeElement;
  button: FakeElement;
  message: FakeElement;
} {
  const element = form.element.children[2] as unknown as FakeElement;
  const modeGroup = element.children[0];
  const usernameLabel = element.children[1];
  const passwordLabel = element.children[2];
  const confirmPasswordLabel = element.children[3];

  return {
    element,
    username: usernameLabel?.children[1] as FakeElement,
    password: passwordLabel?.children[1] as FakeElement,
    confirmPassword: confirmPasswordLabel?.children[1] as FakeElement,
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
  parentElement?: FakeElement;

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
