import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import type { ClientMessage, ServerMessage } from "@tilezo/protocol/messages";
import type { ChatPanel } from "../ui/ChatPanel";
import { Game } from "./Game";

const originalConsoleError = console.error;
type GameDependenciesForTest = ConstructorParameters<typeof Game>[1];

const appInstances: FakeApplication[] = [];
const netInstances: FakeNetClient[] = [];
const sceneInstances: FakeRoomScene[] = [];
const resizeListeners = new Set<EventListenerOrEventListenerObject>();
let nextConnectError: Error | undefined;

describe("Game", () => {
  beforeEach(() => {
    appInstances.length = 0;
    netInstances.length = 0;
    sceneInstances.length = 0;
    resizeListeners.clear();
    nextConnectError = undefined;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  test("starts, routes server messages, sends commands, reconnects, and stops", async () => {
    const stage = createStage();
    const chat = createChat();
    const events = createGameEvents();
    const game = new Game(
      { ...events.options, chat: chat as unknown as ChatPanel, stage },
      createDependencies(),
    );

    await game.start();

    const app = requireInstance(appInstances, "application");
    const net = requireInstance(netInstances, "net client");
    const scene = requireInstance(sceneInstances, "room scene");
    expect(stage.appended).toEqual([app.canvas]);
    expect(app.canvas.style.imageRendering).toBe("pixelated");
    expect(net.sent).toEqual([{ type: "room.list.request" }]);
    expect(app.ticker.added).toHaveLength(1);
    expect(resizeListeners.size).toBe(1);

    expect(chat.sendHandler?.("hello room")).toBe(true);
    chat.typingHandler?.(true);
    scene.requestMove({ x: 2, y: 1 });
    scene.requestInteraction();
    game.setFurnitureEditMode({ type: "place", itemType: "crate_table", rotation: 0 });
    scene.requestFurnitureEdit({
      type: "place",
      itemType: "crate_table",
      rotation: 0,
      position: { x: 1, y: 1 },
    });
    game.joinRoom("studio");
    game.refreshRooms();
    game.updateAppearance({ ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" });
    expect(game.sendDirectMessage("user_2", "hi")).toBe(true);
    expect(game.sendDirectTyping("user_2", true)).toBe(true);
    expect(game.markDirectMessagesRead("user_2")).toBe(true);
    expect(game.editDirectMessage("dm_1", "updated")).toBe(true);
    expect(game.deleteDirectMessage("dm_1")).toBe(true);

    expect(chat.focusCount).toBe(1);
    expect(net.sent).toContainEqual({ type: "avatar.move.request", target: { x: 2, y: 1 } });
    expect(net.sent).toContainEqual({
      type: "room.item.place.request",
      itemType: "crate_table",
      position: { x: 1, y: 1 },
      rotation: 0,
    });
    expect(net.sent).toContainEqual({ type: "room.join", roomId: "studio" });
    expect(net.sent).toContainEqual({ type: "chat.say", text: "hello room" });
    expect(net.sent).toContainEqual({ type: "chat.typing", isTyping: true });
    expect(net.sent).toContainEqual({ type: "dm.delete", messageId: "dm_1" });

    const snapshot: ServerMessage = {
      type: "room.snapshot",
      roomId: "studio",
      users: [],
      tiles: [],
      items: [],
      canEditItems: true,
    };
    const dm = {
      type: "dm.message",
      id: "dm_1",
      fromUserId: "user_2",
      toUserId: "user_1",
      text: "hi",
      sentAt: "2026-06-13T00:00:00.000Z",
    } satisfies ServerMessage;
    net.emitMessage({ type: "connected", userId: "user_1" });
    net.emitMessage(snapshot);
    net.emitMessage({
      type: "room.list",
      rooms: [{ id: "studio", name: "Studio", userCount: 1, joined: true }],
    });
    net.emitMessage({
      type: "chat.message",
      userId: "user_2",
      username: "Kai",
      text: "hey",
      sentAt: "2026-06-13T00:00:00.000Z",
    });
    net.emitMessage(dm);
    net.emitMessage({
      type: "room.item.placed",
      item: {
        id: "item_1",
        itemType: "crate_table",
        x: 1,
        y: 1,
        z: 0,
        rotation: 0,
        state: {},
      },
    });
    net.emitMessage({
      type: "room.item.moved",
      item: {
        id: "item_1",
        itemType: "crate_table",
        x: 2,
        y: 1,
        z: 0,
        rotation: 1,
        state: {},
      },
    });
    expect(game.pickupRoomItem("item_1")).toBe(true);
    net.emitMessage({ type: "room.item.picked_up", itemId: "item_1" });
    net.emitMessage({
      type: "dm.typing",
      fromUserId: "user_2",
      toUserId: "user_1",
      isTyping: true,
    });
    net.emitMessage({
      type: "dm.read",
      readerUserId: "user_1",
      otherUserId: "user_2",
      messageIds: ["dm_1"],
      readAt: "2026-06-13T00:01:00.000Z",
    });
    net.emitMessage({
      type: "dm.edited",
      id: "dm_1",
      fromUserId: "user_2",
      toUserId: "user_1",
      text: "hello",
      editedAt: "2026-06-13T00:02:00.000Z",
    });
    net.emitMessage({
      type: "dm.deleted",
      id: "dm_1",
      fromUserId: "user_2",
      toUserId: "user_1",
      deletedAt: "2026-06-13T00:03:00.000Z",
    });
    net.emitMessage({ type: "error", code: "NOPE", message: "Nope" });

    expect(events.statuses).toContain("connected as user_1");
    expect(events.joined).toEqual([snapshot]);
    expect(events.rooms).toEqual([[{ id: "studio", name: "Studio", userCount: 1, joined: true }]]);
    expect(chat.messages).toEqual([
      { username: "Kai", text: "hey", sentAt: "2026-06-13T00:00:00.000Z" },
    ]);
    expect(events.directMessages).toEqual([dm]);
    expect(events.directTyping).toHaveLength(1);
    expect(events.directReads).toHaveLength(1);
    expect(events.directEdits).toHaveLength(1);
    expect(events.directDeletes).toHaveLength(1);
    expect(events.furnitureItems.at(-1)).toEqual([]);
    expect(events.statuses).toContain("NOPE: Nope");

    console.error = (() => {}) as typeof console.error;
    scene.throwOnType = "room.list";
    net.emitMessage({ type: "room.list", rooms: [] });
    expect(events.statuses.at(-1)).toBe("error rendering room update");

    app.ticker.added[0]?.({ deltaMS: 250 });
    expect(scene.updates).toEqual([0.25]);
    for (const listener of resizeListeners) {
      if (typeof listener === "function") {
        listener(new Event("resize"));
      }
    }
    expect(scene.resizeCount).toBe(1);

    await game.reconnect();
    expect(scene.clearCount).toBe(1);
    expect(app.ticker.started).toBe(1);
    expect(net.connectCount).toBe(2);

    net.emitDisconnect();
    expect(app.ticker.stopped).toBe(1);
    expect(events.disconnected).toBe(1);
    expect(game.sendDirectMessage("user_2", "after disconnect")).toBe(false);
    expect(events.statuses.at(-1)).toBe("disconnected");

    game.stop();
    expect(net.cleanupCount).toBe(3);
    expect(scene.destroyed).toBe(true);
    expect(net.disconnectCount).toBe(1);
    expect(app.destroyed).toBe(true);
    expect(resizeListeners.size).toBe(0);
  });

  test("marks itself disconnected when a send fails", async () => {
    const events = createGameEvents();
    const game = new Game(
      { ...events.options, chat: createChat() as unknown as ChatPanel, stage: createStage() },
      createDependencies(),
    );

    await game.start();
    requireInstance(netInstances, "net client").throwOnSend = true;

    expect(game.sendDirectMessage("user_2", "hi")).toBe(false);
    expect(events.statuses.at(-1)).toBe("disconnected");
  });

  test("cleans up when startup fails", async () => {
    const error = new Error("connect failed");
    nextConnectError = error;
    const game = new Game(
      {
        ...createGameEvents().options,
        chat: createChat() as unknown as ChatPanel,
        stage: createStage(),
      },
      createDependencies(),
    );

    await expect(game.start()).rejects.toBe(error);
    expect(requireInstance(netInstances, "net client").disconnectCount).toBe(1);
    expect(requireInstance(appInstances, "application").destroyed).toBe(true);
  });

  test("can stop before it has initialized Pixi", async () => {
    const game = new Game(
      {
        ...createGameEvents().options,
        chat: createChat() as unknown as ChatPanel,
        stage: createStage(),
      },
      createDependencies({ createRoomScene: false }),
    );

    game.stop();

    expect(requireInstance(netInstances, "net client").disconnectCount).toBe(1);
    expect(requireInstance(appInstances, "application").destroyed).toBe(false);
  });
});

function createDependencies(options: { createRoomScene?: false } = {}): GameDependenciesForTest {
  const dependencies = {
    createApplication: () => new FakeApplication(),
    createNetClient: () => new FakeNetClient(),
    globalTarget: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === "resize") {
          resizeListeners.add(listener);
        }
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === "resize") {
          resizeListeners.delete(listener);
        }
      },
    },
  };

  return {
    ...dependencies,
    ...(options.createRoomScene === false
      ? {}
      : {
          createRoomScene: (
            app: unknown,
            onMoveRequest: (target: { x: number; y: number }) => void,
            onInteraction: () => void,
            onFurnitureEditRequest: (request: unknown) => void,
          ) => new FakeRoomScene(app, onMoveRequest, onInteraction, onFurnitureEditRequest),
        }),
  } as unknown as GameDependenciesForTest;
}

