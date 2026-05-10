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

## Docker Development

Use Docker Compose when you want the full local stack, including Postgres:

```sh
docker compose up --build
```

Compose starts:

- `deps`: a one-shot Bun install that keeps the container-owned dependency volume in sync with `bun.lock`.
- `client`: Bun's browser dev server on `http://localhost:3001`.
- `server`: Bun's WebSocket/API server on `http://localhost:3000`.
- `db`: Postgres 17 with data stored in the `postgres_data` Docker volume.

The server uses `DATABASE_URL=postgres://postgres:postgres@db:5432/tilezo` inside Compose. From the host, the same database is available at `postgres://postgres:postgres@localhost:5432/tilezo`.

Run migrations after the database is healthy:

```sh
docker compose exec server bun run --cwd apps/server db:migrate
```

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

The server uses Drizzle for Postgres schema and migrations. `DATABASE_URL` is optional for local realtime development; when it is present, the server loads or seeds the default room and upserts joined users.

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
NODE_ENV=development
```

Client:

```txt
PUBLIC_WS_URL=ws://localhost:3000/ws
```

If `PUBLIC_WS_URL` is omitted, the client uses `ws://localhost:3000/ws`.

## Deployment Notes

The Dockerfile includes separate targets for later deployment:

```sh
docker build --target server -t tilezo-server .
docker build --target client -t tilezo-client .
```

The `server` target runs the Bun WebSocket server on `PORT` with `HOST=0.0.0.0`. The `client` target builds static browser assets and serves them with Caddy.

For a production deployment, use a managed Postgres database when possible, set `DATABASE_URL` on the server service, and route `/ws` plus `/health` to the server. Route the browser app to the client service. Use `wss://.../ws` for `PUBLIC_WS_URL` when serving over HTTPS.

`PUBLIC_WS_URL` is baked into the static client build. If the same client image needs to move between environments, add a runtime client config file or config endpoint before promoting one image across staging and production.

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
