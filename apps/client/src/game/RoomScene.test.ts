import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE, type RoomSnapshotMessage } from "@tilezo/protocol";
import { type Application, Container } from "pixi.js";
import { RoomScene } from "./RoomScene";

describe("RoomScene", () => {
  test("loads snapshots and applies room membership updates", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.loadSnapshot(snapshot([user("user_1", "Dan", { x: 0, y: 0 })]));
    scene.handleServerMessage({
      type: "user.joined",
      user: user("user_2", "Ada", { x: 1, y: 0 }),
    });
    scene.handleServerMessage({ type: "user.left", userId: "user_1" });

    expect(sceneState(scene).avatars.has("user_1")).toBe(false);
    expect(sceneState(scene).avatars.has("user_2")).toBe(true);
  });

  test("updates avatars and recenters on resize", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.handleServerMessage(snapshot([user("user_1", "Dan", { x: 0, y: 0 })]));
    scene.handleServerMessage({
      type: "avatar.moved",
      userId: "user_1",
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    scene.update(0.18);
    app.screen.width = 1000;
    scene.resize();

    const avatar = sceneState(scene).avatars.get("user_1");
    const world = app.stage.children[0];
    expect(avatar?.view.x).toBe(16);
    expect(avatar?.view.y).toBe(8);
    expect(world?.x).toBe(500);
  });

  test("shows chat messages above the matching avatar", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.handleServerMessage(
      snapshot([user("user_1", "Dan", { x: 0, y: 0 }), user("user_2", "Ada", { x: 1, y: 0 })]),
    );
    scene.handleServerMessage({
      type: "chat.message",
      userId: "user_2",
      username: "Ada",
      text: "hi there",
      sentAt: "2026-05-11T12:00:00.000Z",
    });

    const avatars = sceneState(scene).avatars;
    expect(avatarState(avatars.get("user_1")).chatBubble.visible).toBe(false);
    expect(avatarState(avatars.get("user_2")).chatBubble.visible).toBe(true);
    expect(avatarState(avatars.get("user_2")).chatBubbleText.text).toBe("hi there");
  });

  test("requests movement only when clicking walkable tiles", () => {
    const app = createApp();
    const moves: unknown[] = [];
    let interactions = 0;
    const scene = new RoomScene(
      app,
      (target) => moves.push(target),
      () => {
        interactions += 1;
      },
    );

    scene.loadSnapshot(snapshot([]));
    app.canvas.mousedown({ clientX: 400, clientY: 120 });
    app.canvas.click({ clientX: 400, clientY: 120 });
    app.canvas.click({ clientX: 432, clientY: 120 });

    expect(moves).toEqual([{ x: 0, y: 0 }]);
    expect(app.canvas.defaultPrevented).toBe(true);
    expect(interactions).toBe(3);
  });

  test("updates and clears hover from pointer events", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.loadSnapshot(snapshot([]));
    app.canvas.mousemove({ clientX: 400, clientY: 120 });
    expect(sceneState(scene).hover).toEqual({ x: 0, y: 0 });

    app.canvas.mouseleave({});
    expect(sceneState(scene).hover).toBeUndefined();
  });
});

function snapshot(users: RoomSnapshotMessage["users"]): RoomSnapshotMessage {
  return {
    type: "room.snapshot",
    roomId: "lobby",
    users,
    tiles: [
      { x: 0, y: 0, z: 0, walkable: true },
      { x: 1, y: 0, z: 0, walkable: false },
    ],
  };
}

function user(
  id: string,
  username: string,
  position: RoomSnapshotMessage["users"][number]["position"],
): RoomSnapshotMessage["users"][number] {
  return {
    id,
    username,
    position,
    appearance: DEFAULT_AVATAR_APPEARANCE,
  };
}

type FakeApp = Application & {
  canvas: FakeCanvas;
  screen: { width: number; height: number };
  stage: Container;
};

function createApp(): FakeApp {
  const canvas = new FakeCanvas();
  return {
    canvas,
    screen: { width: 800, height: 600 },
    stage: new Container(),
  } as unknown as FakeApp;
}

function sceneState(scene: RoomScene): {
  avatars: Map<string, { view: Container }>;
  hover?: unknown;
} {
  return scene as unknown as {
    avatars: Map<string, { view: Container }>;
    hover?: unknown;
  };
}

function avatarState(avatar?: { view: Container }): {
  chatBubble: { visible: boolean };
  chatBubbleText: { text: string };
} {
  return avatar as unknown as {
    chatBubble: { visible: boolean };
    chatBubbleText: { text: string };
  };
}

class FakeCanvas {
  defaultPrevented = false;

  private readonly listeners = new Map<string, Set<(event: FakePointerEvent) => void>>();

  addEventListener(type: string, listener: (event: FakePointerEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }

  click(event: { clientX: number; clientY: number }): void {
    this.dispatch("click", event);
  }

  mousedown(event: { clientX: number; clientY: number }): void {
    this.dispatch("mousedown", {
      ...event,
      preventDefault: () => {
        this.defaultPrevented = true;
      },
    });
  }

  mousemove(event: { clientX: number; clientY: number }): void {
    this.dispatch("mousemove", event);
  }

  mouseleave(event: Record<string, never>): void {
    this.dispatch("mouseleave", event);
  }

  private dispatch(type: string, event: FakePointerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

type FakePointerEvent = {
  clientX?: number;
  clientY?: number;
  preventDefault?: () => void;
};