function requireInstance<T>(instances: T[], label: string): T {
  const instance = instances[0];

  if (!instance) {
    throw new Error(`Missing ${label}`);
  }

  return instance;
}

class FakeApplication {
  readonly canvas = { style: {} as Record<string, string> };
  readonly stage = {};
  readonly ticker = {
    added: [] as Array<(ticker: { deltaMS: number }) => void>,
    started: 0,
    stopped: 0,
    add: (handler: (ticker: { deltaMS: number }) => void) => {
      this.ticker.added.push(handler);
    },
    remove: (handler: (ticker: { deltaMS: number }) => void) => {
      this.ticker.added = this.ticker.added.filter((item) => item !== handler);
    },
    start: () => {
      this.ticker.started += 1;
    },
    stop: () => {
      this.ticker.stopped += 1;
    },
  };
  destroyed = false;
  initOptions?: unknown;

  constructor() {
    appInstances.push(this);
  }

  async init(options: unknown): Promise<void> {
    this.initOptions = options;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeNetClient {
  readonly disconnectHandlers: Array<() => void> = [];
  readonly messageHandlers: Array<(message: ServerMessage) => void> = [];
  readonly sent: ClientMessage[] = [];
  readonly statusHandlers: Array<(status: string) => void> = [];
  cleanupCount = 0;
  connectCount = 0;
  disconnectCount = 0;
  throwOnSend = false;

  constructor() {
    netInstances.push(this);
  }

  async connect(): Promise<void> {
    this.connectCount += 1;

    if (nextConnectError) {
      throw nextConnectError;
    }
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }

  emitDisconnect(): void {
    for (const handler of this.disconnectHandlers) {
      handler();
    }
  }

  emitMessage(message: ServerMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.push(handler);
    return () => {
      this.cleanupCount += 1;
    };
  }

  onMessage(handler: (message: ServerMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.cleanupCount += 1;
    };
  }

  onStatus(handler: (status: string) => void): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.cleanupCount += 1;
    };
  }

