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
- Private room ownership.

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

When using Docker Compose, the `migrate` service runs migrations before the server starts so Drizzle uses the Compose network database URL.

## Runtime Behavior

1. Connect to Postgres through Drizzle when `DATABASE_URL` is present.
2. Load or seed the bundled public room layouts.
3. Create or refresh a private room for each successfully authenticated user.
4. Keep realtime room membership, movement, and chat in memory.

## Constraints

- Database failure should not crash the realtime prototype during local development unless persistence is explicitly required.
- Do not introduce authentication as part of the first persistence pass.
- Do not store movement spam in Postgres.
- Keep Docker Compose database credentials development-only; production should inject `DATABASE_URL` through the deployment platform.
