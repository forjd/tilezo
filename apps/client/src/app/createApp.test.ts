import { afterEach, describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import type { DirectMessage, RoomSnapshotMessage } from "@tilezo/protocol/messages";
import type { AuthUser } from "../auth/AuthClient";
import type { FriendSummary } from "../friends/FriendClient";
import type { CreateRoomRequest, RoomTemplateSummary } from "../rooms/RoomClient";
import { createApp } from "./createApp";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

type AppDependenciesForTest = Required<NonNullable<Parameters<typeof createApp>[1]>>;
type GameConstructorForTest = typeof import("../game/Game")["Game"];
type GameOptionsForTest = ConstructorParameters<GameConstructorForTest>[0];
type GameModuleForTest = typeof import("../game/Game");

describe("createApp", () => {
  afterEach(() => {
    restoreDocument();
  });

  test("drives signed-in room, friend, direct-message, reconnect, and logout flows", async () => {
    const harness = createAppHarness();
    await flushAsyncMessages();

    await harness.disconnectedDialogs[0]?.retry();
    harness.roomBrowsers[0]?.refresh();
    harness.roomBrowsers[0]?.join("studio");
    harness.friendsPanels[0]?.message(friend);
    await harness.friendsPanels[0]?.add("Kai");
    await harness.friendsPanels[0]?.remove("user_2");
    await harness.friendsPanels[0]?.block(friend);
    harness.friendsPanels[0]?.joinRoom("");
    await harness.friendsPanels[0]?.refresh();
    await harness.createRoomDialogs[0]?.submit(roomRequest);
    await harness.characterEditors[0]?.submit(DEFAULT_AVATAR_APPEARANCE);
    findByClass(harness.root, "edit-character-button").dispatch("click");
    findByClass(harness.root, "room-browser-button").dispatch("click");
    findByClass(harness.root, "friends-button").dispatch("click");
    findByClass(harness.root, "create-room-button").dispatch("click");
    await flushAsyncMessages();
    expect(harness.games).toEqual([]);

    await harness.loginForms[0]?.submit({
      mode: "login",
      username: "Dan",
      password: "secret phrase",
    });
    await flushAsyncMessages();
    expect(harness.characterEditors[0]?.shown).toContain(DEFAULT_AVATAR_APPEARANCE);

    findByClass(harness.root, "create-room-button").dispatch("click");
    await flushAsyncMessages();
    expect(harness.createRoomDialogs[0]?.shownTemplates).toEqual([[roomTemplate]]);

    await harness.createRoomDialogs[0]?.submit(roomRequest);
    await flushAsyncMessages();
    const game = harness.requireGame();
    expect(game.started).toBe(1);
    expect(game.joinedRooms).toContain("created_room");

    game.options.setStatus("custom status");
    game.options.setRooms([{ id: "studio", name: "Studio", userCount: 1, joined: false }]);
    harness.createRoomDialogs[0]?.cancel();
    harness.characterEditors[0]?.cancel();
    await harness.characterEditors[0]?.submit(DEFAULT_AVATAR_APPEARANCE);
    await flushAsyncMessages();
    expect(game.started).toBe(2);

    harness.roomBrowsers[0]?.refresh();
    harness.roomBrowsers[0]?.join("studio");
    const snapshot: RoomSnapshotMessage = {
      type: "room.snapshot",
      roomId: "studio",
      users: [],
      tiles: [],
      items: [],
      canEditItems: true,
    };
    game.options.onRoomJoined(snapshot);
    harness.createRoomDialogs[0]?.cancel();
    findByClass(harness.root, "edit-character-button").dispatch("click");
    harness.characterEditors[0]?.cancel();

    const updatedAppearance = { ...DEFAULT_AVATAR_APPEARANCE, hair: "bob" as const };
    await harness.characterEditors[0]?.submit(updatedAppearance);
    await flushAsyncMessages();
    expect(game.updatedAppearances).toEqual([updatedAppearance]);

    harness.services.addFriend = async () => ({ friend, status: "accepted" });
    await harness.friendsPanels[0]?.add("Kai");
    harness.services.addFriend = async () => {
      throw new Error("add down");
    };
    await harness.friendsPanels[0]?.add("Kai");
    expect(harness.friendsPanels[0]?.errors).toContain("add down");

    harness.friendsPanels[0]?.joinRoom("");
    harness.friendsPanels[0]?.joinRoom("lobby");
    expect(game.joinedRooms).toContain("lobby");

    harness.services.listFriends = async () => [friend];
    harness.services.loadUnreadCounts = async () => [{ friendId: "user_2", count: 2 }];
    await harness.friendsPanels[0]?.refresh();
    await flushAsyncMessages();
    expect(harness.friendsPanels[0]?.friendsCalls.at(-1)).toEqual({
      friends: [friend],
      unread: new Map([["user_2", 2]]),
    });
    harness.services.listFriends = async () => {
      throw new Error("friends down");
    };
    await harness.friendsPanels[0]?.refresh();
    await flushAsyncMessages();
    expect(harness.friendsPanels[0]?.errors).toContain("friends down");

    harness.services.loadConversation = async () => [directMessage];
    await harness.friendsPanels[0]?.message(friend);
    await flushAsyncMessages();
    expect(harness.directMessagePanels[0]?.opened.at(-1)).toEqual({
      friend,
      history: [directMessage],
      selfUserId: "user_1",
    });
    harness.services.loadConversation = async () => {
      throw new Error("messages down");
    };
    await harness.friendsPanels[0]?.message(friend);
    await flushAsyncMessages();

    harness.services.removeFriend = async () => {};
    await harness.friendsPanels[0]?.remove("user_2");
    harness.services.removeFriend = async () => {
      throw new Error("remove down");
    };
    await harness.friendsPanels[0]?.remove("user_2");
    expect(harness.friendsPanels[0]?.errors).toContain("remove down");

    harness.directMessagePanels[0]?.openFor.add("user_2");
    harness.services.blockUser = async () => {};
    await harness.friendsPanels[0]?.block(friend);
    expect(harness.directMessagePanels[0]?.hidden).toBeGreaterThan(0);
    harness.services.blockUser = async () => {
      throw new Error("block down");
    };
    await harness.friendsPanels[0]?.block(friend);
    expect(harness.friendsPanels[0]?.errors).toContain("block down");

    expect(harness.directMessagePanels[0]?.send("user_2", "hi")).toBe(true);
    harness.directMessagePanels[0]?.typing("user_2", true);
    harness.directMessagePanels[0]?.read("user_2");
    expect(harness.directMessagePanels[0]?.edit("dm_1", "updated")).toBe(true);
    expect(harness.directMessagePanels[0]?.delete("dm_1")).toBe(true);
    expect(game.directMessages).toContainEqual({ friendId: "user_2", text: "hi" });

    const directFromFriend: DirectMessage = {
      ...directMessage,
      id: "dm_friend_1",
      fromUserId: "user_2",
      toUserId: "user_1",
    };
    const directMessagePanel = harness.requireDirectMessagePanel();
    directMessagePanel.appendResult = true;
    game.options.onDirectMessage(directFromFriend);
    directMessagePanel.appendResult = false;
    game.options.onDirectMessage({ ...directFromFriend, id: "dm_friend_2" });
    game.options.onDirectMessage({ ...directFromFriend, id: "dm_friend_3" });
    game.options.onDirectTyping({
      type: "dm.typing",
      fromUserId: "user_2",
      toUserId: "user_1",
      isTyping: true,
    });
    game.options.onDirectRead({
      type: "dm.read",
      readerUserId: "user_2",
      otherUserId: "user_1",
      messageIds: ["dm_friend_2"],
      readAt: "2026-06-13T00:00:00.000Z",
    });
    game.options.onDirectEdited({
      type: "dm.edited",
      id: "dm_friend_2",
      fromUserId: "user_2",
      toUserId: "user_1",
      text: "edited",
      editedAt: "2026-06-13T00:01:00.000Z",
    });
    directMessagePanel.markDeletedResult = false;
    game.options.onDirectDeleted({
      type: "dm.deleted",
      id: "dm_friend_2",
      fromUserId: "user_2",
      toUserId: "user_1",
      deletedAt: "2026-06-13T00:02:00.000Z",
    });
    game.options.onDirectDeleted({
      type: "dm.deleted",
      id: "dm_friend_3",
      fromUserId: "user_2",
      toUserId: "user_1",
      deletedAt: "2026-06-13T00:03:00.000Z",
    });
    directMessagePanel.markDeletedResult = true;
    game.options.onDirectDeleted({
      type: "dm.deleted",
      id: "dm_friend_4",
      fromUserId: "user_2",
      toUserId: "user_1",
      deletedAt: "2026-06-13T00:04:00.000Z",
    });
    game.options.onDirectRead({
      type: "dm.read",
      readerUserId: "user_1",
      otherUserId: "user_2",
      messageIds: ["dm_friend_2"],
      readAt: "2026-06-13T00:05:00.000Z",
    });

    game.options.onDisconnected();
    expect(harness.timeouts).toHaveLength(1);
    harness.intervals.at(-1)?.callback();
    harness.timeouts.at(-1)?.callback();
    await flushAsyncMessages();
    expect(game.reconnected).toBe(1);

    game.options.onDisconnected();
    game.nextReconnectError = new Error("retry down");
    await harness.disconnectedDialogs[0]?.retry();
    await flushAsyncMessages();
    expect(harness.disconnectedDialogs[0]?.disconnectedMessages.at(-1)).toContain("Retry failed");

    game.nextReconnectError = undefined;
    await harness.disconnectedDialogs[0]?.returnToLobby();
    await flushAsyncMessages();
    expect(game.joinedRooms).toContain("lobby");

    const logOutButton = findByClass(harness.root, "log-out-button");
    logOutButton.disabled = true;
    logOutButton.dispatch("click");
    await flushAsyncMessages();
    expect(harness.logoutCalls).toBe(0);
    logOutButton.disabled = false;
    logOutButton.dispatch("click");
    await flushAsyncMessages();
    expect(harness.logoutCalls).toBe(1);
    expect(game.stopped).toBe(1);
  });

  test("surfaces startup, login, character, template, and room creation failures", async () => {
    const restoreHarness = createAppHarness({
      fetchSession: async () => user,
      startError: new Error("startup failed"),
    });
    await flushAsyncMessages();
    restoreHarness.games[0]?.options.onDisconnected();
    expect(restoreHarness.loginForms[0]?.element.classList.contains("hidden")).toBe(false);

    const loginHarness = createAppHarness({
      authenticate: async () => {
        throw new Error("bad login");
      },
    });
    await flushAsyncMessages();
    await loginHarness.loginForms[0]?.submit({
      mode: "register",
      username: "Dan",
      password: "bad",
    });
    await flushAsyncMessages();
    expect(loginHarness.loginForms[0]?.errors).toContain("bad login");

    const characterHarness = createAppHarness();
    await flushAsyncMessages();
    await characterHarness.loginForms[0]?.submit({
      mode: "login",
      username: "Dan",
      password: "secret phrase",
    });
    characterHarness.services.updateAppearance = async () => {
      throw new Error("appearance down");
    };
    await characterHarness.characterEditors[0]?.submit(DEFAULT_AVATAR_APPEARANCE);
    await flushAsyncMessages();
    expect(findByClass(characterHarness.root, "status").textContent).toBe("appearance down");

    const roomHarness = createAppHarness();
    await flushAsyncMessages();
    await roomHarness.loginForms[0]?.submit({
      mode: "login",
      username: "Dan",
      password: "secret phrase",
    });
    roomHarness.services.listRoomTemplates = async () => {
      throw new Error("template down");
    };
    findByClass(roomHarness.root, "create-room-button").dispatch("click");
    await flushAsyncMessages();
    expect(findByClass(roomHarness.root, "status").textContent).toBe("template down");
    roomHarness.services.createRoom = async () => {
      throw new Error("create down");
    };
    await roomHarness.createRoomDialogs[0]?.submit(roomRequest);
    await flushAsyncMessages();
    expect(roomHarness.createRoomDialogs[0]?.errors).toContain("create down");
  });

  test("restores an existing session into the room chooser", async () => {
    const harness = createAppHarness({ fetchSession: async () => user });
    await flushAsyncMessages();

    expect(harness.games).toHaveLength(1);
    expect(harness.games[0]?.started).toBe(1);
    expect(harness.roomBrowsers[0]?.shown).toBe(1);
  });

  test("disables the create room button when balance is below the room cost", async () => {
    const harness = createAppHarness();
    await flushAsyncMessages();

    await harness.loginForms[0]?.submit({
      mode: "login",
      username: "Dan",
      password: "secret phrase",
    });
    await harness.characterEditors[0]?.submit(DEFAULT_AVATAR_APPEARANCE);
    await flushAsyncMessages();

    const createButton = findByClass(harness.root, "create-room-button");
    expect(createButton.disabled).toBe(false);
    expect(createButton.title).toBe("");

    findByClass(harness.root, "create-room-button").dispatch("click");
    await flushAsyncMessages();
    expect(harness.createRoomDialogs[0]?.shownBalances.at(-1)).toBe(500);

    harness.requireGame().options.onBalanceUpdated?.(50);
    expect(createButton.disabled).toBe(true);
    expect(createButton.title).toContain("$100");

    const balance = findByClass(harness.root, "balance");
    expect(balance.classList.contains("balance-updated")).toBe(true);
    harness.timeouts.at(-1)?.callback();
    expect(balance.classList.contains("balance-updated")).toBe(false);
  });

  test("updates inventory after purchases and propagates purchase failures to the panel", async () => {
    const harness = createAppHarness();
    await flushAsyncMessages();

    await harness.loginForms[0]?.submit({
      mode: "login",
      username: "Dan",
      password: "secret phrase",
    });
    await flushAsyncMessages();

    const furniturePanel = harness.requireFurniturePanel();
    await furniturePanel.buy("woven_rug");
    await flushAsyncMessages();

    expect(findByClass(harness.root, "balance").textContent).toBe("$475");
    expect(findByClass(harness.root, "balance").classList.contains("balance-updated")).toBe(true);
    expect(furniturePanel.inventorySets.at(-1)).toEqual([{ itemType: "woven_rug", quantity: 1 }]);

    harness.services.purchaseItem = async () => {
      throw new Error("not enough cash");
    };
    await expect(furniturePanel.buy("crate_table")).rejects.toThrow("not enough cash");
    expect(findByClass(harness.root, "status").textContent).toBe("not enough cash");
  });
});

function createAppHarness(
  overrides: Partial<{
    authenticate: AppDependenciesForTest["authenticate"];
    fetchSession: AppDependenciesForTest["fetchSession"];
    startError: Error;
  }> = {},
) {
  installDocument();
  const root = new FakeElement("div");
  const loginForms: FakeLoginForm[] = [];
  const roomBrowsers: FakeRoomBrowser[] = [];
  const friendsPanels: FakeFriendsPanel[] = [];
  const characterEditors: FakeCharacterEditor[] = [];
  const createRoomDialogs: FakeCreateRoomDialog[] = [];
  const directMessagePanels: FakeDirectMessagePanel[] = [];
  const disconnectedDialogs: FakeDisconnectedDialog[] = [];
  const furniturePanels: FakeFurniturePanel[] = [];
  const games: FakeGame[] = [];
  const timeouts: TimerDouble[] = [];
  const intervals: TimerDouble[] = [];
  const clearedTimeouts: TimerDouble[] = [];
  const clearedIntervals: TimerDouble[] = [];
  let logoutCalls = 0;

  const services: Pick<
    AppDependenciesForTest,
    | "addFriend"
    | "authenticate"
    | "blockUser"
    | "createRoom"
    | "fetchSession"
    | "listFriends"
    | "listRoomTemplates"
    | "loadConversation"
    | "loadUnreadCounts"
    | "getInventory"
    | "purchaseItem"
    | "removeFriend"
    | "requestLogout"
    | "updateAppearance"
  > = {
    authenticate: overrides.authenticate ?? (async () => user),
    fetchSession: overrides.fetchSession ?? (async () => undefined),
    updateAppearance: async (appearance: AvatarAppearance) => appearance,
    addFriend: async () => ({ friend, status: "pending" as const }),
    listFriends: async () => [friend],
    loadUnreadCounts: async () => [],
    loadConversation: async () => [directMessage],
    removeFriend: async () => {},
    blockUser: async () => {},
    listRoomTemplates: async () => [roomTemplate],
    getInventory: async () => [],
    purchaseItem: async (itemType) => ({
      balance: 475,
      items: [{ itemType, quantity: 1 }],
    }),
    createRoom: async () => ({
      roomId: "created_room",
      room: { id: "created_room", name: "Created", userCount: 1, joined: true },
    }),
    requestLogout: async () => {
      logoutCalls += 1;
    },
  };

  class HarnessGame extends FakeGame {
    constructor(options: GameOptionsForTest) {
      super(options, overrides.startError);
      games.push(this);
    }
  }

  const dependencies: NonNullable<Parameters<typeof createApp>[1]> = {
    authenticate: (options) => services.authenticate(options),
    fetchSession: () => services.fetchSession(),
    updateAppearance: (appearance) => services.updateAppearance(appearance),
    addFriend: (username) => services.addFriend(username),
    listFriends: () => services.listFriends(),
    loadUnreadCounts: () => services.loadUnreadCounts(),
    loadConversation: (friendId) => services.loadConversation(friendId),
    removeFriend: (friendId) => services.removeFriend(friendId),
    blockUser: (friendId) => services.blockUser(friendId),
    listRoomTemplates: () => services.listRoomTemplates(),
    getInventory: () => services.getInventory(),
    purchaseItem: (itemType) => services.purchaseItem(itemType),
    createRoom: (room) => services.createRoom(room),
    requestLogout: () => services.requestLogout(),
    createChatPanel: () => new FakeChatPanel() as never,
    createClientLogger: () => new FakeClientLogger(),
    createLoginForm(onSubmit) {
      const form = new FakeLoginForm(onSubmit);
      loginForms.push(form);
      return form as never;
    },
    createRoomBrowser(options) {
      const browser = new FakeRoomBrowser(options);
      roomBrowsers.push(browser);
      return browser as never;
    },
    createFriendsPanel(options) {
      const panel = new FakeFriendsPanel(options);
      friendsPanels.push(panel);
      return panel as never;
    },
    createCharacterEditor(options) {
      const editor = new FakeCharacterEditor(options);
      characterEditors.push(editor);
      return editor as never;
    },
    createRoomDialog(options) {
      const dialog = new FakeCreateRoomDialog(options);
      createRoomDialogs.push(dialog);
      return dialog as never;
    },
    createDirectMessagePanel(options) {
      const panel = new FakeDirectMessagePanel(options);
      directMessagePanels.push(panel);
      return panel as never;
    },
    createFurniturePanel(options) {
      const panel = new FakeFurniturePanel(options);
      furniturePanels.push(panel);
      return panel as never;
    },
    createDisconnectedDialog(options) {
      const dialog = new FakeDisconnectedDialog(options);
      disconnectedDialogs.push(dialog);
      return dialog as never;
    },
    loadGame: async () => ({ Game: HarnessGame }) as unknown as GameModuleForTest,
    setTimeout(callback, ms) {
      const timer = { callback, ms };
      timeouts.push(timer);
      return timer as never;
    },
    clearTimeout(timer) {
      if (timer) {
        clearedTimeouts.push(timer as never);
      }
    },
    setInterval(callback, ms) {
      const timer = { callback, ms };
      intervals.push(timer);
      return timer as never;
    },
    clearInterval(timer) {
      if (timer) {
        clearedIntervals.push(timer as never);
      }
    },
  };

  createApp(root as unknown as HTMLElement, dependencies);

  return {
    root,
    loginForms,
    roomBrowsers,
    friendsPanels,
    characterEditors,
    createRoomDialogs,
    directMessagePanels,
    disconnectedDialogs,
    furniturePanels,
    games,
    services,
    timeouts,
    intervals,
    clearedTimeouts,
    clearedIntervals,
    get logoutCalls() {
      return logoutCalls;
    },
    requireGame() {
      const game = games[0];
      if (!game) {
        throw new Error("Missing game");
      }
      return game;
    },
    requireDirectMessagePanel() {
      const panel = directMessagePanels[0];
      if (!panel) {
        throw new Error("Missing direct message panel");
      }
      return panel;
    },
    requireFurniturePanel() {
      const panel = furniturePanels[0];
      if (!panel) {
        throw new Error("Missing furniture panel");
      }
      return panel;
    },
  };
}

const user: AuthUser = {
  id: "user_1",
  username: "Dan",
  appearance: DEFAULT_AVATAR_APPEARANCE,
  dollars: 500,
};

const friend: FriendSummary = {
  id: "user_2",
  username: "Kai",
  appearance: DEFAULT_AVATAR_APPEARANCE,
  online: true,
  roomId: "lobby",
  canJoinRoom: true,
};

const directMessage: DirectMessage = {
  type: "dm.message",
  id: "dm_1",
  fromUserId: "user_2",
  toUserId: "user_1",
  text: "hello",
  sentAt: "2026-06-13T00:00:00.000Z",
};

const roomTemplate: RoomTemplateSummary = {
  id: "studio",
  name: "Studio",
  width: 5,
  height: 5,
  defaultCapacity: 25,
  doorOptions: [{ label: "Left", y: 2 }],
};

const roomRequest: CreateRoomRequest = {
  name: "Created",
  description: "",
  templateId: "studio",
  visibility: "public",
  access: "open",
  capacity: 25,
  doorY: 2,
};

class FakeGame {
  readonly joinedRooms: string[] = [];
  readonly updatedAppearances: AvatarAppearance[] = [];
  readonly directMessages: { friendId: string; text: string }[] = [];
  started = 0;
  stopped = 0;
  refreshed = 0;
  reconnected = 0;
  nextReconnectError?: Error;

  constructor(
    readonly options: GameOptionsForTest,
    private readonly startError?: Error,
  ) {}

  async start(): Promise<void> {
    this.started += 1;
    if (this.startError) {
      throw this.startError;
    }
  }

  stop(): void {
    this.stopped += 1;
  }

  async reconnect(): Promise<void> {
    this.reconnected += 1;
    if (this.nextReconnectError) {
      throw this.nextReconnectError;
    }
  }

  joinRoom(roomId: string): void {
    this.joinedRooms.push(roomId);
  }

  refreshRooms(): void {
    this.refreshed += 1;
  }

  updateAppearance(appearance: AvatarAppearance): void {
    this.updatedAppearances.push(appearance);
  }

  sendDirectMessage(friendId: string, text: string): boolean {
    this.directMessages.push({ friendId, text });
    return true;
  }

  sendDirectTyping(): boolean {
    return true;
  }

  markDirectMessagesRead(): boolean {
    return true;
  }

  editDirectMessage(): boolean {
    return true;
  }

  deleteDirectMessage(): boolean {
    return true;
  }

  setFurnitureEditMode(): void {}

  pickupRoomItem(): boolean {
    return true;
  }
}

class FakeFurniturePanel {
  readonly element = new FakeElement("section");
  readonly canEditValues: boolean[] = [];
  readonly itemSets: unknown[] = [];
  readonly inventorySets: unknown[] = [];
  hidden = 0;
  shown = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createFurniturePanel"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  buy(itemType: string): unknown {
    return this.options.onBuy(itemType);
  }

  hide(): void {
    this.hidden += 1;
  }

  setCanEdit(canEdit: boolean): void {
    this.canEditValues.push(canEdit);
  }

  setItems(items: unknown): void {
    this.itemSets.push(items);
  }

  setInventory(items: unknown): void {
    this.inventorySets.push(items);
  }

  show(): void {
    this.shown += 1;
  }
}

