import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_API_URL } from "../assets";
import { getInventory, purchaseItem } from "./InventoryClient";

const originalFetch = globalThis.fetch;
const originalPublicApiUrl = Bun.env.PUBLIC_API_URL;
type FetchArgs = Parameters<typeof fetch>;

describe("getInventory", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("loads the authenticated user's inventory", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ items: [{ itemType: "crate_table", quantity: 2 }] });
    }) as unknown as typeof fetch;

    await expect(getInventory()).resolves.toEqual([{ itemType: "crate_table", quantity: 2 }]);
    expect(requests[0]).toEqual({
      url: `${DEFAULT_API_URL}/inventory`,
      init: { credentials: "include" },
    });
  });

  test("returns an empty list when the payload is absent", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;
    await expect(getInventory()).resolves.toEqual([]);
  });

  test("throws the server error message on failure", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      Response.json(
        { error: { message: "Log in to view inventory" } },
        { status: 401 },
      )) as unknown as typeof fetch;
    await expect(getInventory()).rejects.toThrow("Log in to view inventory");
  });

  test("throws a fallback error when the response is malformed", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      new Response("not json", { status: 500 })) as unknown as typeof fetch;
    await expect(getInventory()).rejects.toThrow("Inventory failed");
  });
});

describe("purchaseItem", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restorePublicApiUrl();
  });

  test("posts the item type and returns the purchase result", async () => {
    delete Bun.env.PUBLIC_API_URL;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: FetchArgs[0], init?: FetchArgs[1]) => {
      requests.push({ url: String(url), init });
      return Response.json({ balance: 450, items: [{ itemType: "crate_table", quantity: 1 }] });
    }) as unknown as typeof fetch;

    await expect(purchaseItem("crate_table")).resolves.toEqual({
      balance: 450,
      items: [{ itemType: "crate_table", quantity: 1 }],
    });

    expect(requests[0]).toEqual({
      url: `${DEFAULT_API_URL}/inventory/purchase`,
      init: {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemType: "crate_table" }),
      },
    });
  });

  test("throws the server error message on failure", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      Response.json(
        { error: { message: "Insufficient funds" } },
        { status: 402 },
      )) as unknown as typeof fetch;
    await expect(purchaseItem("crate_table")).rejects.toThrow("Insufficient funds");
  });

  test("throws a fallback error when the response is malformed", async () => {
    delete Bun.env.PUBLIC_API_URL;
    globalThis.fetch = (async () =>
      new Response("not json", { status: 500 })) as unknown as typeof fetch;
    await expect(purchaseItem("crate_table")).rejects.toThrow("Purchase failed");
  });
});

function restorePublicApiUrl(): void {
  if (originalPublicApiUrl === undefined) {
    delete Bun.env.PUBLIC_API_URL;
  } else {
    Bun.env.PUBLIC_API_URL = originalPublicApiUrl;
  }
}
