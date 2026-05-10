# Persistence Plan

Persistence is the next major area of work.

The current server has:

- `apps/server/src/db/schema.sql`
- `apps/server/src/db/db.ts`
- Optional `DATABASE_URL` configuration

It does not yet use the database for runtime behavior.

## Recommended Direction

Use Drizzle for typed schema and migrations.

Suggested dependencies:

- `drizzle-orm`
- `drizzle-kit`
- A Postgres driver compatible with the chosen Drizzle runtime path.

Prefer Bun-native APIs where they are mature enough. If Drizzle support is smoother with a small Postgres client dependency, use that dependency intentionally and keep the DB layer isolated.

## Durable Entities

Persist:

- Users.
- Rooms.
- Room layouts.
- Room items.
- Chat messages, if chat history becomes part of the product.

Do not persist:

- High-frequency movement updates.
- Every interpolated avatar position.
- Transient WebSocket connection state.

Live avatar position should remain server-authoritative in memory for now.

## Proposed Structure

```txt
apps/server/
  drizzle.config.ts
  src/
    db/
      db.ts
      schema.ts
      migrations/
```

Proposed scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

## Migration Targets

Initial Drizzle schema should cover the existing SQL foundation:

- `users`
- `rooms`
- `room_items`
- `chat_messages`

After migrations exist, update the server to:

1. Connect to Postgres when `DATABASE_URL` is present.
2. Load or seed the default room layout.
3. Optionally persist accepted chat messages.
4. Keep realtime room membership and movement in memory.

## Constraints

- Database failure should not crash the realtime prototype during local development unless persistence is explicitly required.
- Do not introduce authentication as part of the first persistence pass.
- Do not store movement spam in Postgres.
