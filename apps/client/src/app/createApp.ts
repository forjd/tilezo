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
import { loadConversation, loadUnreadCounts } from "../messaging/DirectMessageClient";
import { createRoom, listRoomTemplates } from "../rooms/RoomClient";
import { ClientLogger } from "../telemetry/ClientLogger";
import { CharacterEditor } from "../ui/CharacterEditor";
import { ChatPanel } from "../ui/ChatPanel";
import { CreateRoomDialog } from "../ui/CreateRoomDialog";
import { DirectMessagePanel } from "../ui/DirectMessagePanel";
import { DisconnectedDialog } from "../ui/DisconnectedDialog";
import { FriendsPanel } from "../ui/FriendsPanel";
import { LoginForm } from "../ui/LoginForm";
import { RoomBrowser } from "../ui/RoomBrowser";

export function createApp(root: HTMLElement): void {
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
  const editCharacter = document.createElement("button");
  const logOut = document.createElement("button");
  const chat = new ChatPanel();
  const clientLogger = new ClientLogger();
  // The auth token lives only in an HttpOnly cookie; the page keeps just the user profile.
  let user: AuthUser | undefined;
  let game: Game | undefined;
  let gameStarted = false;
  let joinedRoom = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;
  let reconnecting = false;
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
  editCharacter.className = "edit-character-button hidden";
  editCharacter.type = "button";
  editCharacter.textContent = "Edit character";
  logOut.className = "log-out-button hidden";
  logOut.type = "button";
  logOut.textContent = "Log out";
  brandTitle.textContent = "Room";
  brandSubtitle.textContent = "server-authoritative isometric multiplayer";
  status.textContent = "idle";

  brand.append(brandTitle, brandSubtitle);
  topActions.append(browseRooms, friendsButton, createRoomButton, editCharacter, logOut);
  topBar.append(brand, topActions, status);

  const roomBrowser = new RoomBrowser({
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

  const friendsPanel = new FriendsPanel({
    async onAdd(username) {
      if (!user) {
        return;
      }

      try {
        const result = await addFriend(username);
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
        await removeFriend(friendId);
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
        await blockUser(friend.id);
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

  async function ensureGame(): Promise<Game> {
    if (game) {
      return game;
    }

    const { Game } = await import("../game/Game");
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
        roomBrowser.hide();
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

  const directMessagePanel = new DirectMessagePanel({
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
  });

  const disconnectedDialog = new DisconnectedDialog({
    onRetry() {
      void reconnectAfterDisconnect("resume");
    },
    onReturnToLobby() {
      void reconnectAfterDisconnect("lobby");
    },
  });

  const characterEditor = new CharacterEditor({
    initialAppearance: DEFAULT_AVATAR_APPEARANCE,
    async onSubmit(appearance) {
      if (!user) {
        return;
      }

      status.textContent = "saving character";

      try {
        const savedAppearance = await updateAppearance(appearance);
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

  const login = new LoginForm(async ({ mode, username, password }) => {
    login.hide();
    status.textContent = mode === "register" ? "creating account" : "logging in";

    try {
      user = await authenticate({ mode, username, password });
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

  const createRoomDialog = new CreateRoomDialog({
    async onSubmit(room) {
      if (!user) {
        return;
      }

      status.textContent = "creating room";

      try {
        const created = await createRoom(room);
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

  logOut.addEventListener("click", () => {
    void signOut();
  });

  async function signOut(): Promise<void> {
    if (logOut.disabled) {
      return;
    }

    logOut.disabled = true;
    clearReconnectSchedule();

    if (gameStarted) {
      game?.stop();
    }

    await requestLogout();
    createApp(root);
  }

  shell.append(
    stage,
    topBar,
    login.element,
    characterEditor.element,
    createRoomDialog.element,
    roomBrowser.element,
    friendsPanel.element,
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

    if (options.editCharacter) {
      editCharacter.classList.remove("hidden");
    }
  }

  async function restoreExistingSession(): Promise<void> {
    const existing = await fetchSession();

    if (!existing) {
      return;
    }

    user = existing;
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
    countdownInterval = setInterval(() => {
      remaining -= 1;
      disconnectedDialog.setCountdown(Math.max(0, remaining));
    }, 1000);
    reconnectTimeout = setTimeout(() => {
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
    status.textContent = "loading room templates";

    try {
      createRoomDialog.show(await listRoomTemplates());
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
      const history = await loadConversation(friend.id);
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
      const [friends, unread] = await Promise.all([listFriends(), loadUnreadCounts()]);
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

  function clearReconnectSchedule(): void {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
  }
}
