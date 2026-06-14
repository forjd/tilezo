import {
  getFurnitureDefinition,
  type InventoryItem as ProtocolInventoryItem,
} from "@tilezo/protocol";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { userInventory, users } from "../db/schema";

export type InventoryItem = ProtocolInventoryItem;

export type EconomyStore = {
  getBalance(userId: string): Promise<number>;
  getInventory(userId: string): Promise<InventoryItem[]>;
  purchase(
    userId: string,
    itemType: string,
  ): Promise<{ balance: number; inventory: InventoryItem[] }>;
  spend(userId: string, amount: number): Promise<{ balance: number }>;
  credit(userId: string, amount: number): Promise<{ balance: number }>;
  reserveItem(userId: string, itemType: string): Promise<boolean>;
  refundItem(userId: string, itemType: string): Promise<void>;
};

export class EconomyError extends Error {
  constructor(
    readonly code: "INSUFFICIENT_FUNDS" | "UNKNOWN_ITEM_TYPE" | "NOT_IN_INVENTORY",
    message: string,
  ) {
    super(message);
  }
}

export class DrizzleEconomyStore implements EconomyStore {
  constructor(private readonly db: TilezoDatabase) {}

  async getBalance(userId: string): Promise<number> {
    const [user] = await this.db
      .select({ dollars: users.dollars })
      .from(users)
      .where(eq(users.id, userId));
    return user?.dollars ?? 0;
  }

  async getInventory(userId: string): Promise<InventoryItem[]> {
    const rows = await this.db
      .select({ itemType: userInventory.itemType, quantity: userInventory.quantity })
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), gt(userInventory.quantity, 0)))
      .orderBy(userInventory.itemType);
    return rows;
  }

  async purchase(
    userId: string,
    itemType: string,
  ): Promise<{ balance: number; inventory: InventoryItem[] }> {
    const price = furniturePrice(itemType);

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ dollars: sql`${users.dollars} - ${price}` })
        .where(and(eq(users.id, userId), gte(users.dollars, price)))
        .returning({ dollars: users.dollars });

      if (!updated) {
        throw new EconomyError(
          "INSUFFICIENT_FUNDS",
          `You need $${price.toString()} to buy this item`,
        );
      }

      await tx
        .insert(userInventory)
        .values({
          userId,
          itemType,
          quantity: 1,
        })
        .onConflictDoUpdate({
          target: [userInventory.userId, userInventory.itemType],
          set: {
            quantity: sql`${userInventory.quantity} + 1`,
            updatedAt: new Date(),
          },
        });

      return {
        balance: updated.dollars,
        inventory: await getInventoryInTransaction(tx, userId),
      };
    });
  }

  async spend(userId: string, amount: number): Promise<{ balance: number }> {
    if (amount <= 0) {
      return { balance: await this.getBalance(userId) };
    }

    const [updated] = await this.db
      .update(users)
      .set({ dollars: sql`${users.dollars} - ${amount}` })
      .where(and(eq(users.id, userId), gte(users.dollars, amount)))
      .returning({ dollars: users.dollars });

    if (!updated) {
      throw new EconomyError(
        "INSUFFICIENT_FUNDS",
        `You need $${amount.toString()} for this purchase`,
      );
    }

    return { balance: updated.dollars };
  }

  async credit(userId: string, amount: number): Promise<{ balance: number }> {
    if (amount <= 0) {
      return { balance: await this.getBalance(userId) };
    }

    const [updated] = await this.db
      .update(users)
      .set({ dollars: sql`${users.dollars} + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ dollars: users.dollars });

    return { balance: updated?.dollars ?? (await this.getBalance(userId)) };
  }

  async reserveItem(userId: string, itemType: string): Promise<boolean> {
    const [updated] = await this.db
      .update(userInventory)
      .set({
        quantity: sql`${userInventory.quantity} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userInventory.userId, userId),
          eq(userInventory.itemType, itemType),
          gt(userInventory.quantity, 0),
        ),
      )
      .returning({ quantity: userInventory.quantity });

    return Boolean(updated);
  }

  async refundItem(userId: string, itemType: string): Promise<void> {
    await this.db
      .insert(userInventory)
      .values({
        userId,
        itemType,
        quantity: 1,
      })
      .onConflictDoUpdate({
        target: [userInventory.userId, userInventory.itemType],
        set: {
          quantity: sql`${userInventory.quantity} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}

function furniturePrice(itemType: string): number {
  const definition = getFurnitureDefinition(itemType);
  const price = definition?.price;

  if (!definition || typeof price !== "number" || price <= 0) {
    throw new EconomyError("UNKNOWN_ITEM_TYPE", "This item is not for sale");
  }

  return price;
}

async function getInventoryInTransaction(
  tx: TilezoDatabase,
  userId: string,
): Promise<InventoryItem[]> {
  const rows = await tx
    .select({ itemType: userInventory.itemType, quantity: userInventory.quantity })
    .from(userInventory)
    .where(and(eq(userInventory.userId, userId), gt(userInventory.quantity, 0)))
    .orderBy(userInventory.itemType);
  return rows;
}
