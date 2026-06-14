import { parseServerMessage } from "@tilezo/protocol";
import type { ClientMessage, ServerMessage } from "@tilezo/protocol/messages";
import { getWebSocketUrl } from "../config";

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: string) => void;
type DisconnectHandler = () => void;

export class NetClient {
  private socket?: WebSocket;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly disconnectHandlers = new Set<DisconnectHandler>();

  async connect(): Promise<void> {
    const wsUrl = getWebSocketUrl();
    this.emitStatus(`connecting to ${wsUrl}`);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      this.socket = socket;
      let opened = false;
      let settled = false;

      socket.addEventListener("open", () => {
        opened = true;
        settled = true;
        this.emitStatus("connected");
        resolve();
      });
      socket.addEventListener("error", () => {
        this.emitStatus("connection error");
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket connection failed"));
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) {
          this.socket = undefined;
        }

        this.emitStatus("disconnected");
        if (opened) {
          this.emitDisconnect();
        }
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket connection closed"));
        }
      });
      socket.addEventListener("message", (event) => {
        this.handleRawMessage(event.data);
      });
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }

    this.socket.send(JSON.stringify(message));
  }

  onMessage(callback: MessageHandler): () => void {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  onStatus(callback: StatusHandler): () => void {
    this.statusHandlers.add(callback);
    return () => this.statusHandlers.delete(callback);
  }

  onDisconnect(callback: DisconnectHandler): () => void {
    this.disconnectHandlers.add(callback);
    return () => this.disconnectHandlers.delete(callback);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private handleRawMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.emitStatus("received invalid server message");
      return;
    }

    // Validate the server message against the shared schema instead of blindly casting,
    // so a malformed or skewed payload is reported cleanly rather than throwing deep in
    // the scene/avatar code and silently dropping a state update.
    const parsed = parseServerMessage(parsedJson);

    if (!parsed.ok) {
      this.emitStatus("received invalid server message");
      return;
    }

    for (const handler of this.messageHandlers) {
      handler(parsed.value);
    }
  }

  private emitStatus(status: string): void {
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private emitDisconnect(): void {
    for (const handler of this.disconnectHandlers) {
      handler();
    }
  }
}
