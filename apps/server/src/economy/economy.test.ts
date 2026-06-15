import { describe, expect, test } from "bun:test";
import { DrizzleEconomyStore, EconomyError } from "./economy";

describe("DrizzleEconomyStore", () => {
  test("reads balances and positive inventory rows", async () => {
    const store = new DrizzleEconomyStore(
      queryDouble([[{ dollars: 125 }], [{ itemType: "crate_table", quantity: 2 }]]),
    );

    await expect(store.getBalance("user_1")).resolves.toBe(125);
    await expect(store.getInventory("user_1")).resolves.toEqual([
      { itemType: "crate_table", quantity: 2 },
    ]);
  });

  test("falls back to zero when a balance row is missing", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[]]));

    await expect(store.getBalance("missing_user")).resolves.toBe(0);
  });

  test("purchases sale furniture in a transaction and returns the refreshed inventory", async () => {
    const db = queryDouble();
    const tx = queryDouble([[{ dollars: 75 }], [], [{ itemType: "woven_rug", quantity: 1 }]]);
    db.transaction = async (callback: (transaction: unknown) => unknown) => callback(tx);
    const store = new DrizzleEconomyStore(db);

    await expect(store.purchase("user_1", "woven_rug")).resolves.toEqual({
      balance: 75,
      inventory: [{ itemType: "woven_rug", quantity: 1 }],
    });
  });

  test("rejects unknown furniture before opening a purchase transaction", async () => {
    const db = queryDouble();
    let transactionStarted = false;
    db.transaction = async () => {
      transactionStarted = true;
    };
    const store = new DrizzleEconomyStore(db);

    await expect(store.purchase("user_1", "no_such_item")).rejects.toMatchObject({
      code: "UNKNOWN_ITEM_TYPE",
      message: "This item is not for sale",
    });
    expect(transactionStarted).toBe(false);
  });

  test("rejects purchases when the guarded balance update does not return a row", async () => {
    const db = queryDouble();
    const tx = queryDouble([[]]);
    db.transaction = async (callback: (transaction: unknown) => unknown) => callback(tx);
    const store = new DrizzleEconomyStore(db);

    await expect(store.purchase("user_1", "crate_table")).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
      message: "You need $50 to buy this item",
    });
  });

  test("spends and credits positive amounts through guarded user updates", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[{ dollars: 90 }], [{ dollars: 115 }]]));

    await expect(store.spend("user_1", 10)).resolves.toEqual({ balance: 90 });
    await expect(store.credit("user_1", 25)).resolves.toEqual({ balance: 115 });
  });

  test("returns the current balance for non-positive spends and credits", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[{ dollars: 100 }], [{ dollars: 100 }]]));

    await expect(store.spend("user_1", 0)).resolves.toEqual({ balance: 100 });
    await expect(store.credit("user_1", 0)).resolves.toEqual({ balance: 100 });
  });

  test("rejects spends when the guarded balance update does not return a row", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[]]));

    await expect(store.spend("user_1", 5)).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
      message: "You need $5 for this purchase",
    });
  });

  test("falls back to getBalance when a credit update does not return a row", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[], [{ dollars: 40 }]]));

    await expect(store.credit("user_1", 10)).resolves.toEqual({ balance: 40 });
  });

  test("reserves inventory only when a row can be decremented", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[{ quantity: 1 }], []]));

    await expect(store.reserveItem("user_1", "woven_rug")).resolves.toBe(true);
    await expect(store.reserveItem("user_1", "woven_rug")).resolves.toBe(false);
  });

  test("refunds an inventory item with an upsert", async () => {
    const store = new DrizzleEconomyStore(queryDouble([[]]));

    await expect(store.refundItem("user_1", "woven_rug")).resolves.toBeUndefined();
  });

  test("exposes economy errors with stable codes", () => {
    const error = new EconomyError("NOT_IN_INVENTORY", "missing");

    expect(error.code).toBe("NOT_IN_INVENTORY");
    expect(error.message).toBe("missing");
  });
});

function queryDouble(
  results: unknown[][] = [],
  // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Drizzle database.
): any {
  let index = 0;
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(results[index++] ?? []).then(resolve, reject);
    },
  };

  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "update",
    "set",
    "returning",
    "insert",
    "values",
    "onConflictDoUpdate",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}
