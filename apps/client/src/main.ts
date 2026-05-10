import { createApp } from "./app/createApp";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

createApp(root);