class FakeChatPanel {
  readonly element = new FakeElement("section");
  cleared = 0;
  shown = 0;
  hidden = 0;

  clear(): void {
    this.cleared += 1;
  }

  show(): void {
    this.shown += 1;
  }

  hide(): void {
    this.hidden += 1;
  }
}

class FakeClientLogger {
  readonly events: unknown[] = [];

  async event(name: string, fields: Record<string, unknown> = {}, level = "info"): Promise<void> {
    this.events.push({ name, fields, level });
  }
}

class FakeLoginForm {
  readonly element = new FakeElement("section");
  readonly errors: string[] = [];
  hidden = 0;

  constructor(
    private readonly onSubmit: AppDependenciesForTest["createLoginForm"] extends (
      onSubmit: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  submit(values: { mode: "login" | "register"; username: string; password: string }): unknown {
    return this.onSubmit(values);
  }

  hide(): void {
    this.hidden += 1;
    this.element.classList.add("hidden");
  }

  showError(message: string): void {
    this.errors.push(message);
  }
}

class FakeRoomBrowser {
  readonly element = new FakeElement("section");
  readonly roomSets: unknown[] = [];
  readonly currentRooms: (string | undefined)[] = [];
  shown = 0;
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createRoomBrowser"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  join(roomId: string): void {
    this.options.onJoin(roomId);
  }

  refresh(): void {
    this.options.onRefresh();
  }

  show(): void {
    this.shown += 1;
  }

  hide(): void {
    this.hidden += 1;
  }

  setRooms(rooms: unknown): void {
    this.roomSets.push(rooms);
  }

  setCurrentRoom(roomId: string | undefined): void {
    this.currentRooms.push(roomId);
  }
}

class FakeFriendsPanel {
  readonly element = new FakeElement("section");
  readonly errors: string[] = [];
  readonly friendsCalls: { friends: FriendSummary[]; unread: Map<string, number> }[] = [];
  readonly unreadCalls: { friendId: string; count: number }[] = [];
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createFriendsPanel"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  add(username: string): unknown {
    return this.options.onAdd(username);
  }

