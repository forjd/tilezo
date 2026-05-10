import type { RoomLayout } from "@tilezo/engine";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  layout: jsonb("layout").$type<RoomLayout>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roomItems = pgTable("room_items", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  z: integer("z").notNull().default(0),
  rotation: integer("rotation").notNull().default(0),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
