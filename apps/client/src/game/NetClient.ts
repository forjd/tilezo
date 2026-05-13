import type { ClientMessage, ServerMessage } from "@tilezo/protocol/messages";
import { DEFAULT_WS_URL } from "../assets";

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: string) => void;
type DisconnectHandler = () => void;

export class NetClient {
  private socket?: WebSocket;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly disconnectHandlers = new Set<DisconnectHandler>();

  async connect(token: string): Promise<void> {
    const wsUrl = getWebSocketUrl(token);
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

  private emitDisconnect(): void {
    for (const handler of this.disconnectHandlers) {
      handler();
    }
  }
}

function getWebSocketUrl(token: string): string {
  const runtimeConfigured =
    typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.PUBLIC_WS_URL;
  const buildConfigured = typeof process === "undefined" ? undefined : process.env.PUBLIC_WS_URL;
  const browserDefault = getBrowserWebSocketUrl();
  const baseUrl = runtimeConfigured ?? buildConfigured ?? browserDefault ?? DEFAULT_WS_URL;
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);

  return url.toString();
}

function getBrowserWebSocketUrl(): string | undefined {
  if (typeof location === "undefined") {
    return undefined;
  }

  return location.protocol === "https:" ? DEFAULT_WS_URL.replace("ws://", "wss://") : undefined;
}

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