  joinRoom(roomId: string): void {
    this.options.onJoinRoom(roomId);
  }

  message(selectedFriend: FriendSummary): void {
    this.options.onMessage(selectedFriend);
  }

  refresh(): unknown {
    return this.options.onRefresh();
  }

  remove(friendId: string): unknown {
    return this.options.onRemove(friendId);
  }

  block(selectedFriend: FriendSummary): unknown {
    return this.options.onBlock(selectedFriend);
  }

  hide(): void {
    this.hidden += 1;
  }

  show(): void {}

  showError(message: string): void {
    this.errors.push(message);
  }

  setFriends(friends: FriendSummary[], unread: Map<string, number>): void {
    this.friendsCalls.push({ friends, unread: new Map(unread) });
  }

  setUnreadCount(friendId: string, count: number): void {
    this.unreadCalls.push({ friendId, count });
  }
}

class FakeCharacterEditor {
  readonly element = new FakeElement("section");
  readonly shown: AvatarAppearance[] = [];
  readonly labels: string[] = [];
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createCharacterEditor"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  submit(appearance: AvatarAppearance): unknown {
    return this.options.onSubmit(appearance);
  }

  cancel(): void {
    this.options.onCancel?.();
  }

  show(appearance?: AvatarAppearance): void {
    if (appearance) {
      this.shown.push(appearance);
    }
  }

  hide(): void {
    this.hidden += 1;
  }

  setSubmitLabel(label: string): void {
    this.labels.push(label);
  }
}

