import { DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol/appearance";
import { type AuthSession, authenticate, updateAppearance } from "../auth/AuthClient";
import type { Game } from "../game/Game";
import { CharacterEditor } from "../ui/CharacterEditor";
import { ChatPanel } from "../ui/ChatPanel";
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
  const editCharacter = document.createElement("button");
  const logOut = document.createElement("button");
  const chat = new ChatPanel();
  let session: AuthSession | undefined;
  let game: Game | undefined;
  let gameStarted = false;
  let joinedRoom = false;

  shell.className = "app-shell";
  stage.className = "game-stage";
  topBar.className = "top-bar";
  brand.className = "brand";
  topActions.className = "top-actions";
  status.className = "status";
  browseRooms.className = "room-browser-button hidden";
  browseRooms.type = "button";
  browseRooms.textContent = "Rooms";
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
  topActions.append(browseRooms, editCharacter, logOut);
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
        editCharacter.classList.remove("hidden");
        roomBrowser.setCurrentRoom(snapshot.roomId);
        roomBrowser.hide();
      },
    });
    return game;
  }

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
      writeStoredSession(session);
      logOut.classList.remove("hidden");
      characterEditor.setSubmitLabel("Enter room");
      characterEditor.show(session.user.appearance);
      status.textContent = "choose character";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "connection failed";
      login.showError(status.textContent);
      login.element.classList.remove("hidden");
      logOut.classList.add("hidden");
      chat.hide();
    }
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

  logOut.addEventListener("click", () => {
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
    roomBrowser.element,
    chat.element,
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