  send(message: ClientMessage): void {
    if (this.throwOnSend) {
      throw new Error("send failed");
    }

    this.sent.push(message);
  }
}

class FakeRoomScene {
  clearCount = 0;
  destroyed = false;
  resizeCount = 0;
  throwOnType?: ServerMessage["type"];
  readonly updates: number[] = [];

  constructor(
    _app: unknown,
    readonly requestMove: (target: { x: number; y: number }) => void,
    readonly requestInteraction: () => void,
    readonly requestFurnitureEdit: (request: unknown) => void,
  ) {
    sceneInstances.push(this);
  }

  clear(): void {
    this.clearCount += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }

  handleServerMessage(message: ServerMessage): void {
    if (message.type === this.throwOnType) {
      throw new Error("render failed");
    }
  }

  resize(): void {
    this.resizeCount += 1;
  }

  setFurnitureEditMode(): void {}

  update(deltaSeconds: number): void {
    this.updates.push(deltaSeconds);
  }
}

type StageDouble = HTMLElement & {
  appended: unknown[];
};

function createStage(): StageDouble {
  const appended: unknown[] = [];

  return {
    appended,
    appendChild(child: Node) {
      appended.push(child);
      return child;
    },
  } as unknown as StageDouble;
}

type ChatDouble = {
  addMessage: (username: string, text: string, sentAt: string) => void;
  focusCount: number;
  focusInput: () => void;
  messages: Array<{ sentAt: string; text: string; username: string }>;
  onSend: (handler: (text: string) => boolean) => void;
  onTypingChange: (handler: (isTyping: boolean) => void) => void;
  sendHandler?: (text: string) => boolean;
  typingHandler?: (isTyping: boolean) => void;
};

