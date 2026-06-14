import { ROOM_CREATION_COST } from "@tilezo/protocol";
import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { DEFAULT_ROOM_ID } from "../assets";
import {
  type AuthUser,
  authenticate,
  fetchSession,
  logout as requestLogout,
  updateAppearance,
} from "../auth/AuthClient";
import { blockUser } from "../blocks/BlockClient";
import type { FriendSummary } from "../friends/FriendClient";
import { addFriend, listFriends, removeFriend } from "../friends/FriendClient";
import type { Game } from "../game/Game";
import { getInventory, purchaseItem } from "../inventory/InventoryClient";
import { loadConversation, loadUnreadCounts } from "../messaging/DirectMessageClient";
import { createRoom, listRoomTemplates } from "../rooms/RoomClient";
import { ClientLogger } from "../telemetry/ClientLogger";
import { CharacterEditor } from "../ui/CharacterEditor";
import { ChatPanel } from "../ui/ChatPanel";
import { CreateRoomDialog } from "../ui/CreateRoomDialog";
import { DirectMessagePanel } from "../ui/DirectMessagePanel";
import { DisconnectedDialog } from "../ui/DisconnectedDialog";
import { FriendsPanel } from "../ui/FriendsPanel";
import { FurniturePanel } from "../ui/FurniturePanel";
import { LoginForm } from "../ui/LoginForm";
import { RoomBrowser } from "../ui/RoomBrowser";

type GameModule = typeof import("../game/Game");
type AppTimeout = ReturnType<typeof setTimeout>;
type AppInterval = ReturnType<typeof setInterval>;

type CreateAppDependencies = {
  addFriend: typeof addFriend;
  authenticate: typeof authenticate;
  blockUser: typeof blockUser;
  clearInterval: (timer: AppInterval | undefined) => void;
  clearTimeout: (timer: AppTimeout | undefined) => void;
  createChatPanel: () => ChatPanel;
  createCharacterEditor: (
    options: ConstructorParameters<typeof CharacterEditor>[0],
  ) => CharacterEditor;
  createClientLogger: () => Pick<ClientLogger, "event">;
  createDirectMessagePanel: (
    options: ConstructorParameters<typeof DirectMessagePanel>[0],
  ) => DirectMessagePanel;
  createDisconnectedDialog: (
    options: ConstructorParameters<typeof DisconnectedDialog>[0],
  ) => DisconnectedDialog;
  createFurniturePanel: (
    options: ConstructorParameters<typeof FurniturePanel>[0],
  ) => FurniturePanel;
  createFriendsPanel: (options: ConstructorParameters<typeof FriendsPanel>[0]) => FriendsPanel;
  createLoginForm: (onSubmit: ConstructorParameters<typeof LoginForm>[0]) => LoginForm;
  createRoom: typeof createRoom;
  createRoomBrowser: (options: ConstructorParameters<typeof RoomBrowser>[0]) => RoomBrowser;
  createRoomDialog: (
    options: ConstructorParameters<typeof CreateRoomDialog>[0],
  ) => CreateRoomDialog;
  fetchSession: typeof fetchSession;
  listFriends: typeof listFriends;
  listRoomTemplates: typeof listRoomTemplates;
  loadConversation: typeof loadConversation;
  loadGame: () => Promise<GameModule>;
  loadUnreadCounts: typeof loadUnreadCounts;
  removeFriend: typeof removeFriend;
  requestLogout: typeof requestLogout;
  setInterval: (callback: () => void, ms: number) => AppInterval;
  setTimeout: (callback: () => void, ms: number) => AppTimeout;
  updateAppearance: typeof updateAppearance;
  getInventory: typeof getInventory;
  purchaseItem: typeof purchaseItem;
};

