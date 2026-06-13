import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { FriendsPanel } from "./FriendsPanel";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

describe("FriendsPanel", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("adds friends and refreshes when shown", () => {
    installDocument();
    const added: string[] = [];
    let refreshes = 0;
    const panel = new FriendsPanel({
      onAdd(username) {
        added.push(username);
      },
      onJoinRoom() {},
      onMessage() {},
      onRefresh() {
        refreshes += 1;
      },
      onRemove() {},
    });

    panel.show();
    const form = panel.element.children[1] as unknown as FakeElement;
    const input = form.children[0] as FakeElement;
    input.value = " Kai ";
    form.dispatch("submit", { preventDefault() {} });

    expect(panel.element.classList.contains("hidden")).toBe(false);
    expect(refreshes).toBe(1);
    expect(added).toEqual(["Kai"]);
    expect(input.value).toBe("");
  });

  test("renders friends and routes join/message/remove actions", () => {
    installDocument();
    const joined: string[] = [];
    const messaged: string[] = [];
    const removed: string[] = [];
    const panel = new FriendsPanel({
      onAdd() {},
      onJoinRoom(roomId) {
        joined.push(roomId);
      },
      onMessage(friend) {
        messaged.push(friend.id);
      },
      onRefresh() {},
      onRemove(friendId) {
        removed.push(friendId);
      },
    });

    panel.setFriends([
      {
        id: "user_2",
        username: "Kai",
        appearance: DEFAULT_AVATAR_APPEARANCE,
        online: true,
        roomId: "studio",
        canJoinRoom: true,
      },
    ]);

    const item = getList(panel).children[0];
    const details = item?.children[1];
    const actions = item?.children[2];

    expect(item?.className).toBe("friend-item online");
    expect(details?.children[0]?.textContent).toBe("Kai");
    expect(details?.children[1]?.textContent).toBe("online in studio");

    (actions?.children[0] as FakeElement | undefined)?.dispatch("click", {});
    (actions?.children[1] as FakeElement | undefined)?.dispatch("click", {});
    (actions?.children[2] as FakeElement | undefined)?.dispatch("click", {});

    expect(joined).toEqual(["studio"]);
    expect(messaged).toEqual(["user_2"]);
    expect(removed).toEqual(["user_2"]);
  });
});

function getList(panel: FriendsPanel): FakeElement {
  return panel.element.children[3] as unknown as FakeElement;
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

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList(this);
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly style = { setProperty() {} };
  readonly attributes = new Map<string, string>();
  autocomplete = "";
  className = "";
  disabled = false;
  name = "";
  parentElement?: FakeElement;
  placeholder = "";
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
    if (selector === "button[data-room-id]" && this.tagName === "button" && this.dataset.roomId) {
      return this;
    }

    if (
      selector === "button[data-friend-id]" &&
      this.tagName === "button" &&
      this.dataset.friendId
    ) {
      return this;
    }

    if (
      selector === "button[data-message-friend-id]" &&
      this.tagName === "button" &&
      this.dataset.messageFriendId
    ) {
      return this;
    }

    return this.parentElement?.closest(selector);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
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
