# Development

## Install

```sh
bun install
```

Copy `.env.example` if you want a local reference for the standard environment variables:

```sh
cp .env.example .env
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

## Worktree Development

Use native Bun for the client and server, with Docker only for Postgres. Each worktree should have
its own `.env`, Compose project name, ports, containers, and database volume.

Create a worktree:

```sh
git worktree add ../tilezo-wt/room-state -b feat/room-state main
cd ../tilezo-wt/room-state
bun install
```

Generate a worktree-local `.env`:

```sh
bun run worktree:setup
```

The generated `.env` is ignored by Git, read automatically by Bun and Docker Compose, and includes:

- `COMPOSE_PROJECT_NAME` for Docker Compose isolation.
- `SERVER_PORT` and `CLIENT_PORT` for browser-facing ports.
- `DB_PORT` for the host Postgres port.
- `PORT`, `DATABASE_URL`, `PUBLIC_API_URL`, and `PUBLIC_WS_URL` for native Bun development.

Start only Postgres:

```sh
bun run db:up
```

Run migrations against that worktree database:

```sh
bun run db:migrate
```

Start the native app:

```sh
bun run dev
```

The setup command prints the exact client, server, and database ports for the worktree. If you
already copied `.env.example`, or you need to regenerate the worktree values, run:

```sh
bun run worktree:setup -- --force
```

Stop the worktree database without deleting data:

```sh
bun run db:down
```

Delete that worktree database volume when you need a clean database:

```sh
bun run db:reset
```

## Docker Development

Use the full Docker Compose stack when you want container parity for the client, server, and
Postgres:

```sh
docker compose up --build
```

Compose starts:

- `deps`: a one-shot Bun install that keeps the container-owned dependency volume in sync with `bun.lock`.
- `migrate`: a one-shot Drizzle migration run after Postgres is healthy and before the server starts.
- `client`: Bun's browser dev server on `http://localhost:3001`.
- `server`: Bun's WebSocket/API server on `http://localhost:3000`.
- `db`: Postgres 17 with data stored in the `postgres_data` Docker volume.

The server uses `DATABASE_URL=postgres://postgres:postgres@db:5432/tilezo` inside Compose. From the host, the same database is available at `postgres://postgres:postgres@localhost:5432/tilezo`.

Compose runs migrations automatically before starting the server.

For concurrent worktrees, set or generate unique values for `COMPOSE_PROJECT_NAME`, `SERVER_PORT`,
`CLIENT_PORT`, and `DB_PORT` before running Compose. The `bun run worktree:setup` command writes
those values to `.env`, which Docker Compose reads automatically.

Run project checks inside the container:

```sh
docker compose exec server bun run typecheck
docker compose exec server bun run lint
docker compose exec server bun test
```

Stop the stack without deleting database data:

```sh
docker compose down
```

Delete the local Docker database volume when you need a clean database:

```sh
docker compose down -v
```

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

The server uses Drizzle for Postgres schema and migrations. `DATABASE_URL` is required for account creation and login; when it is present, the server also loads or seeds the default room.

```sh
bun run --cwd apps/server db:generate
bun run --cwd apps/server db:migrate
```

## Environment

Server:

```txt
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tilezo
AUTH_SECRET=change-me-in-production
NODE_ENV=development
```

Client:

```txt
PUBLIC_API_URL=http://localhost:3000
PUBLIC_WS_URL=ws://localhost:3000/ws
```

If `PUBLIC_API_URL` or `PUBLIC_WS_URL` is omitted, the client uses the local server defaults. The
client uses Bun's static env inlining for literal `process.env.PUBLIC_*` references.

## Deployment Notes

The Dockerfile includes separate targets for later deployment:

```sh
docker build --target server -t tilezo-server .
docker build --target client -t tilezo-client .
```

The `server` target runs the Bun WebSocket server on `PORT` with `HOST=0.0.0.0`. The `client` target builds static browser assets and serves them with Caddy.

For a production deployment, use a managed Postgres database when possible, set `DATABASE_URL` and `AUTH_SECRET` on the server service, and route `/auth/*`, `/ws`, and `/health` to the server. Route the browser app to the client service. Use `https://...` for `PUBLIC_API_URL` and `wss://.../ws` for `PUBLIC_WS_URL` when serving over HTTPS.

`PUBLIC_API_URL` and `PUBLIC_WS_URL` are baked into the static client build. If the same client image
needs to move between environments, add a runtime client config file or config endpoint before
promoting one image across staging and production.

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