const defaultCreateAppDependencies: CreateAppDependencies = {
  addFriend,
  authenticate,
  blockUser,
  clearInterval: (timer) => clearInterval(timer as never),
  clearTimeout: (timer) => clearTimeout(timer as never),
  createChatPanel: () => new ChatPanel(),
  createCharacterEditor: (options) => new CharacterEditor(options),
  createClientLogger: () => new ClientLogger(),
  createDirectMessagePanel: (options) => new DirectMessagePanel(options),
  createDisconnectedDialog: (options) => new DisconnectedDialog(options),
  createFurniturePanel: (options) => new FurniturePanel(options),
  createFriendsPanel: (options) => new FriendsPanel(options),
  createLoginForm: (onSubmit) => new LoginForm(onSubmit),
  createRoom,
  createRoomBrowser: (options) => new RoomBrowser(options),
  createRoomDialog: (options) => new CreateRoomDialog(options),
  fetchSession,
  listFriends,
  listRoomTemplates,
  loadConversation,
  loadGame: () => import("../game/Game"),
  loadUnreadCounts,
  removeFriend,
  requestLogout,
  setInterval: (callback, ms) => setInterval(callback, ms) as AppInterval,
  setTimeout: (callback, ms) => setTimeout(callback, ms) as AppTimeout,
  updateAppearance,
  getInventory,
  purchaseItem,
};

