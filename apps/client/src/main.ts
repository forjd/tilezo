import { createApp } from "./app/createApp";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

createApp(root);

declare global {
  interface Window {
    TILEZO_CONFIG?: {
      PUBLIC_API_URL?: string;
      PUBLIC_WS_URL?: string;
    };
  }
}
