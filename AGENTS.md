# Repository Ground Rules

## Commit Messages

- Use Conventional Commits for every commit message.
- Format: `<type>(optional-scope): <description>`.
- Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Keep the subject line imperative, lowercase after the type, and concise.

Examples:

```txt
feat(client): add isometric tile renderer
fix(server): reject movement outside room bounds
chore: configure biome
```

## Formatting and Linting

- Use Biome for formatting and linting.
- Prefer repository scripts that call `biome` instead of one-off formatter commands.
- Keep formatting-only changes separate from behavior changes when practical.

## Testing and Coverage

- Use Bun test tooling and repository scripts for verification.
- Run `bun run test:coverage` before `bun run coverage:check` when validating coverage locally, because the coverage check reads `coverage/lcov.info`.
- Preserve the adjusted coverage gate in `scripts/check-coverage.ts`: CI requires adjusted line coverage to stay at or above `COVERAGE_THRESHOLD` and treats executable source files missing from LCOV as uncovered.
- Do not lower the coverage threshold or exclude executable product code from coverage accounting to make CI pass. Add focused tests for real behavior instead; only exclude entrypoints, config, type-only modules, or re-export shims when they do not contain meaningful executable logic.

## Browser Testing

- Do not run automated browser testing without asking the user first, including Playwright runs, browser automation, scripted UI flows, screenshots, or in-app browser interactions.

## Runtime and Dependencies

- Use Bun-native APIs where possible.
- Prefer `Bun.serve`, Bun WebSocket support, Bun workspace/package management, and Bun test tooling before adding Node-specific alternatives.
- Add dependencies only when they solve a real product requirement and fit the existing TypeScript/Bun stack.
- Keep Docker development aligned with the Bun workspace. Use the shared `Dockerfile` and `compose.yml` rather than adding per-app container definitions unless deployment requirements force a split.
- When changing server networking, preserve Docker-compatible binding through `HOST=0.0.0.0`; browser-facing defaults should continue to work at `localhost` from the host.

## Docker Workflow

- Before running Docker or other project services, check whether the required service is already available. For Docker commands, verify the Docker daemon is running first, then start or ask the user to start it only if needed.
- For normal git worktree development, prefer native Bun for client/server and Docker only for Postgres: run `bun install`, `bun run worktree:setup`, `bun run db:up`, and `bun run db:migrate` after creating the worktree.
- Do not run `bun run dev` as part of automated worktree setup unless the user explicitly asks to start the app; it is a long-running dev server command.
- Before running `bun run build` or similar build/service commands, check whether `bun run dev` is already running. If it is, do not run the build command unless the user explicitly asks for it, because the user may be running the dev server in another terminal or process.
- Keep each active worktree isolated with its generated `.env`, `COMPOSE_PROJECT_NAME`, app ports, database port, and Postgres volume. Use `bun run db:reset` only when intentionally deleting that worktree's database data.
- Use `docker compose up --build` for the full local stack with client, server, and Postgres.
- Keep the Compose `deps` service in place when changing container volumes; it prevents stale container dependencies after `bun.lock` changes.
- Run Drizzle migrations in Docker with `docker compose exec server bun run --cwd apps/server db:migrate`.
- Prefer repository scripts inside the running `server` container for Docker parity checks: `bun run typecheck`, `bun run lint`, and `bun test`.
- Keep Compose database credentials development-only. Production deployments should provide `DATABASE_URL` through the target platform secret/config mechanism.

## Product Scope

- Keep implementation focused on the browser multiplayer room loop described in [docs/overview.md](docs/overview.md) and [docs/realtime-room-loop.md](docs/realtime-room-loop.md).
- Use [docs/persistence.md](docs/persistence.md) as the source of truth for the next database and migration pass.
- Use [docs/art-design-principles.md](docs/art-design-principles.md) as the source of truth for Tilezo's pixel-art direction, asset review, and Habbo-inspired-but-original visual constraints.
- If a feature is outside the current room, presence, movement, chat, or persistence foundations, add a TODO instead of implementing it.

## Reference Projects

- Local references are available at `../bobba_server`, `../bobba_client`, and `../Kepler`. Use them to understand emulator architecture, room-loop behavior, protocol shape, isometric rendering, and persistence boundaries.
- Treat these projects as behavioral references, not source templates. `bobba_server` and `bobba_client` are GPL-licensed, and `Kepler` is AGPL-licensed; do not copy, port, or lightly rewrite their code, assets, SQL dumps, packet constants, text strings, or proprietary Habbo-era content into Tilezo.
- When consulting the references, extract product and architecture lessons: server-authoritative rooms, explicit incoming/outgoing message handlers, room-scoped broadcast helpers, deterministic room ticks, tile occupancy maps, height-aware movement, avatar status updates, room model parsing, item definitions, inventories, catalogues, and room rights.
- Prefer Tilezo-native names, schemas, messages, and assets. Keep our WebSocket protocol JSON-oriented and TypeScript/Bun-first unless a documented Tilezo design says otherwise.
- For movement and collision work, compare Bobba's compact `Room`/`RoomUserManager`/`GameMap` flow with Kepler's fuller `RoomEntity`/`RoomMapping`/`RoomTile`/`Pathfinder` model, then implement the smallest Tilezo-specific version that preserves authoritative validation, diagonal movement rules, occupied-tile handling, stack/height checks, and status broadcast semantics.
- For persistence work, use the references only to identify domain concepts and relationships such as users, rooms, room models, room rights, items, item definitions, inventories, catalogue pages/items, chat logs, and favourites. Design Drizzle schemas from [docs/persistence.md](docs/persistence.md) and current Tilezo requirements rather than mirroring legacy MySQL tables.
- For rendering and UI work, use `../bobba_client` to study high-level client responsibilities such as asset managers, room imagers, avatar containers, hit testing, and incoming event routing. Keep Tilezo's visual direction original and aligned with [docs/art-design-principles.md](docs/art-design-principles.md).
- When a reference influences an implementation decision, mention the reference concept in the PR or commit notes without claiming compatibility with Habbo, Bobba, or Kepler unless that compatibility is explicitly implemented and tested.
