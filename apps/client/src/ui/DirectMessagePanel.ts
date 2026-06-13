import type { DirectMessage } from "@tilezo/protocol/messages";

type DirectMessagePanelOptions = {
  onSend: (friendId: string, text: string) => void;
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
  private readonly form = document.createElement("form");
  private readonly input = document.createElement("input");
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

      this.options.onSend(this.conversation.friendId, text);
      this.input.value = "";
    });

    actions.append(closeButton);
    header.append(this.title, actions);
    this.element.append(header, this.messageList, this.form);
  }

  open(
    friend: { id: string; username: string },
    history: DirectMessage[],
    selfUserId: string,
  ): void {
    this.conversation = { friendId: friend.id, friendName: friend.username, selfUserId };
    this.title.textContent = `Chat with ${friend.username}`;
    this.messageList.replaceChildren();

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
    this.scrollToLatest();
    return true;
  }

  hide(): void {
    this.element.classList.add("hidden");
    this.conversation = undefined;
  }

  isOpenFor(friendId: string): boolean {
    return !this.isHidden() && this.conversation?.friendId === friendId;
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

  private isHidden(): boolean {
    return this.element.classList.contains("hidden");
  }
}
