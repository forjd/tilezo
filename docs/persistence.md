# Persistence

The server uses Drizzle for typed Postgres schema and migrations.

The current server has:

- `apps/server/drizzle.config.ts`
- `apps/server/src/db/db.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/`

## Durable Entities

Persist:

- Users, including account balance in `dollars`.
- Rooms.
- Room layouts.
- Room items.
- Private room ownership.
- User inventory (`user_inventory`) keyed by user and item type, with per-item quantities.

Do not persist:

- Chat messages, until chat history becomes part of the product.
- High-frequency movement updates.
- Every interpolated avatar position.
- Transient WebSocket connection state.

Live avatar position should remain server-authoritative in memory for now.

## Economy Tables

### `users.dollars`

- Type: `integer`.
- Default: `500`.
- Not nullable.
- Represents the account's cash balance in whole dollars.
- Updated atomically by the economy store with row-level locking (`for("update")`).

### `user_inventory`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | FK to `users.id`, `onDelete: cascade`. Part of the composite primary key. |
| `item_type` | `text` | References a furniture definition key. Part of the composite primary key. |
| `quantity` | `integer` | Number of this item owned. Updated by UPSERT/atomic decrement/increment. |

- Primary key: `(user_id, item_type)`.
- Foreign key: `user_id` → `users.id` with cascade delete.
- Used for the catalogue/Inventory-first model: buying a furniture item increments quantity; placing an item decrements it; picking an item up refunds it.

## Scripts

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

When using Docker Compose, the `migrate` service runs migrations before the server starts so Drizzle uses the Compose network database URL.

## Runtime Behavior

1. Connect to Postgres through Drizzle when `DATABASE_URL` is present.
2. Load or seed the bundled public room layouts.
3. Load persisted `room_items` for known public and private rooms.
4. Create or refresh a private room for each successfully authenticated user.
5. Persist owner-approved furniture placement, movement, rotation, pickup, and item state changes.
6. Keep realtime room membership, movement, and chat in memory.

## Constraints

- Database failure should not crash the realtime prototype during local development unless persistence is explicitly required.
- Do not introduce authentication as part of the first persistence pass.
- Do not store movement spam in Postgres.
- Keep Docker Compose database credentials development-only; production should inject `DATABASE_URL` through the deployment platform.
