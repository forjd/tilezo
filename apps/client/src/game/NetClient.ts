import type { ClientMessage, ServerMessage } from "@tilezo/protocol";
import { DEFAULT_WS_URL } from "../assets";

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: string) => void;

export class NetClient {
  private socket?: WebSocket;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();

  async connect(token: string): Promise<void> {
    const wsUrl = getWebSocketUrl(token);
    this.emitStatus(`connecting to ${wsUrl}`);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.emitStatus("connected");
        resolve();
      });
      socket.addEventListener("error", () => {
        this.emitStatus("connection error");
        reject(new Error("WebSocket connection failed"));
      });
      socket.addEventListener("close", () => {
        this.emitStatus("disconnected");
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

  disconnect(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private handleRawMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    try {
      const message = JSON.parse(raw) as ServerMessage;

      for (const handler of this.messageHandlers) {
        handler(message);
      }
    } catch {
      this.emitStatus("received invalid server message");
    }
  }

  private emitStatus(status: string): void {
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}

function getWebSocketUrl(token: string): string {
  const configured = getPublicEnv("PUBLIC_WS_URL");
  const baseUrl =
    configured ??
    (location.protocol === "https:" ? DEFAULT_WS_URL.replace("ws://", "wss://") : DEFAULT_WS_URL);
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);

  return url.toString();
}

function getPublicEnv(key: string): string | undefined {
  const env = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };

  return env.env?.[key];
}
