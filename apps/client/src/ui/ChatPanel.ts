export class ChatPanel {
  readonly element = document.createElement("section");

  private readonly maxMessages = 100;
  private readonly list = document.createElement("div");
  private readonly input = document.createElement("input");
  private sendHandler?: (text: string) => void;
  private typingHandler?: (isTyping: boolean) => void;
  private typingTimeout?: ReturnType<typeof setTimeout>;
  private isTyping = false;

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
      this.setTyping(false);
    });

    this.input.addEventListener("input", () => {
      this.handleInputChanged();
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
    this.input.value = "";
    this.setTyping(false);
  }

  onSend(handler: (text: string) => void): void {
    this.sendHandler = handler;
  }

  onTypingChange(handler: (isTyping: boolean) => void): void {
    this.typingHandler = handler;
  }

  focusInput(): void {
    if (this.element.classList.contains("hidden")) {
      return;
    }

    this.input.focus({ preventScroll: true });
  }

  addMessage(username: string, text: string): void {
    const shouldStickToBottom =
      this.list.children.length === 0 ||
      this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 8;
    const message = document.createElement("div");
    const author = document.createElement("strong");
    const body = document.createElement("span");

    message.className = "message";
    author.textContent = username;
    body.textContent = `: ${text}`;
    message.append(author, body);
    this.list.append(message);

    while (this.list.childElementCount > this.maxMessages) {
      this.list.firstElementChild?.remove();
    }

    if (shouldStickToBottom) {
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  private handleInputChanged(): void {
    const hasText = this.input.value.trim().length > 0;

    if (!hasText) {
      this.setTyping(false);
      return;
    }

    this.setTyping(true);
    this.typingTimeout = setTimeout(() => {
      this.setTyping(false);
    }, 1800);
  }

  private setTyping(isTyping: boolean): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
    }

    if (this.isTyping === isTyping) {
      return;
    }

    this.isTyping = isTyping;
    this.typingHandler?.(isTyping);
  }
}
