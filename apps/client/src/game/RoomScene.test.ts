import { describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import type { RoomSnapshotMessage } from "@tilezo/protocol/messages";
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

  test("renders doorway avatar bodies behind walls while overlays stay above", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.loadSnapshot(snapshotWithDoor([user("user_1", "Dan", { x: -1, y: 2 })]));

    const world = app.stage.children[0];
    const state = sceneState(scene);
    const avatar = state.avatars.get("user_1");

    if (!avatar) {
      throw new Error("expected test avatar to be present");
    }

    expect(world?.children).toEqual([
      state.tiles.view,
      state.doorAvatarLayer,
      state.tiles.wallView,
      state.avatarLayer,
      state.avatarOverlayLayer,
    ]);
    expect(state.doorAvatarLayer.children).toContain(avatar.view);
    expect(state.avatarLayer.children).toHaveLength(0);
    expect(state.avatarOverlayLayer.children).toContain(avatar.overlayView);
  });

  test("moves doorway avatar bodies in front of walls after they enter the room", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.loadSnapshot(snapshotWithDoor([user("user_1", "Dan", { x: -1, y: 2 })]));
    scene.handleServerMessage({
      type: "avatar.moved",
      userId: "user_1",
      path: [
        { x: -1, y: 2 },
        { x: 0, y: 2 },
      ],
    });
    scene.update(0.36);

    const state = sceneState(scene);
    const avatar = state.avatars.get("user_1");

    if (!avatar) {
      throw new Error("expected test avatar to be present");
    }

    expect(state.avatarLayer.children).toContain(avatar.view);
    expect(state.doorAvatarLayer.children).toHaveLength(0);
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
    expect(world?.x).toBe(484);
    expect(world?.y).toBe(348);
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

  test("shows and clears typing indicators above the matching avatar", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.handleServerMessage(snapshot([user("user_1", "Dan", { x: 0, y: 0 })]));
    scene.handleServerMessage({
      type: "chat.typing",
      userId: "user_1",
      username: "Dan",
      isTyping: true,
    });

    const avatar = avatarState(sceneState(scene).avatars.get("user_1"));
    expect(avatar.typingIndicator.visible).toBe(true);

    scene.handleServerMessage({
      type: "chat.message",
      userId: "user_1",
      username: "Dan",
      text: "done",
      sentAt: "2026-05-11T12:00:00.000Z",
    });

    expect(avatar.typingIndicator.visible).toBe(false);
    expect(avatar.chatBubble.visible).toBe(true);
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
    app.canvas.mousedown({ clientX: 384, clientY: 348 });
    app.canvas.click({ clientX: 384, clientY: 348 });
    app.canvas.click({ clientX: 416, clientY: 364 });

    expect(moves).toEqual([{ x: 0, y: 0 }]);
    expect(app.canvas.defaultPrevented).toBe(true);
    expect(interactions).toBe(3);
  });

  test("updates and clears hover from pointer events", () => {
    const app = createApp();
    const scene = new RoomScene(app, () => {});

    scene.loadSnapshot(snapshot([]));
    app.canvas.mousemove({ clientX: 384, clientY: 348 });
    expect(sceneState(scene).hover).toEqual({ x: 0, y: 0 });

    app.canvas.mouseleave({});
    expect(sceneState(scene).hover).toBeUndefined();
  });

  test("pans the room without sending a movement click", () => {
    const app = createApp();
    const moves: unknown[] = [];
    const scene = new RoomScene(app, (target) => moves.push(target));

    scene.loadSnapshot(snapshot([]));
    app.canvas.mousedown({ clientX: 384, clientY: 348 });
    app.canvas.mousemove({ clientX: 420, clientY: 368 });
    app.canvas.mouseup({});
    app.canvas.click({ clientX: 420, clientY: 368 });

    const world = app.stage.children[0];
    expect(world?.x).toBe(420);
    expect(world?.y).toBe(368);
    expect(moves).toEqual([]);
  });

  test("zooms around the pointer and keeps tile picking aligned", () => {
    const app = createApp();
    const moves: unknown[] = [];
    const scene = new RoomScene(app, (target) => moves.push(target));

    scene.loadSnapshot(snapshot([]));
    app.canvas.wheel({ clientX: 384, clientY: 348, deltaY: -100 });
    app.canvas.click({ clientX: 384, clientY: 348 });

    const world = app.stage.children[0];
    expect(world?.scale.x).toBe(1.15);
    expect(world?.scale.y).toBe(1.15);
    expect(world?.x).toBe(384);
    expect(world?.y).toBe(348);
    expect(moves).toEqual([{ x: 0, y: 0 }]);
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

function snapshotWithDoor(users: RoomSnapshotMessage["users"]): RoomSnapshotMessage {
  return {
    type: "room.snapshot",
    roomId: "lobby",
    users,
    tiles: [
      { x: -1, y: 2, z: 0, walkable: true },
      { x: 0, y: 0, z: 0, walkable: true },
      { x: 0, y: 1, z: 0, walkable: true },
      { x: 0, y: 2, z: 0, walkable: true },
      { x: 1, y: 0, z: 0, walkable: true },
      { x: 1, y: 1, z: 0, walkable: true },
      { x: 1, y: 2, z: 0, walkable: true },
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
  avatars: Map<string, { overlayView: Container; view: Container }>;
  avatarLayer: Container;
  doorAvatarLayer: Container;
  avatarOverlayLayer: Container;
  hover?: unknown;
  tiles: { view: Container; wallView: Container };
} {
  return scene as unknown as {
    avatars: Map<string, { overlayView: Container; view: Container }>;
    avatarLayer: Container;
    doorAvatarLayer: Container;
    avatarOverlayLayer: Container;
    hover?: unknown;
    tiles: { view: Container; wallView: Container };
  };
}

function avatarState(avatar?: { view: Container }): {
  chatBubble: { visible: boolean };
  chatBubbleText: { text: string };
  typingIndicator: { visible: boolean };
} {
  return avatar as unknown as {
    chatBubble: { visible: boolean };
    chatBubbleText: { text: string };
    typingIndicator: { visible: boolean };
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
    this.dispatch("click", this.withPreventDefault(event));
  }

  mousedown(event: { clientX: number; clientY: number }): void {
    this.dispatch("mousedown", this.withPreventDefault(event));
  }

  mousemove(event: { clientX: number; clientY: number }): void {
    this.dispatch("mousemove", this.withPreventDefault(event));
  }

  mouseleave(event: Record<string, never>): void {
    this.dispatch("mouseleave", event);
  }

  mouseup(event: Record<string, never>): void {
    this.dispatch("mouseup", event);
  }

  wheel(event: { clientX: number; clientY: number; deltaY: number }): void {
    this.dispatch("wheel", this.withPreventDefault(event));
  }

  private dispatch(type: string, event: FakePointerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  private withPreventDefault<T extends object>(event: T): T & { preventDefault: () => void } {
    return {
      ...event,
      preventDefault: () => {
        this.defaultPrevented = true;
      },
    };
  }
}

type FakePointerEvent = {
  clientX?: number;
  clientY?: number;
  deltaY?: number;
  preventDefault?: () => void;
};