class FakeCreateRoomDialog {
  readonly element = new FakeElement("section");
  readonly shownTemplates: RoomTemplateSummary[][] = [];
  readonly shownBalances: number[] = [];
  readonly errors: string[] = [];
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createRoomDialog"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  submit(room: CreateRoomRequest): unknown {
    return this.options.onSubmit(room);
  }

  cancel(): void {
    this.options.onCancel();
  }

  show(templates: RoomTemplateSummary[], balance: number): void {
    this.shownTemplates.push(templates);
    this.shownBalances.push(balance);
  }

  hide(): void {
    this.hidden += 1;
  }

  showError(message: string): void {
    this.errors.push(message);
  }
}

class FakeDirectMessagePanel {
  readonly element = new FakeElement("section");
  readonly openFor = new Set<string>();
  readonly opened: { friend: FriendSummary; history: DirectMessage[]; selfUserId: string }[] = [];
  readonly edited: unknown[] = [];
  readonly deleted: string[] = [];
  appendResult = false;
  markDeletedResult = false;
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createDirectMessagePanel"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  send(friendId: string, text: string): boolean | undefined {
    return this.options.onSend(friendId, text);
  }

  typing(friendId: string, isTyping: boolean): void {
    this.options.onTypingChange?.(friendId, isTyping);
  }

  read(friendId: string): void {
    this.options.onRead?.(friendId);
  }

  edit(messageId: string, text: string): boolean | undefined {
    return this.options.onEdit?.(messageId, text);
  }

  delete(messageId: string): boolean | undefined {
    return this.options.onDelete?.(messageId);
  }

  append(): boolean {
    return this.appendResult;
  }

  setFriendTyping(): void {}

  markRead(): void {}

  updateEdited(message: unknown): void {
    this.edited.push(message);
  }

  markDeleted(messageId: string): boolean {
    this.deleted.push(messageId);
    return this.markDeletedResult;
  }

  isOpenFor(friendId: string): boolean {
    return this.openFor.has(friendId);
  }

  hide(): void {
    this.hidden += 1;
  }

  open(selectedFriend: FriendSummary, history: DirectMessage[], selfUserId: string): void {
    this.opened.push({ friend: selectedFriend, history, selfUserId });
  }
}

