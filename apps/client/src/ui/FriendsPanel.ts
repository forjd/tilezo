import type { FriendSummary } from "../friends/FriendClient";
import { AvatarPreview } from "./AvatarPreview";

type FriendsPanelOptions = {
  onAdd: (username: string) => void;
  onJoinRoom: (roomId: string) => void;
  onMessage: (friend: FriendSummary) => void;
  onRefresh: () => void;
  onRemove: (friendId: string) => void;
};

export class FriendsPanel {
  readonly element = document.createElement("section");

  private readonly form = document.createElement("form");
  private readonly input = document.createElement("input");
  private readonly list = document.createElement("div");
  private readonly message = document.createElement("p");
  private readonly refreshButton = document.createElement("button");
  private readonly closeButton = document.createElement("button");
  private friends: FriendSummary[] = [];

  constructor(private readonly options: FriendsPanelOptions) {
    this.element.className = "friends-panel hidden";

    const header = document.createElement("header");
    const title = document.createElement("h2");
    const actions = document.createElement("div");
    const addButton = document.createElement("button");

    header.className = "room-browser-header";
    title.textContent = "Friends";
    actions.className = "room-browser-actions";

    this.refreshButton.type = "button";
    this.refreshButton.className = "secondary-button room-browser-refresh";
    this.refreshButton.textContent = "Refresh";
    this.refreshButton.addEventListener("click", () => this.options.onRefresh());

    this.closeButton.type = "button";
    this.closeButton.className = "secondary-button room-browser-close";
    this.closeButton.textContent = "Close";
    this.closeButton.addEventListener("click", () => this.hide());

    this.form.className = "friends-add-form";
    this.input.type = "text";
    this.input.name = "username";
    this.input.placeholder = "Add by username";
    this.input.autocomplete = "off";
    addButton.type = "submit";
    addButton.className = "primary-button friends-add-button";
    addButton.textContent = "Add";
    this.form.append(this.input, addButton);
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = this.input.value.trim();

      if (!username) {
        return;
      }

      this.options.onAdd(username);
      this.input.value = "";
    });

    this.message.className = "friends-message";
    this.list.className = "friends-list";
    this.list.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const joinButton = target?.closest<HTMLButtonElement>("button[data-room-id]");
      const messageButton = target?.closest<HTMLButtonElement>("button[data-message-friend-id]");
      const removeButton = target?.closest<HTMLButtonElement>("button[data-friend-id]");

      if (joinButton && !joinButton.disabled) {
        this.options.onJoinRoom(joinButton.dataset.roomId ?? "");
        this.hide();
        return;
      }

      if (messageButton) {
        const friend = this.friends.find((f) => f.id === messageButton.dataset.messageFriendId);

        if (friend) {
          this.options.onMessage(friend);
        }
        return;
      }

      if (removeButton && !removeButton.disabled) {
        this.options.onRemove(removeButton.dataset.friendId ?? "");
      }
    });

    actions.append(this.refreshButton, this.closeButton);
    header.append(title, actions);
    this.element.append(header, this.form, this.message, this.list);
    this.render();
  }

  show(): void {
    this.element.classList.remove("hidden");
    this.options.onRefresh();
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setFriends(friends: FriendSummary[]): void {
    this.friends = friends;
    this.message.textContent = "";
    this.message.classList.remove("visible");
    this.render();
  }

  showError(message: string): void {
    this.message.textContent = message;
    this.message.classList.add("visible");
  }

  private render(): void {
    this.list.replaceChildren();

    if (this.friends.length === 0) {
      const empty = document.createElement("p");
      empty.className = "room-list-empty";
      empty.textContent = "No friends yet";
      this.list.append(empty);
      return;
    }

    for (const friend of this.friends) {
      this.list.append(this.createFriendItem(friend));
    }
  }

  private createFriendItem(friend: FriendSummary): HTMLElement {
    const item = document.createElement("article");
    const preview = new AvatarPreview(document);
    const details = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const joinButton = document.createElement("button");
    const messageButton = document.createElement("button");
    const removeButton = document.createElement("button");

    item.className = friend.online ? "friend-item online" : "friend-item";
    preview.element.classList.add("friend-avatar");
    preview.update(friend.appearance);
    void preview.mount();
    details.className = "friend-details";
    actions.className = "friend-actions";
    joinButton.type = "button";
    joinButton.className = "primary-button friend-join-button";
    joinButton.disabled = !friend.canJoinRoom || !friend.roomId;
    joinButton.dataset.roomId = friend.roomId ?? "";
    joinButton.textContent = friend.roomId ? "Join" : "Away";
    messageButton.type = "button";
    messageButton.className = "secondary-button friend-message-button";
    messageButton.dataset.messageFriendId = friend.id;
    messageButton.textContent = "Message";
    removeButton.type = "button";
    removeButton.className = "secondary-button friend-remove-button";
    removeButton.dataset.friendId = friend.id;
    removeButton.textContent = "Remove";

    name.textContent = friend.username;
    meta.textContent = friend.online
      ? friend.roomId
        ? `online in ${friend.roomId}`
        : "online"
      : "offline";

    details.append(name, meta);
    actions.append(joinButton, messageButton, removeButton);
    item.append(preview.element, details, actions);
    return item;
  }
}
