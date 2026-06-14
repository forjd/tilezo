import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import type { RoomItem } from "@tilezo/protocol/furniture";
import type {
  ClientMessage,
  DirectMessage,
  DirectMessageDeletedMessage,
  DirectMessageEditedMessage,
  DirectMessageReadReceiptMessage,
  DirectMessageTypingStatusMessage,
  PublicRoomSummary,
  RoomSnapshotMessage,
} from "@tilezo/protocol/messages";
import { Application } from "pixi.js";
import type { ChatPanel } from "../ui/ChatPanel";
import { NetClient } from "./NetClient";
import { type FurnitureEditMode, type FurnitureEditRequest, RoomScene } from "./RoomScene";

type GameOptions = {
  stage: HTMLElement;
  chat: ChatPanel;
  setStatus: (status: string) => void;
  setRooms: (rooms: PublicRoomSummary[]) => void;
  onRoomJoined: (snapshot: RoomSnapshotMessage) => void;
  onDirectMessage: (message: DirectMessage) => void;
  onDirectTyping: (message: DirectMessageTypingStatusMessage) => void;
  onDirectRead: (message: DirectMessageReadReceiptMessage) => void;
  onDirectEdited: (message: DirectMessageEditedMessage) => void;
  onDirectDeleted: (message: DirectMessageDeletedMessage) => void;
  onFurnitureItemsChanged: (items: RoomItem[]) => void;
  onDisconnected: () => void;
};

type GameDependencies = {
  createApplication?: () => Application;
  createNetClient?: () => NetClient;
  createRoomScene?: (
    app: Application,
    onMoveRequest: (target: { x: number; y: number }) => void,
    onInteraction: () => void,
    onFurnitureEditRequest: (request: FurnitureEditRequest) => void,
  ) => RoomScene;
  globalTarget?: Pick<typeof globalThis, "addEventListener" | "removeEventListener">;
};

export class Game {
  private readonly app: Application;
  private readonly cleanup: (() => void)[] = [];
  private readonly createRoomScene: NonNullable<GameDependencies["createRoomScene"]>;
  private readonly globalTarget: Pick<
    typeof globalThis,
    "addEventListener" | "removeEventListener"
  >;
  private readonly net: NetClient;
  private scene?: RoomScene;
  private connected = false;
  private initialized = false;
  private currentItems: RoomItem[] = [];

  constructor(
    private readonly options: GameOptions,
    dependencies: GameDependencies = {},
  ) {
    this.app = dependencies.createApplication?.() ?? new Application();
    this.net = dependencies.createNetClient?.() ?? new NetClient();
    this.createRoomScene =
      dependencies.createRoomScene ??
      ((app, onMoveRequest, onInteraction, onFurnitureEditRequest) =>
        new RoomScene(app, onMoveRequest, onInteraction, onFurnitureEditRequest));
    this.globalTarget = dependencies.globalTarget ?? globalThis;
  }

