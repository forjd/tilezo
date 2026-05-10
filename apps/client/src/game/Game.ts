import { Application } from "pixi.js";
import type { ChatPanel } from "../ui/ChatPanel";
import { NetClient } from "./NetClient";
import { RoomScene } from "./RoomScene";

type GameOptions = {
  stage: HTMLElement;
  chat: ChatPanel;
  setStatus: (status: string) => void;
};

export class Game {
  private readonly app = new Application();
  private readonly net = new NetClient();
  private scene?: RoomScene;

  constructor(private readonly options: GameOptions) {}

  async start(username: string, roomId: string): Promise<void> {
    await this.app.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resizeTo: this.options.stage,
    });

    this.options.stage.appendChild(this.app.canvas);
    this.scene = new RoomScene(this.app, (target) => {
      this.net.send({ type: "avatar.move.request", target });
    });

    this.net.onStatus(this.options.setStatus);
    this.net.onMessage((message) => {
      if (message.type === "connected") {
        this.options.setStatus(`connected as ${message.userId}`);
      }

      if (message.type === "room.snapshot") {
        this.options.setStatus(`joined ${message.roomId}`);
      }

      if (message.type === "chat.message") {
        this.options.chat.addMessage(message.username, message.text);
      }

      if (message.type === "error") {
        this.options.setStatus(`${message.code}: ${message.message}`);
      }

      this.scene?.handleServerMessage(message);
    });

    await this.net.connect();
    this.net.send({
      type: "room.join",
      roomId,
      username,
    });

    this.options.chat.onSend((text) => {
      this.net.send({ type: "chat.say", text });
    });

    this.app.ticker.add((ticker) => {
      this.scene?.update(ticker.deltaMS / 1000);
    });

    globalThis.addEventListener("resize", () => this.scene?.resize());
  }

  stop(): void {
    this.net.disconnect();
    this.app.destroy(true);
  }
}
