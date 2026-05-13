import type { PublicRoomSummary } from "@tilezo/protocol/messages";

type RoomBrowserOptions = {
  onJoin: (roomId: string) => void;
  onRefresh: () => void;
};

export class RoomBrowser {
  readonly element = document.createElement("section");

  private readonly list = document.createElement("div");
  private readonly refreshButton = document.createElement("button");
  private readonly closeButton = document.createElement("button");
  private rooms: PublicRoomSummary[] = [];
  private currentRoomId?: string;

  constructor(private readonly options: RoomBrowserOptions) {
    this.element.className = "room-browser hidden";

    const header = document.createElement("header");
    const title = document.createElement("h2");
    const actions = document.createElement("div");

    header.className = "room-browser-header";
    title.textContent = "Rooms";
    actions.className = "room-browser-actions";

    this.refreshButton.type = "button";
    this.refreshButton.className = "secondary-button room-browser-refresh";
    this.refreshButton.textContent = "Refresh";
    this.refreshButton.addEventListener("click", () => this.options.onRefresh());

    this.closeButton.type = "button";
    this.closeButton.className = "secondary-button room-browser-close";
    this.closeButton.textContent = "Close";
    this.closeButton.addEventListener("click", () => this.hide());

    this.list.className = "room-list";
    this.list.addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "button[data-room-id]",
      );

      if (!button || button.disabled) {
        return;
      }

      this.options.onJoin(button.dataset.roomId ?? "");
    });

    actions.append(this.refreshButton, this.closeButton);
    header.append(title, actions);
    this.element.append(header, this.list);
    this.render();
  }

  show(): void {
    this.element.classList.remove("hidden");
    this.options.onRefresh();
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setRooms(rooms: PublicRoomSummary[]): void {
    this.rooms = rooms;
    this.render();
  }

  setCurrentRoom(roomId: string | undefined): void {
    this.currentRoomId = roomId;
    this.render();
  }

  private render(): void {
    this.list.replaceChildren();

    if (this.rooms.length === 0) {
      const empty = document.createElement("p");
      empty.className = "room-list-empty";
      empty.textContent = "No rooms available";
      this.list.append(empty);
      return;
    }

    for (const room of this.rooms) {
      this.list.append(this.createRoomItem(room));
    }
  }

  private createRoomItem(room: PublicRoomSummary): HTMLElement {
    const item = document.createElement("article");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const count = document.createElement("span");
    const button = document.createElement("button");
    const joined = room.joined || room.id === this.currentRoomId;

    item.className = joined ? "room-item joined" : "room-item";
    details.className = "room-item-details";
    count.className = "room-count";
    button.className = "primary-button room-join-button";
    button.type = "button";
    button.disabled = joined;
    button.dataset.roomId = room.id;

    name.textContent = room.name;
    meta.textContent = room.id;
    count.textContent = `${room.userCount} inside`;
    button.textContent = joined ? "Current" : "Join";

    details.append(name, meta);
    item.append(details, count, button);
    return item;
  }
}
