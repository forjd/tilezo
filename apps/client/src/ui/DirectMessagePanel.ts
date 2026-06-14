import type { DirectMessage } from "@tilezo/protocol/messages";

type DirectMessagePanelOptions = {
  onSend: (friendId: string, text: string) => boolean | undefined;
  onTypingChange?: (friendId: string, isTyping: boolean) => void;
};

type Conversation = {
  friendId: string;
  friendName: string;
  selfUserId: string;
};

export class DirectMessagePanel {
  readonly element = document.createElement("section");

  private readonly title = document.createElement("h2");
  private readonly messageList = document.createElement("div");
  private readonly typingStatus = document.createElement("p");
  private readonly form = document.createElement("form");
  private readonly input = document.createElement("input");
  private typingTimeout?: ReturnType<typeof setTimeout>;
  private isTyping = false;
  private conversation?: Conversation;

  constructor(private readonly options: DirectMessagePanelOptions) {
    this.element.className = "dm-panel hidden";

    const header = document.createElement("header");
    const actions = document.createElement("div");
    const closeButton = document.createElement("button");
    const sendButton = document.createElement("button");

    header.className = "room-browser-header";
    this.title.textContent = "Messages";
    actions.className = "room-browser-actions";
    closeButton.type = "button";
    closeButton.className = "secondary-button room-browser-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hide());

    this.messageList.className = "dm-list";
    this.typingStatus.className = "dm-typing";

    this.form.className = "dm-form";
    this.input.type = "text";
    this.input.name = "dm-text";
    this.input.placeholder = "Message your friend";
    this.input.autocomplete = "off";
    this.input.maxLength = 600;
    sendButton.type = "submit";
    sendButton.className = "primary-button dm-send-button";
    sendButton.textContent = "Send";
    this.form.append(this.input, sendButton);
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.input.value.trim();

      if (!text || !this.conversation) {
        return;
      }

      if (this.options.onSend(this.conversation.friendId, text) === false) {
        return;
      }

      this.input.value = "";
      this.setOwnTyping(false);
    });
    this.input.addEventListener("input", () => this.handleInputChanged());

    actions.append(closeButton);
    header.append(this.title, actions);
    this.element.append(header, this.messageList, this.typingStatus, this.form);
  }

  open(
    friend: { id: string; username: string },
    history: DirectMessage[],
    selfUserId: string,
  ): void {
    this.setOwnTyping(false);
    this.conversation = { friendId: friend.id, friendName: friend.username, selfUserId };
    this.title.textContent = `Chat with ${friend.username}`;
    this.messageList.replaceChildren();
    this.setFriendTyping(friend.id, false);

    for (const message of history) {
      this.renderMessage(message);
    }

    this.element.classList.remove("hidden");
    this.scrollToLatest();
    this.input.focus();
  }

  // Appends a live message if it belongs to the open conversation. Returns whether it did.
  append(message: DirectMessage): boolean {
    if (!this.conversation || this.isHidden() || !this.belongsToConversation(message)) {
      return false;
    }

    this.renderMessage(message);
    if (message.fromUserId === this.conversation.selfUserId) {
      this.setOwnTyping(false);
    } else {
      this.setFriendTyping(message.fromUserId, false);
    }
    this.scrollToLatest();
    return true;
  }

  hide(): void {
    this.setOwnTyping(false);
    this.element.classList.add("hidden");
    this.conversation = undefined;
    this.typingStatus.textContent = "";
    this.typingStatus.classList.remove("visible");
  }

  isOpenFor(friendId: string): boolean {
    return !this.isHidden() && this.conversation?.friendId === friendId;
  }

  setFriendTyping(friendId: string, isTyping: boolean): boolean {
    if (!this.conversation || this.conversation.friendId !== friendId || this.isHidden()) {
      return false;
    }

    this.typingStatus.textContent = isTyping ? `${this.conversation.friendName} is typing` : "";
    this.typingStatus.classList.toggle("visible", isTyping);
    return true;
  }

  private belongsToConversation(message: DirectMessage): boolean {
    const { friendId, selfUserId } = this.conversation ?? { friendId: "", selfUserId: "" };
    return (
      (message.fromUserId === friendId && message.toUserId === selfUserId) ||
      (message.fromUserId === selfUserId && message.toUserId === friendId)
    );
  }

  private renderMessage(message: DirectMessage): void {
    const mine = message.fromUserId === this.conversation?.selfUserId;
    const item = document.createElement("div");
    item.className = mine ? "dm-message dm-message-mine" : "dm-message dm-message-theirs";
    item.textContent = message.text;
    this.messageList.append(item);
  }

  private scrollToLatest(): void {
    this.messageList.scrollTop = this.messageList.scrollHeight;
  }

  private handleInputChanged(): void {
    const hasText = this.input.value.trim().length > 0;

    if (!hasText) {
      this.setOwnTyping(false);
      return;
    }

    this.setOwnTyping(true);
    this.typingTimeout = setTimeout(() => {
      this.setOwnTyping(false);
    }, 1800);
  }

  private setOwnTyping(isTyping: boolean): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
    }

    if (this.isTyping === isTyping) {
      return;
    }

    this.isTyping = isTyping;

    if (this.conversation) {
      this.options.onTypingChange?.(this.conversation.friendId, isTyping);
    }
  }

  private isHidden(): boolean {
    return this.element.classList.contains("hidden");
  }
}
