import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { authenticate, updateAppearance } from "../auth/AuthClient";
import { Game } from "../game/Game";
import { CharacterEditor } from "../ui/CharacterEditor";
import { ChatPanel } from "../ui/ChatPanel";
import { LoginForm } from "../ui/LoginForm";

export function createApp(root: HTMLElement): void {
  const shell = document.createElement("main");
  const stage = document.createElement("div");
  const topBar = document.createElement("header");
  const brand = document.createElement("div");
  const brandTitle = document.createElement("strong");
  const brandSubtitle = document.createElement("span");
  const status = document.createElement("div");
  const editCharacter = document.createElement("button");
  const chat = new ChatPanel();
  let session:
    | {
        token: string;
        user: {
          appearance: AvatarAppearance;
        };
      }
    | undefined;
  let pendingRoomId = "";
  let joinedRoom = false;

  shell.className = "app-shell";
  stage.className = "game-stage";
  topBar.className = "top-bar";
  brand.className = "brand";
  status.className = "status";
  editCharacter.className = "edit-character-button hidden";
  editCharacter.type = "button";
  editCharacter.textContent = "Edit character";
  brandTitle.textContent = "Room";
  brandSubtitle.textContent = "server-authoritative isometric multiplayer";
  status.textContent = "idle";

  brand.append(brandTitle, brandSubtitle);
  topBar.append(brand, editCharacter, status);

  const game = new Game({
    stage,
    chat,
    setStatus(value) {
      status.textContent = value;
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
        characterEditor.hide();
        editCharacter.classList.remove("hidden");

        if (joinedRoom) {
          game.updateAppearance(savedAppearance);
          status.textContent = "character updated";
          return;
        }

        chat.show();
        status.textContent = "connecting";
        await game.start(session.token, pendingRoomId);
        joinedRoom = true;
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

  const login = new LoginForm(async ({ mode, username, password, roomId }) => {
    login.hide();
    status.textContent = mode === "register" ? "creating account" : "logging in";

    try {
      session = await authenticate({ mode, username, password });
      pendingRoomId = roomId;
      characterEditor.setSubmitLabel("Enter room");
      characterEditor.show(session.user.appearance);
      status.textContent = "choose character";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "connection failed";
      login.showError(status.textContent);
      login.element.classList.remove("hidden");
      chat.element.classList.add("hidden");
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

  shell.append(stage, topBar, login.element, characterEditor.element, chat.element);
  root.replaceChildren(shell);
}
