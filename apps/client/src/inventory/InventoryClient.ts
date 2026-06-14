import type { InventoryItem } from "@tilezo/protocol";
import { DEFAULT_API_URL } from "../assets";

export type { InventoryItem };

export type PurchaseResult = {
  balance: number;
  items: InventoryItem[];
};

export async function getInventory(): Promise<InventoryItem[]> {
  const response = await fetch(`${getApiUrl()}/inventory`, {
    credentials: "include",
  });
  const body = await readJson<{ items?: InventoryItem[] } | { error?: { message?: string } }>(
    response,
  );

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Inventory failed");
  }

  return (body as { items: InventoryItem[] }).items ?? [];
}

export async function purchaseItem(itemType: string): Promise<PurchaseResult> {
  const response = await fetch(`${getApiUrl()}/inventory/purchase`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemType }),
  });
  const body = await readJson<PurchaseResult | { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error?.message : "Purchase failed");
  }

  return body as PurchaseResult;
}

function getApiUrl(): string {
  const runtimeConfigured =
    typeof window === "undefined" ? undefined : window.TILEZO_CONFIG?.PUBLIC_API_URL;
  const buildConfigured = typeof process === "undefined" ? undefined : process.env.PUBLIC_API_URL;
  return runtimeConfigured ?? buildConfigured ?? DEFAULT_API_URL;
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
