import { Game } from "../game/Game";
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
  const chat = new ChatPanel();

  shell.className = "app-shell";
  stage.className = "game-stage";
  topBar.className = "top-bar";
  brand.className = "brand";
  status.className = "status";
  brandTitle.textContent = "Room";
  brandSubtitle.textContent = "server-authoritative isometric multiplayer";
  status.textContent = "idle";

  brand.append(brandTitle, brandSubtitle);
  topBar.append(brand, status);

  const game = new Game({
    stage,
    chat,
    setStatus(value) {
      status.textContent = value;
    },
  });

  const login = new LoginForm(async ({ username, roomId }) => {
    login.hide();
    chat.show();
    status.textContent = "connecting";

    try {
      await game.start(username, roomId);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "connection failed";
      login.element.classList.remove("hidden");
      chat.element.classList.add("hidden");
    }
  });

  shell.append(stage, topBar, login.element, chat.element);
  root.replaceChildren(shell);
}