  async start(): Promise<void> {
    try {
      await this.app.init({
        antialias: false,
        autoDensity: true,
        backgroundAlpha: 0,
        resizeTo: this.options.stage,
        roundPixels: true,
      });
      this.initialized = true;

      this.app.canvas.style.imageRendering = "pixelated";
      this.options.stage.appendChild(this.app.canvas);
      this.scene = this.createRoomScene(
        this.app,
        (target) => {
          this.sendIfConnected({ type: "avatar.move.request", target });
        },
        () => this.options.chat.focusInput(),
        (request) => this.sendFurnitureEditRequest(request),
      );

      this.cleanup.push(this.net.onStatus(this.options.setStatus));
      this.cleanup.push(
        this.net.onDisconnect(() => {
          this.connected = false;
          this.app.ticker.stop();
          this.options.onDisconnected();
        }),
      );
      this.cleanup.push(
        this.net.onMessage((message) => {
          if (message.type === "connected") {
            this.options.setStatus(`connected as ${message.userId}`);
          }

          if (message.type === "room.snapshot") {
            this.options.setStatus(`joined ${message.roomId}`);
            this.options.onRoomJoined(message);
            this.currentItems = message.items.map(cloneRoomItem);
            this.options.onFurnitureItemsChanged(this.currentItems.map(cloneRoomItem));
            this.refreshRooms();
          }

          if (message.type === "room.list") {
            this.options.setRooms(message.rooms);
          }

          if (message.type === "chat.message") {
            this.options.chat.addMessage(message.username, message.text, message.sentAt);
          }

          if (message.type === "dm.message") {
            this.options.onDirectMessage(message);
          }

          if (message.type === "dm.typing") {
            this.options.onDirectTyping(message);
          }

          if (message.type === "dm.read") {
            this.options.onDirectRead(message);
          }

          if (message.type === "dm.edited") {
            this.options.onDirectEdited(message);
          }

          if (message.type === "dm.deleted") {
            this.options.onDirectDeleted(message);
          }

          if (
            message.type === "room.item.placed" ||
            message.type === "room.item.moved" ||
            message.type === "room.item.state_updated"
          ) {
            this.upsertItem(message.item);
          }

          if (message.type === "room.item.picked_up") {
            this.removeItem(message.itemId);
          }

          if (message.type === "error") {
            this.options.setStatus(`${message.code}: ${message.message}`);
          }

          try {
            this.scene?.handleServerMessage(message);
          } catch (error) {
            // Never let one malformed/unexpected message tear down the message loop or the
            // scene; surface it and keep processing subsequent updates.
            this.options.setStatus("error rendering room update");
            console.error("RoomScene failed to handle server message", message.type, error);
          }
        }),
      );

      await this.net.connect();
      this.connected = true;
      this.refreshRooms();

      this.options.chat.onSend((text) => {
        return this.sendIfConnected({ type: "chat.say", text });
      });
      this.options.chat.onTypingChange((isTyping) => {
        this.sendIfConnected({ type: "chat.typing", isTyping });
      });

      const updateScene = (ticker: { deltaMS: number }) => {
        this.scene?.update(ticker.deltaMS / 1000);
      };
      this.app.ticker.add(updateScene);
      this.cleanup.push(() => this.app.ticker.remove(updateScene));

      const resizeScene = () => this.scene?.resize();
      this.globalTarget.addEventListener("resize", resizeScene);
      this.cleanup.push(() => this.globalTarget.removeEventListener("resize", resizeScene));
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  joinRoom(roomId: string): void {
    this.sendIfConnected({
      type: "room.join",
      roomId,
    });
  }

  refreshRooms(): void {
    this.sendIfConnected({ type: "room.list.request" });
  }

  updateAppearance(appearance: AvatarAppearance): void {
    this.sendIfConnected({ type: "avatar.appearance.update", appearance });
  }

  sendDirectMessage(toUserId: string, text: string): boolean {
    return this.sendIfConnected({ type: "dm.send", toUserId, text });
  }

  sendDirectTyping(toUserId: string, isTyping: boolean): boolean {
    return this.sendIfConnected({ type: "dm.typing", toUserId, isTyping });
  }

  markDirectMessagesRead(friendId: string): boolean {
    return this.sendIfConnected({ type: "dm.read", friendId });
  }

  editDirectMessage(messageId: string, text: string): boolean {
    return this.sendIfConnected({ type: "dm.edit", messageId, text });
  }

  deleteDirectMessage(messageId: string): boolean {
    return this.sendIfConnected({ type: "dm.delete", messageId });
  }

  setFurnitureEditMode(mode?: FurnitureEditMode): void {
    this.scene?.setFurnitureEditMode(mode);
  }

  pickupRoomItem(itemId: string): boolean {
    return this.sendIfConnected({ type: "room.item.pickup.request", itemId });
  }

  async reconnect(): Promise<void> {
    // Drop stale avatars before reconnecting so the player does not see a frozen copy of
    // the previous room while the server re-sends a snapshot (or, in edge cases where no
    // snapshot arrives, an honest empty scene instead of a misleading stale one).
    this.scene?.clear();
    await this.net.connect();
    this.connected = true;
    this.app.ticker.start();
    this.refreshRooms();
  }

  stop(): void {
    for (const cleanup of this.cleanup.splice(0)) {
      cleanup();
    }
    this.scene?.destroy();
    this.scene = undefined;
    this.connected = false;
    this.net.disconnect();
    if (this.initialized) {
      this.initialized = false;
      this.app.destroy(true);
    }
  }

  private sendIfConnected(message: ClientMessage): boolean {
    if (!this.connected) {
      this.options.setStatus("disconnected");
      return false;
    }

    try {
      this.net.send(message);
      return true;
    } catch {
      this.connected = false;
      this.options.setStatus("disconnected");
      return false;
    }
  }

  private sendFurnitureEditRequest(request: FurnitureEditRequest): void {
    if (request.type === "place") {
      this.sendIfConnected({
        type: "room.item.place.request",
        itemType: request.itemType,
        position: request.position,
        rotation: request.rotation,
      });
      return;
    }

    this.sendIfConnected({
      type: "room.item.move.request",
      itemId: request.itemId,
      position: request.position,
      rotation: request.rotation,
    });
  }

  private upsertItem(item: RoomItem): void {
    const nextItem = cloneRoomItem(item);
    const existingIndex = this.currentItems.findIndex((candidate) => candidate.id === item.id);

    if (existingIndex >= 0) {
      this.currentItems[existingIndex] = nextItem;
    } else {
      this.currentItems.push(nextItem);
    }

    this.options.onFurnitureItemsChanged(this.currentItems.map(cloneRoomItem));
  }

  private removeItem(itemId: string): void {
    this.currentItems = this.currentItems.filter((item) => item.id !== itemId);
    this.options.onFurnitureItemsChanged(this.currentItems.map(cloneRoomItem));
  }
}

function cloneRoomItem(item: RoomItem): RoomItem {
  return {
    ...item,
    state: { ...item.state },
  };
}
