import type { RoomLayout } from "@tilezo/engine";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  appearance: jsonb("appearance")
    .$type<AvatarAppearance>()
    .notNull()
    .default(DEFAULT_AVATAR_APPEARANCE),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull().default("public"),
    access: text("access").notNull().default("open"),
    capacity: integer("capacity").notNull().default(25),
    layout: jsonb("layout").$type<RoomLayout>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rooms_owner_user_id_idx").on(table.ownerUserId),
    index("rooms_visibility_name_id_idx").on(table.visibility, table.name, table.id),
  ],
);

export const roomItems = pgTable(
  "room_items",
  {
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
  },
  (table) => [
    index("room_items_room_id_idx").on(table.roomId),
    index("room_items_room_id_position_idx").on(table.roomId, table.x, table.y, table.z),
  ],
);

export const userRoomSessions = pgTable(
  "user_room_sessions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_room_sessions_room_id_idx").on(table.roomId)],
);

export const friendships = pgTable(
  "friendships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendUserId: text("friend_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.friendUserId] }),
    index("friendships_friend_user_id_idx").on(table.friendUserId),
  ],
);
