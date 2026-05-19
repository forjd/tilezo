import { createApp } from "./app/createApp";

loadRuntimeConfig();

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

createApp(root);

function loadRuntimeConfig(): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const apiUrl = params.get("tilezoApiUrl") ?? localStorage.getItem("tilezoApiUrl");
  const wsUrl = params.get("tilezoWsUrl") ?? localStorage.getItem("tilezoWsUrl");

  if (params.has("tilezoApiUrl") && apiUrl) {
    localStorage.setItem("tilezoApiUrl", apiUrl);
  }

  if (params.has("tilezoWsUrl") && wsUrl) {
    localStorage.setItem("tilezoWsUrl", wsUrl);
  }

  if (apiUrl || wsUrl) {
    window.TILEZO_CONFIG = {
      PUBLIC_API_URL: apiUrl ?? undefined,
      PUBLIC_WS_URL: wsUrl ?? undefined,
    };
  }
}

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
