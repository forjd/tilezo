import type { AvatarAppearance } from "@tilezo/protocol/appearance";
import type {
  ClientMessage,
  DirectMessage,
  DirectMessageTypingStatusMessage,
  PublicRoomSummary,
  RoomSnapshotMessage,
} from "@tilezo/protocol/messages";
import { Application } from "pixi.js";
import type { ChatPanel } from "../ui/ChatPanel";
import { NetClient } from "./NetClient";
import { RoomScene } from "./RoomScene";

type GameOptions = {
  stage: HTMLElement;
  chat: ChatPanel;
  setStatus: (status: string) => void;
  setRooms: (rooms: PublicRoomSummary[]) => void;
  onRoomJoined: (snapshot: RoomSnapshotMessage) => void;
  onDirectMessage: (message: DirectMessage) => void;
  onDirectTyping: (message: DirectMessageTypingStatusMessage) => void;
  onDisconnected: () => void;
};

export class Game {
  private readonly app = new Application();
  private readonly net = new NetClient();
  private readonly cleanup: (() => void)[] = [];
  private scene?: RoomScene;
  private connected = false;
  private initialized = false;

  constructor(private readonly options: GameOptions) {}

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
      this.scene = new RoomScene(
        this.app,
        (target) => {
          this.sendIfConnected({ type: "avatar.move.request", target });
        },
        () => this.options.chat.focusInput(),
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
      globalThis.addEventListener("resize", resizeScene);
      this.cleanup.push(() => globalThis.removeEventListener("resize", resizeScene));
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
}