function createChat(): ChatDouble {
  const chat: {
    focusCount: number;
    messages: Array<{ sentAt: string; text: string; username: string }>;
    sendHandler?: (text: string) => boolean;
    typingHandler?: (isTyping: boolean) => void;
  } = {
    focusCount: 0,
    messages: [],
  };

  return {
    ...chat,
    addMessage(username: string, text: string, sentAt: string) {
      chat.messages.push({ username, text, sentAt });
    },
    focusInput() {
      chat.focusCount += 1;
    },
    onSend(handler: (text: string) => boolean) {
      chat.sendHandler = handler;
    },
    onTypingChange(handler: (isTyping: boolean) => void) {
      chat.typingHandler = handler;
    },
    get focusCount() {
      return chat.focusCount;
    },
    get messages() {
      return chat.messages;
    },
    get sendHandler() {
      return chat.sendHandler;
    },
    get typingHandler() {
      return chat.typingHandler;
    },
  };
}

function createGameEvents() {
  const statuses: string[] = [];
  const rooms: unknown[] = [];
  const joined: unknown[] = [];
  const directMessages: unknown[] = [];
  const directTyping: unknown[] = [];
  const directReads: unknown[] = [];
  const directEdits: unknown[] = [];
  const directDeletes: unknown[] = [];
  const furnitureItems: unknown[] = [];
  let disconnected = 0;

  return {
    get disconnected() {
      return disconnected;
    },
    directDeletes,
    directEdits,
    directMessages,
    directReads,
    directTyping,
    joined,
    furnitureItems,
    options: {
      onDirectDeleted(message: unknown) {
        directDeletes.push(message);
      },
      onDirectEdited(message: unknown) {
        directEdits.push(message);
      },
      onDirectMessage(message: unknown) {
        directMessages.push(message);
      },
      onDirectRead(message: unknown) {
        directReads.push(message);
      },
      onDirectTyping(message: unknown) {
        directTyping.push(message);
      },
      onDisconnected() {
        disconnected += 1;
      },
      onFurnitureItemsChanged(items: unknown) {
        furnitureItems.push(items);
      },
      onRoomJoined(snapshot: unknown) {
        joined.push(snapshot);
      },
      setRooms(value: unknown) {
        rooms.push(value);
      },
      setStatus(status: string) {
        statuses.push(status);
      },
    },
    rooms,
    statuses,
  };
}
