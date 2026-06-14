import { loadRuntimeConfig } from "../runtimeConfig";
import { createApp } from "./createApp";

type BootstrapAppOptions = {
  create?: (root: HTMLElement) => void;
  document?: Pick<Document, "querySelector">;
  loadConfig?: () => Promise<void>;
};

export async function bootstrapApp(options: BootstrapAppOptions = {}): Promise<void> {
  const documentRef = options.document ?? document;
  const root = documentRef.querySelector<HTMLElement>("#app");

  if (!root) {
    throw new Error("Missing #app root");
  }

  await (options.loadConfig ?? loadRuntimeConfig)();
  (options.create ?? createApp)(root);
}
