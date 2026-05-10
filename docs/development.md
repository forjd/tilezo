# Development

## Install

```sh
bun install
```

## Run

Start the server and client together:

```sh
bun run dev
```

Run them separately:

```sh
bun run dev:server
bun run dev:client
```

Default local URLs:

- Client: `http://localhost:3001`
- Server: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

## Checks

```sh
bun run typecheck
bun run lint
bun test
```

Use repository scripts for formatting and linting so Biome configuration stays consistent:

```sh
bun run format
bun run lint
```

## Database

The server uses Drizzle for Postgres schema and migrations. `DATABASE_URL` is optional for local realtime development; when it is present, the server loads or seeds the default room and upserts joined users.

```sh
bun run --cwd apps/server db:generate
bun run --cwd apps/server db:migrate
```

## Environment

Server:

```txt
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tilezo
NODE_ENV=development
```

Client:

```txt
PUBLIC_WS_URL=ws://localhost:3000/ws
```

If `PUBLIC_WS_URL` is omitted, the client uses `ws://localhost:3000/ws`.

## Testing Notes

Use Bun's test runner for deterministic logic and server room behavior.

Current test coverage includes:

- Isometric projection.
- Screen-to-tile conversion.
- Grid walkability.
- Pathfinding.
- Protocol parsing.
- Room join, leave, and authoritative movement.

Rendering tests should stay light until the client UI becomes more complex.