class FakeDisconnectedDialog {
  readonly element = new FakeElement("section");
  readonly disconnectedMessages: string[] = [];
  readonly countdowns: number[] = [];
  readonly retryingMessages: string[] = [];
  hidden = 0;

  constructor(
    private readonly options: AppDependenciesForTest["createDisconnectedDialog"] extends (
      options: infer T,
    ) => unknown
      ? T
      : never,
  ) {}

  retry(): unknown {
    return this.options.onRetry();
  }

  returnToLobby(): unknown {
    return this.options.onReturnToLobby();
  }

  showDisconnected(message: string, remaining: number): void {
    this.disconnectedMessages.push(message);
    this.countdowns.push(remaining);
  }

  setCountdown(remaining: number): void {
    this.countdowns.push(remaining);
  }

  showRetrying(message: string): void {
    this.retryingMessages.push(message);
  }

  hide(): void {
    this.hidden += 1;
  }
}

type TimerDouble = {
  callback: () => void;
  ms: number;
};

type FakeEvent = {
  preventDefault?: () => void;
};

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly classList = new FakeClassList(this);
  disabled = false;
  parentElement?: FakeElement;
  textContent = "";
  title = "";
  type = "";
  value = "";

  constructor(
    readonly tagName: string,
    public className = "",
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
    }
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.append(...children);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: FakeEvent = {}): void {
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

  remove(className: string): void {
    this.setClasses(this.getClasses().filter((value) => value !== className));
  }

  contains(className: string): boolean {
    return this.getClasses().includes(className);
  }

  private getClasses(): string[] {
    return this.element.className.split(/\s+/).filter(Boolean);
  }

  private setClasses(values: string[]): void {
    this.element.className = [...new Set(values)].join(" ");
  }
}

function installDocument(): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tagName: string) {
        return new FakeElement(tagName);
      },
    } as unknown as Document,
  });
}

function restoreDocument(): void {
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }
}

function findByClass(root: FakeElement, className: string): FakeElement {
  if (root.classList.contains(className)) {
    return root;
  }

  for (const child of root.children) {
    try {
      return findByClass(child, className);
    } catch {
      // Continue searching sibling branches.
    }
  }

  throw new Error(`Missing .${className}`);
}

async function flushAsyncMessages(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
