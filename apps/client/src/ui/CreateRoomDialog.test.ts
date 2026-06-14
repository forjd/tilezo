import { afterEach, describe, expect, test } from "bun:test";
import type { CreateRoomRequest, RoomTemplateSummary } from "../rooms/RoomClient";
import { CreateRoomDialog } from "./CreateRoomDialog";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("CreateRoomDialog", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("renders templates and submits room settings", () => {
    installDocument();
    const submissions: CreateRoomRequest[] = [];
    const dialog = new CreateRoomDialog({
      onSubmit(room) {
        submissions.push(room);
      },
      onCancel() {},
    });
    const templates: RoomTemplateSummary[] = [
      {
        id: "compact-studio",
        name: "Compact Studio",
        width: 7,
        height: 7,
        defaultCapacity: 20,
        doorOptions: [
          { label: "Top entrance", y: 1 },
          { label: "Middle entrance", y: 3 },
        ],
      },
    ];

    dialog.show(templates, 500);
    const fields = getFields(dialog);
    fields.name.value = "  Tile Lab  ";
    fields.description.value = " Build space ";
    fields.visibility.value = "private";
    fields.access.value = "knock";
    fields.capacity.value = "12";
    fields.door.value = "3";
    fields.form.dispatch("submit", new FakeSubmitEvent());

    expect(dialog.element.classList.contains("hidden")).toBe(false);
    expect(fields.template.children[0]?.textContent).toBe("Compact Studio");
    expect(fields.capacity.value).toBe("12");
    expect(submissions).toEqual([
      {
        name: "Tile Lab",
        description: "Build space",
        templateId: "compact-studio",
        visibility: "private",
        access: "knock",
        capacity: 12,
        doorY: 3,
      },
    ]);
  });

  test("shows validation errors and hides on cancel", () => {
    installDocument();
    let cancelled = false;
    const dialog = new CreateRoomDialog({
      onSubmit() {},
      onCancel() {
        cancelled = true;
      },
    });

    dialog.show(
      [
        {
          id: "compact-studio",
          name: "Compact Studio",
          width: 7,
          height: 7,
          defaultCapacity: 20,
          doorOptions: [{ label: "Middle entrance", y: 3 }],
        },
      ],
      500,
    );
    const fields = getFields(dialog);
    fields.form.dispatch("submit", new FakeSubmitEvent());

    expect(fields.message.textContent).toBe("Choose a layout and name the room");
    expect(fields.message.classList.contains("visible")).toBe(true);

    fields.cancel.dispatch("click", {});

    expect(cancelled).toBe(true);
    expect(dialog.element.classList.contains("hidden")).toBe(true);
  });

  test("displays cost and balance and disables submit when funds are insufficient", () => {
    installDocument();
    const submissions: CreateRoomRequest[] = [];
    const dialog = new CreateRoomDialog({
      onSubmit(room) {
        submissions.push(room);
      },
      onCancel() {},
    });
    const templates: RoomTemplateSummary[] = [
      {
        id: "compact-studio",
        name: "Compact Studio",
        width: 7,
        height: 7,
        defaultCapacity: 20,
        doorOptions: [{ label: "Middle entrance", y: 3 }],
      },
    ];

    dialog.show(templates, 500);
    const fields = getFields(dialog);
    expect(fields.cost.textContent).toContain("Room cost: $100");
    expect(fields.cost.textContent).toContain("Your balance: $500");
    expect(fields.submit.disabled).toBe(false);

    dialog.show(templates, 50);
    expect(fields.cost.textContent).toContain("Your balance: $50");
    expect(fields.submit.disabled).toBe(true);
  });
});

function getFields(dialog: CreateRoomDialog): {
  form: FakeElement;
  message: FakeElement;
  cost: FakeElement;
  name: FakeElement;
  description: FakeElement;
  template: FakeElement;
  visibility: FakeElement;
  access: FakeElement;
  capacity: FakeElement;
  door: FakeElement;
  submit: FakeElement;
  cancel: FakeElement;
} {
  const header = dialog.element.children[0] as unknown as FakeElement;
  const message = dialog.element.children[1] as unknown as FakeElement;
  const form = dialog.element.children[2] as unknown as FakeElement;

  return {
    form,
    message,
    cost: header.children[2] as FakeElement,
    name: form.children[0]?.children[1] as FakeElement,
    description: form.children[1]?.children[1] as FakeElement,
    template: form.children[2]?.children[1] as FakeElement,
    visibility: form.children[3]?.children[1] as FakeElement,
    access: form.children[4]?.children[1] as FakeElement,
    capacity: form.children[5]?.children[1] as FakeElement,
    door: form.children[6]?.children[1] as FakeElement,
    submit: form.children[7]?.children[0] as FakeElement,
    cancel: form.children[7]?.children[1] as FakeElement,
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
  target?: FakeElement;
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
  className = "";
  disabled = false;
  max = "";
  maxLength = 0;
  min = "";
  parentElement?: FakeElement;
  required = false;
  step = "";
  textContent = "";
  title = "";
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

  private getClasses(): string[] {
    return this.element.className.split(" ").filter(Boolean);
  }

  private setClasses(classes: string[]): void {
    this.element.className = [...new Set(classes)].join(" ");
  }
}
