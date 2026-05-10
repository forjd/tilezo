# Habbo-Like Multiplayer Room

A Bun and TypeScript browser multiplayer prototype for an isometric social room loop.

## Documentation

- [Project overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [WebSocket protocol](docs/protocol.md)
- [Realtime room loop](docs/realtime-room-loop.md)
- [Persistence plan](docs/persistence.md)
- [Development workflow](docs/development.md)

## Requirements

- Bun
- PostgreSQL is optional until persistence is wired. The current SQL foundation is available at `apps/server/src/db/schema.sql`.

## Install

```sh
bun install
```

## Run Locally

Start the WebSocket server and client dev server:

```sh
bun run dev
```

Or run them separately:

```sh
bun run dev:server
bun run dev:client
```

Defaults:

- Server: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`
- Client: `http://localhost:3001`

Open the client in two browser tabs, enter different temporary usernames, and join room `lobby`.

## Checks

```sh
bun run typecheck
bun run lint
bun test
```

## Environment

Server:

```txt
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/habbo_mvp
NODE_ENV=development
```

Client:

```txt
PUBLIC_WS_URL=ws://localhost:3000/ws
```

If `PUBLIC_WS_URL` is omitted, the client uses `ws://localhost:3000/ws`.
