export class ChatPanel {
  readonly element = document.createElement("section");

  private readonly list = document.createElement("div");
  private readonly input = document.createElement("input");
  private sendHandler?: (text: string) => void;

  constructor() {
    this.element.className = "chat-panel hidden";
    this.list.className = "message-list";
    this.input.className = "chat-input";
    this.input.maxLength = 240;
    this.input.placeholder = "Say something";

    this.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const text = this.input.value.trim();

      if (!text) {
        return;
      }

      this.sendHandler?.(text);
      this.input.value = "";
    });

    this.element.append(this.list, this.input);
  }

  show(): void {
    this.element.classList.remove("hidden");
    this.focusInput();
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  clear(): void {
    this.list.replaceChildren();
  }

  onSend(handler: (text: string) => void): void {
    this.sendHandler = handler;
  }

  focusInput(): void {
    if (this.element.classList.contains("hidden")) {
      return;
    }

    this.input.focus({ preventScroll: true });
  }

  addMessage(username: string, text: string): void {
    const message = document.createElement("div");
    const author = document.createElement("strong");
    const body = document.createElement("span");

    message.className = "message";
    author.textContent = username;
    body.textContent = `: ${text}`;
    message.append(author, body);
    this.list.append(message);
    this.list.scrollTop = this.list.scrollHeight;
  }
}
