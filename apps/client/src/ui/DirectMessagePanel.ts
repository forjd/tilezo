import type { DirectMessage } from "@tilezo/protocol/messages";

type DirectMessagePanelOptions = {
  onSend: (friendId: string, text: string) => boolean | undefined;
  onTypingChange?: (friendId: string, isTyping: boolean) => void;
  onRead?: (friendId: string) => void;
  onEdit?: (messageId: string, text: string) => boolean | undefined;
  onDelete?: (messageId: string) => boolean | undefined;
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
  private readonly messageElements = new Map<string, HTMLElement>();

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
    this.messageList.addEventListener("click", (event) => this.handleMessageAction(event));

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
    this.messageElements.clear();
    this.setFriendTyping(friend.id, false);

    for (const message of history) {
      this.renderMessage(message);
    }

    this.element.classList.remove("hidden");
    this.options.onRead?.(friend.id);
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
      this.options.onRead?.(message.fromUserId);
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

  dispose(): void {
    this.setOwnTyping(false);
    this.conversation = undefined;
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

  markRead(messageIds: string[]): boolean {
    if (!this.conversation || this.isHidden()) {
      return false;
    }

    let updated = false;

    for (const messageId of messageIds) {
      const element = this.messageElements.get(messageId);

      if (element) {
        element.dataset.read = "true";
        updated = true;
      }
    }

    return updated;
  }

  updateEdited(message: { id: string; text: string; editedAt: string }): boolean {
    const element = this.messageElements.get(message.id);

    if (!element || element.dataset.deleted === "true") {
      return false;
    }

    element.dataset.text = message.text;
    element.dataset.edited = "true";
    this.setMessageBody(element, formatMessageText(message.text, message.editedAt));
    return true;
  }

  markDeleted(messageId: string): boolean {
    const element = this.messageElements.get(messageId);

    if (!element) {
      return false;
    }

    element.dataset.deleted = "true";
    element.dataset.text = "";
    element.classList.add("dm-message-deleted");
    this.setMessageBody(element, "Message deleted");
    element.replaceChildren(element.children[0] as HTMLElement);
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
    const body = document.createElement("span");
    item.className = mine ? "dm-message dm-message-mine" : "dm-message dm-message-theirs";
    item.dataset.messageId = message.id;
    item.dataset.read = mine && message.readAt ? "true" : "false";
    item.dataset.text = message.deletedAt ? "" : message.text;
    item.dataset.edited = message.editedAt ? "true" : "false";
    item.dataset.deleted = message.deletedAt ? "true" : "false";
    body.className = "dm-message-text";
    body.textContent = formatMessageText(message.text, message.editedAt, message.deletedAt);
    item.append(body);

    if (message.deletedAt) {
      item.classList.add("dm-message-deleted");
    } else if (mine) {
      item.append(this.createMessageActions(message.id));
    }

    this.messageList.append(item);
    this.messageElements.set(message.id, item);
  }

  private createMessageActions(messageId: string): HTMLElement {
    const actions = document.createElement("span");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    actions.className = "dm-message-actions";
    editButton.type = "button";
    editButton.className = "dm-message-action";
    editButton.dataset.editMessageId = messageId;
    editButton.textContent = "Edit";
    deleteButton.type = "button";
    deleteButton.className = "dm-message-action";
    deleteButton.dataset.deleteMessageId = messageId;
    deleteButton.textContent = "Delete";
    actions.append(editButton, deleteButton);
    return actions;
  }

  private handleMessageAction(event: Event): void {
    const target = event.target as Element | null;
    const editButton = target?.closest<HTMLButtonElement>("button[data-edit-message-id]");
    const deleteButton = target?.closest<HTMLButtonElement>("button[data-delete-message-id]");

    if (editButton) {
      const messageId = editButton.dataset.editMessageId ?? "";
      const element = this.messageElements.get(messageId);
      const currentText = element?.dataset.text ?? "";
      const nextText = prompt("Edit message", currentText)?.trim();

      if (!messageId || !nextText || nextText === currentText) {
        return;
      }

      this.options.onEdit?.(messageId, nextText);
      return;
    }

    if (deleteButton) {
      const messageId = deleteButton.dataset.deleteMessageId ?? "";

      if (messageId) {
        this.options.onDelete?.(messageId);
      }
    }
  }

  private setMessageBody(element: HTMLElement, text: string): void {
    const body = element.children[0] as HTMLElement | undefined;

    if (body) {
      body.textContent = text;
    }
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

function formatMessageText(text: string, editedAt?: string, deletedAt?: string): string {
  if (deletedAt) {
    return "Message deleted";
  }

  return editedAt ? `${text} (edited)` : text;
}
