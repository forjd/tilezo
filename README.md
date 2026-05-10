# Tilezo Multiplayer Room

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
- Docker and Docker Compose, for containerized development
- PostgreSQL is optional for local realtime development. Drizzle schema and migrations live under `apps/server/src/db`.

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

## Run With Docker

Start the client, server, and Postgres together:

```sh
docker compose up --build
```

Docker defaults:

- Client: `http://localhost:3001`
- Server: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`
- Postgres: `postgres://postgres:postgres@localhost:5432/tilezo` from the host, and `postgres://postgres:postgres@db:5432/tilezo` from Compose services

Compose runs database migrations before starting the server.

Run checks inside the container when you want parity with the Docker environment:

```sh
docker compose exec server bun run typecheck
docker compose exec server bun run lint
docker compose exec server bun test
```

The Docker setup uses one shared Bun image for development and separate Dockerfile targets for later deployment:

```sh
docker build --target server -t tilezo-server .
docker build --target client -t tilezo-client .
```

Compose runs a one-shot `deps` service before the app services so the container-owned Bun dependency volume stays in sync with `bun.lock`.

## Checks

```sh
bun run typecheck
bun run lint
bun test
```

## Environment

Server:

```txt
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tilezo
NODE_ENV=development
```

Client:

```txt
PUBLIC_WS_URL=ws://localhost:3000/ws
```

If `PUBLIC_WS_URL` is omitted, the client uses `ws://localhost:3000/ws`.
