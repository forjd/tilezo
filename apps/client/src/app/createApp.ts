import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { DEFAULT_ROOM_ID } from "../assets";
import { type AuthSession, authenticate, updateAppearance } from "../auth/AuthClient";
import type { Game } from "../game/Game";
import { createRoom, listRoomTemplates } from "../rooms/RoomClient";
import { ClientLogger } from "../telemetry/ClientLogger";
import { CharacterEditor } from "../ui/CharacterEditor";
import { ChatPanel } from "../ui/ChatPanel";
import { CreateRoomDialog } from "../ui/CreateRoomDialog";
import { DisconnectedDialog } from "../ui/DisconnectedDialog";
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
  const createRoomButton = document.createElement("button");
  const editCharacter = document.createElement("button");
  const logOut = document.createElement("button");
  const chat = new ChatPanel();
  const clientLogger = new ClientLogger({ getToken: () => session?.token });
  let session: AuthSession | undefined;
  let game: Game | undefined;
  let gameStarted = false;
  let joinedRoom = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;
  let reconnecting = false;

  shell.className = "app-shell";
  stage.className = "game-stage";
  topBar.className = "top-bar";
  brand.className = "brand";
  topActions.className = "top-actions";
  status.className = "status";
  browseRooms.className = "room-browser-button hidden";
  browseRooms.type = "button";
  browseRooms.textContent = "Rooms";
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
  topActions.append(browseRooms, createRoomButton, editCharacter, logOut);
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
        browseRooms.classList.remove("hidden");
        createRoomButton.classList.remove("hidden");
        editCharacter.classList.remove("hidden");
        roomBrowser.setCurrentRoom(snapshot.roomId);
        roomBrowser.hide();
      },
      onDisconnected() {
        if (!session || !gameStarted) {
          return;
        }

        void clientLogger.event("room.connection.disconnected", { joinedRoom }, "warn");
        shell.classList.add("connection-paused");
        scheduleReconnect("The room connection dropped. The scene is paused while Tilezo retries.");
      },
    });
    return game;
  }

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
      if (!session) {
        return;
      }

      status.textContent = "saving character";

      try {
        const savedAppearance = await updateAppearance(session.token, appearance);
        session.user.appearance = savedAppearance;
        writeStoredSession(session);
        characterEditor.hide();

        if (joinedRoom) {
          editCharacter.classList.remove("hidden");
          game?.updateAppearance(savedAppearance);
          status.textContent = "character updated";
          return;
        }

        status.textContent = "connecting";
        await (await ensureGame()).start(session.token);
        gameStarted = true;
        browseRooms.classList.remove("hidden");
        createRoomButton.classList.remove("hidden");
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
      session = await authenticate({ mode, username, password });
      void clientLogger.event(`auth.${mode}.succeeded`, { userId: session.user.id });
      writeStoredSession(session);
      logOut.classList.remove("hidden");
      characterEditor.setSubmitLabel("Enter room");
      characterEditor.show(session.user.appearance);
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
      if (!session) {
        return;
      }

      status.textContent = "creating room";

      try {
        const created = await createRoom(session.token, room);
        createRoomDialog.hide();
        roomBrowser.hide();

        if (!gameStarted) {
          await (await ensureGame()).start(session.token);
          gameStarted = true;
        }

        browseRooms.classList.remove("hidden");
        createRoomButton.classList.remove("hidden");
        editCharacter.classList.remove("hidden");
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
    if (!session) {
      return;
    }

    editCharacter.classList.add("hidden");
    characterEditor.setSubmitLabel("Save character");
    characterEditor.show(session.user.appearance);
  });

  browseRooms.addEventListener("click", () => {
    roomBrowser.show();
  });

  createRoomButton.addEventListener("click", () => {
    if (!session) {
      return;
    }

    void openCreateRoomDialog();
  });

  logOut.addEventListener("click", () => {
    clearReconnectSchedule();
    clearStoredSession();

    if (gameStarted) {
      game?.stop();
    }

    createApp(root);
  });

  shell.append(
    stage,
    topBar,
    login.element,
    characterEditor.element,
    createRoomDialog.element,
    roomBrowser.element,
    chat.element,
    disconnectedDialog.element,
  );
  root.replaceChildren(shell);

  const storedSession = readStoredSession();

  if (storedSession) {
    void restoreSession(storedSession);
  }

  async function restoreSession(stored: AuthSession): Promise<void> {
    session = stored;
    login.hide();
    logOut.classList.remove("hidden");
    status.textContent = "connecting";

    try {
      await (await ensureGame()).start(stored.token);
      gameStarted = true;
      browseRooms.classList.remove("hidden");
      createRoomButton.classList.remove("hidden");
      roomBrowser.show();
      status.textContent = "choose room";
    } catch (error) {
      session = undefined;
      clearStoredSession();
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
    if (!session || reconnecting) {
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
      await activeGame.reconnect(session.token);
      gameStarted = true;
      browseRooms.classList.remove("hidden");
      createRoomButton.classList.remove("hidden");
      editCharacter.classList.remove("hidden");

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

const SESSION_STORAGE_KEY = "tilezo.authSession";

function readStoredSession(): AuthSession | undefined {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<AuthSession>;

    if (
      typeof parsed.token !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.username !== "string"
    ) {
      return undefined;
    }

    return parsed as AuthSession;
  } catch {
    clearStoredSession();
    return undefined;
  }
}

function writeStoredSession(session: AuthSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing or storage quota errors should not block play.
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}
