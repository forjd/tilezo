# Persistence

The server uses Drizzle for typed Postgres schema and migrations.

The current server has:

- `apps/server/drizzle.config.ts`
- `apps/server/src/db/db.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/`

## Durable Entities

Persist:

- Users.
- Rooms.
- Room layouts.
- Room items.

Do not persist:

- Chat messages, until chat history becomes part of the product.
- High-frequency movement updates.
- Every interpolated avatar position.
- Transient WebSocket connection state.

Live avatar position should remain server-authoritative in memory for now.

## Scripts

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

## Runtime Behavior

1. Connect to Postgres through Drizzle when `DATABASE_URL` is present.
2. Load or seed the default room layout.
3. Upsert joined users.
4. Keep realtime room membership, movement, and chat in memory.

## Constraints

- Database failure should not crash the realtime prototype during local development unless persistence is explicitly required.
- Do not introduce authentication as part of the first persistence pass.
- Do not store movement spam in Postgres.