export function createApp(
  root: HTMLElement,
  dependencies: Partial<CreateAppDependencies> = {},
): void {
  const deps: CreateAppDependencies = { ...defaultCreateAppDependencies, ...dependencies };
  const shell = document.createElement("main");
  const stage = document.createElement("div");
  const topBar = document.createElement("header");
  const brand = document.createElement("div");
  const brandTitle = document.createElement("strong");
  const brandSubtitle = document.createElement("span");
  const topActions = document.createElement("div");
  const status = document.createElement("div");
  const browseRooms = document.createElement("button");
  const friendsButton = document.createElement("button");
  const createRoomButton = document.createElement("button");
  const furnitureButton = document.createElement("button");
  const editCharacter = document.createElement("button");
  const logOut = document.createElement("button");
  const balanceDisplay = document.createElement("span");
  const chat = deps.createChatPanel();
  const clientLogger = deps.createClientLogger();
  // The auth token lives only in an HttpOnly cookie; the page keeps just the user profile.
  let user: AuthUser | undefined;
  let game: Game | undefined;
  let gameStarted = false;
  let joinedRoom = false;
  let reconnectTimeout: AppTimeout | undefined;
  let countdownInterval: AppInterval | undefined;
  let reconnecting = false;
  let balanceCueTimeout: AppTimeout | undefined;
  const unreadCounts = new Map<string, number>();

  shell.className = "app-shell";
  stage.className = "game-stage";
  topBar.className = "top-bar";
  brand.className = "brand";
  topActions.className = "top-actions";
  status.className = "status";
  browseRooms.className = "room-browser-button hidden";
  browseRooms.type = "button";
  browseRooms.textContent = "Rooms";
  friendsButton.className = "friends-button hidden";
  friendsButton.type = "button";
  friendsButton.textContent = "Friends";
  createRoomButton.className = "create-room-button hidden";
  createRoomButton.type = "button";
  createRoomButton.textContent = "Create room";
  furnitureButton.className = "furniture-button hidden";
  furnitureButton.type = "button";
  furnitureButton.textContent = "Furniture";
  editCharacter.className = "edit-character-button hidden";
  editCharacter.type = "button";
  editCharacter.textContent = "Edit character";
  logOut.className = "log-out-button hidden";
  logOut.type = "button";
  logOut.textContent = "Log out";
  balanceDisplay.className = "balance hidden";
  balanceDisplay.textContent = "";
  brandTitle.textContent = "Room";
  brandSubtitle.textContent = "server-authoritative isometric multiplayer";
  status.textContent = "idle";

  function updateBalanceDisplay(dollars: number): void {
    balanceDisplay.textContent = `$${dollars.toString()}`;
  }

  function cueBalanceChange(): void {
    balanceDisplay.classList.remove("balance-updated");
    // Reading layout restarts the animation when updates arrive before the cue clears.
    void balanceDisplay.offsetWidth;
    balanceDisplay.classList.add("balance-updated");
    deps.clearTimeout(balanceCueTimeout);
    balanceCueTimeout = deps.setTimeout(() => {
      balanceDisplay.classList.remove("balance-updated");
      balanceCueTimeout = undefined;
    }, 900);
  }

  function syncCreateRoomButton(): void {
    const canCreate = (user?.dollars ?? 0) >= ROOM_CREATION_COST;
    createRoomButton.disabled = !canCreate;
    createRoomButton.title = canCreate
      ? ""
      : `You need $${ROOM_CREATION_COST.toString()} to create a room`;
  }

  brand.append(brandTitle, brandSubtitle);
  topActions.append(
    browseRooms,
    friendsButton,
    createRoomButton,
    furnitureButton,
    editCharacter,
    logOut,
  );
  topBar.append(brand, topActions, status, balanceDisplay);

  const roomBrowser = deps.createRoomBrowser({
    onJoin(roomId) {
      status.textContent = "joining room";
      game?.joinRoom(roomId);
    },
    onRefresh() {
      if (gameStarted) {
        game?.refreshRooms();
      }
    },
  });

  const friendsPanel = deps.createFriendsPanel({
    async onAdd(username) {
      if (!user) {
        return;
      }

      try {
        const result = await deps.addFriend(username);
        await refreshFriends();
        status.textContent = result.status === "accepted" ? "friend added" : "friend request sent";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Friend add failed";
        status.textContent = message;
        friendsPanel.showError(message);
      }
    },
    onJoinRoom(roomId) {
      if (!roomId) {
        return;
      }

      status.textContent = "joining friend";
      game?.joinRoom(roomId);
    },
    onMessage(friend) {
      void openConversation(friend);
    },
    onRefresh() {
      void refreshFriends();
    },
    async onRemove(friendId) {
      if (!user) {
        return;
      }

      try {
        await deps.removeFriend(friendId);
        await refreshFriends();
        status.textContent = "friend removed";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Friend remove failed";
        status.textContent = message;
        friendsPanel.showError(message);
      }
    },
    async onBlock(friend) {
      if (!user) {
        return;
      }

      try {
        await deps.blockUser(friend.id);
        await refreshFriends();

        if (directMessagePanel.isOpenFor(friend.id)) {
          directMessagePanel.hide();
        }

        status.textContent = `blocked ${friend.username}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Block failed";
        status.textContent = message;
        friendsPanel.showError(message);
      }
    },
  });

  const furniturePanel = deps.createFurniturePanel({
    onModeChange(mode) {
      game?.setFurnitureEditMode(mode);
    },
    onPickup(itemId) {
      game?.pickupRoomItem(itemId);
    },
    onBuy: async (itemType) => {
      if (!user) {
        return;
      }
      status.textContent = "purchasing";
      try {
        const result = await deps.purchaseItem(itemType);
        user.dollars = result.balance;
        updateBalanceDisplay(result.balance);
        cueBalanceChange();
        furniturePanel.setInventory(result.items);
        status.textContent = "purchased";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Purchase failed";
        status.textContent = message;
        void clientLogger.event("furniture.purchase_failed", { message }, "warn");
        throw new Error(message);
      }
    },
    inventory: [],
  });

  async function ensureGame(): Promise<Game> {
    if (game) {
      return game;
    }

    const { Game } = await deps.loadGame();
    game = new Game({
      stage,
      chat,
      setStatus(value) {
        status.textContent = value;
      },
      setRooms(rooms) {
        roomBrowser.setRooms(rooms);
      },
      onRoomJoined(snapshot) {
        joinedRoom = true;
        chat.clear();
        chat.show();
        revealSignedInChrome({ editCharacter: true });
        roomBrowser.setCurrentRoom(snapshot.roomId);
        furniturePanel.setCanEdit(snapshot.canEditItems);
        furniturePanel.setItems(snapshot.items);

        if (snapshot.canEditItems) {
          furnitureButton.classList.remove("hidden");
        } else {
          furnitureButton.classList.add("hidden");
          furniturePanel.hide();
        }

        roomBrowser.hide();
      },
      onFurnitureItemsChanged(items) {
        furniturePanel.setItems(items);
      },
      onBalanceUpdated(dollars) {
        if (!user) {
          return;
        }
        user.dollars = dollars;
        updateBalanceDisplay(dollars);
        cueBalanceChange();
        syncCreateRoomButton();
      },
      onInventoryUpdated(items) {
        furniturePanel.setInventory(items);
      },
      onDirectMessage(message) {
        const appended = directMessagePanel.append(message);

        if (appended) {
          if (message.fromUserId !== user?.id) {
            clearUnread(message.fromUserId);
          }
          return;
        }

        if (message.fromUserId !== user?.id) {
          incrementUnread(message.fromUserId);
          status.textContent = "new direct message";
        }
      },
      onDirectTyping(message) {
        directMessagePanel.setFriendTyping(message.fromUserId, message.isTyping);
      },
      onDirectRead(message) {
        if (message.readerUserId === user?.id) {
          clearUnread(message.otherUserId);
        } else {
          directMessagePanel.markRead(message.messageIds);
        }
      },
      onDirectEdited(message) {
        directMessagePanel.updateEdited(message);
      },
      onDirectDeleted(message) {
        if (!directMessagePanel.markDeleted(message.id) && message.fromUserId !== user?.id) {
          decrementUnread(message.fromUserId);
        }
      },
      onDisconnected() {
        if (!user || !gameStarted) {
          return;
        }

        void clientLogger.event("room.connection.disconnected", { joinedRoom }, "warn");
        shell.classList.add("connection-paused");
        scheduleReconnect("The room connection dropped. The scene is paused while Tilezo retries.");
      },
    });
    return game;
  }

  async function startGame(): Promise<Game> {
    const activeGame = await ensureGame();

    try {
      await activeGame.start();
      gameStarted = true;
      return activeGame;
    } catch (error) {
      if (game === activeGame) {
        game = undefined;
      }

      gameStarted = false;
      throw error;
    }
  }

  const directMessagePanel = deps.createDirectMessagePanel({
    onSend(friendId, text) {
      return game?.sendDirectMessage(friendId, text) ?? false;
    },
    onTypingChange(friendId, isTyping) {
      game?.sendDirectTyping(friendId, isTyping);
    },
    onRead(friendId) {
      game?.markDirectMessagesRead(friendId);
      clearUnread(friendId);
    },
    onEdit(messageId, text) {
      return game?.editDirectMessage(messageId, text) ?? false;
    },
    onDelete(messageId) {
      return game?.deleteDirectMessage(messageId) ?? false;
    },
  });

  const disconnectedDialog = deps.createDisconnectedDialog({
    onRetry() {
      void reconnectAfterDisconnect("resume");
    },
    onReturnToLobby() {
      void reconnectAfterDisconnect("lobby");
    },
  });

  const characterEditor = deps.createCharacterEditor({
    initialAppearance: DEFAULT_AVATAR_APPEARANCE,
    async onSubmit(appearance) {
      if (!user) {
        return;
      }

      status.textContent = "saving character";

      try {
        const savedAppearance = await deps.updateAppearance(appearance);
        user.appearance = savedAppearance;
        characterEditor.hide();

        if (joinedRoom) {
          editCharacter.classList.remove("hidden");
          game?.updateAppearance(savedAppearance);
          status.textContent = "character updated";
          return;
        }

        status.textContent = "connecting";
        await startGame();
        revealSignedInChrome();
        roomBrowser.show();
        status.textContent = "choose room";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "character update failed";
      }
    },
    onCancel() {
      characterEditor.hide();

      if (joinedRoom) {
        editCharacter.classList.remove("hidden");
      } else {
        login.element.classList.remove("hidden");
      }
    },
  });

  const login = deps.createLoginForm(async ({ mode, username, password }) => {
    login.hide();
    status.textContent = mode === "register" ? "creating account" : "logging in";

    try {
      user = await deps.authenticate({ mode, username, password });
      updateBalanceDisplay(user.dollars);
      void clientLogger.event(`auth.${mode}.succeeded`, { userId: user.id });
      logOut.classList.remove("hidden");
      friendsButton.classList.remove("hidden");
      characterEditor.setSubmitLabel("Enter room");
      characterEditor.show(user.appearance);
      status.textContent = "choose character";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "connection failed";
      void clientLogger.event(`auth.${mode}.failed`, { reason: status.textContent }, "warn");
      login.showError(status.textContent);
      login.element.classList.remove("hidden");
      logOut.classList.add("hidden");
      chat.hide();
    }
  });

  const createRoomDialog = deps.createRoomDialog({
    async onSubmit(room) {
      if (!user) {
        return;
      }

      status.textContent = "creating room";

      try {
        const created = await deps.createRoom(room);
        if (created.balance !== undefined) {
          user.dollars = created.balance;
          updateBalanceDisplay(created.balance);
          cueBalanceChange();
        }
        createRoomDialog.hide();
        roomBrowser.hide();

        if (!gameStarted) {
          await startGame();
        }

        revealSignedInChrome({ editCharacter: true });
        game?.joinRoom(created.roomId);
        status.textContent = "joining new room";
        void clientLogger.event("room.created", {
          roomId: created.roomId,
          templateId: room.templateId,
          visibility: room.visibility,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Room creation failed";
        status.textContent = message;
        createRoomDialog.showError(message);
        void clientLogger.event("room.create_failed", { message }, "warn");
      }
    },
    onCancel() {
      status.textContent = joinedRoom ? "room ready" : "choose room";
    },
  });

  editCharacter.addEventListener("click", () => {
    if (!user) {
      return;
    }

    editCharacter.classList.add("hidden");
    characterEditor.setSubmitLabel("Save character");
    characterEditor.show(user.appearance);
  });

  browseRooms.addEventListener("click", () => {
    roomBrowser.show();
  });

  friendsButton.addEventListener("click", () => {
    friendsPanel.show();
  });

  createRoomButton.addEventListener("click", () => {
    if (!user) {
      return;
    }

    void openCreateRoomDialog();
  });

  furnitureButton.addEventListener("click", () => {
    void refreshInventory();
    furniturePanel.show();
  });

  logOut.addEventListener("click", () => {
    void signOut();
  });

  function disposePanels(): void {
    chat.dispose?.();
    directMessagePanel.dispose?.();
  }

  async function signOut(): Promise<void> {
    if (logOut.disabled) {
      return;
    }

    logOut.disabled = true;
    clearReconnectSchedule();
    deps.clearTimeout(balanceCueTimeout);
    balanceCueTimeout = undefined;

    if (gameStarted) {
      game?.stop();
    }

    await deps.requestLogout();
    disposePanels();
    createApp(root, deps);
  }

  async function refreshInventory(): Promise<void> {
    if (!user) {
      return;
    }

    try {
      const items = await deps.getInventory();
      furniturePanel.setInventory(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inventory failed";
      status.textContent = message;
    }
  }

  shell.append(
    stage,
    topBar,
    login.element,
    characterEditor.element,
    createRoomDialog.element,
    roomBrowser.element,
    friendsPanel.element,
    furniturePanel.element,
    directMessagePanel.element,
    chat.element,
    disconnectedDialog.element,
  );
  root.replaceChildren(shell);

  void restoreExistingSession();

  // Reveals the signed-in top-bar controls. `editCharacter` only appears once the player is
  // in a room (it is hidden while choosing a character), so callers opt into it explicitly.
  function revealSignedInChrome(options: { editCharacter?: boolean } = {}): void {
    browseRooms.classList.remove("hidden");
    friendsButton.classList.remove("hidden");
    createRoomButton.classList.remove("hidden");
    logOut.classList.remove("hidden");
    balanceDisplay.classList.remove("hidden");
    syncCreateRoomButton();

    if (options.editCharacter) {
      editCharacter.classList.remove("hidden");
    }
  }

  async function restoreExistingSession(): Promise<void> {
    const existing = await deps.fetchSession();

    if (!existing) {
      return;
    }

    user = existing;
    updateBalanceDisplay(user.dollars);
    login.hide();
    logOut.classList.remove("hidden");
    friendsButton.classList.remove("hidden");
    status.textContent = "connecting";

    try {
      await startGame();
      revealSignedInChrome();
      roomBrowser.show();
      status.textContent = "choose room";
    } catch (error) {
      user = undefined;
      login.element.classList.remove("hidden");
      logOut.classList.add("hidden");
      chat.hide();
      status.textContent = error instanceof Error ? error.message : "connection failed";
    }
  }

  function scheduleReconnect(message: string, retryInSeconds = 5): void {
    clearReconnectSchedule();
    let remaining = retryInSeconds;

    disconnectedDialog.showDisconnected(message, remaining);
    countdownInterval = deps.setInterval(() => {
      remaining -= 1;
      disconnectedDialog.setCountdown(Math.max(0, remaining));
    }, 1000);
    reconnectTimeout = deps.setTimeout(() => {
      void reconnectAfterDisconnect("resume");
    }, retryInSeconds * 1000);
  }

  async function reconnectAfterDisconnect(mode: "resume" | "lobby"): Promise<void> {
    if (!user || reconnecting) {
      return;
    }

    reconnecting = true;
    clearReconnectSchedule();
    shell.classList.add("connection-paused");
    disconnectedDialog.showRetrying(
      mode === "lobby" ? "Reconnecting before returning to the lobby." : "Reconnecting to room.",
    );
    status.textContent = "reconnecting";

    try {
      const activeGame = await ensureGame();
      void clientLogger.event("room.connection.retry", { mode });
      await activeGame.reconnect();
      gameStarted = true;
      revealSignedInChrome({ editCharacter: true });

      if (mode === "lobby") {
        activeGame.joinRoom(DEFAULT_ROOM_ID);
      }

      disconnectedDialog.hide();
      shell.classList.remove("connection-paused");
      status.textContent = mode === "lobby" ? "returning to lobby" : "reconnected";
      void clientLogger.event("room.connection.reconnected", { mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reconnect failed";
      status.textContent = message;
      void clientLogger.event("room.connection.retry_failed", { mode, message }, "warn");
      scheduleReconnect(`Retry failed: ${message}`);
    } finally {
      reconnecting = false;
    }
  }

  async function openCreateRoomDialog(): Promise<void> {
    if (!user) {
      return;
    }

    status.textContent = "loading room templates";

    try {
      createRoomDialog.show(await deps.listRoomTemplates(), user.dollars);
      status.textContent = "create room";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Room templates failed";
    }
  }

  async function openConversation(friend: FriendSummary): Promise<void> {
    if (!user) {
      return;
    }

    status.textContent = "loading messages";

    try {
      const history = await deps.loadConversation(friend.id);
      directMessagePanel.open(friend, history, user.id);
      friendsPanel.hide();
      status.textContent = `messaging ${friend.username}`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Could not open messages";
    }
  }

  async function refreshFriends(): Promise<void> {
    if (!user) {
      return;
    }

    try {
      const [friends, unread] = await Promise.all([deps.listFriends(), deps.loadUnreadCounts()]);
      unreadCounts.clear();

      for (const item of unread) {
        unreadCounts.set(item.friendId, item.count);
      }

      friendsPanel.setFriends(friends, unreadCounts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Friends failed";
      status.textContent = message;
      friendsPanel.showError(message);
    }
  }

  function incrementUnread(friendId: string): void {
    const next = (unreadCounts.get(friendId) ?? 0) + 1;
    unreadCounts.set(friendId, next);
    friendsPanel.setUnreadCount(friendId, next);
  }

  function clearUnread(friendId: string): void {
    unreadCounts.delete(friendId);
    friendsPanel.setUnreadCount(friendId, 0);
  }

  function decrementUnread(friendId: string): void {
    const next = Math.max(0, (unreadCounts.get(friendId) ?? 0) - 1);

    if (next === 0) {
      clearUnread(friendId);
      return;
    }

    unreadCounts.set(friendId, next);
    friendsPanel.setUnreadCount(friendId, next);
  }

  function clearReconnectSchedule(): void {
    if (reconnectTimeout) {
      deps.clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }

    if (countdownInterval) {
      deps.clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
  }
}
