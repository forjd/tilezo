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

## Runtime and Dependencies

- Use Bun-native APIs where possible.
- Prefer `Bun.serve`, Bun WebSocket support, Bun workspace/package management, and Bun test tooling before adding Node-specific alternatives.
- Add dependencies only when they solve a real product requirement and fit the existing TypeScript/Bun stack.
- Keep Docker development aligned with the Bun workspace. Use the shared `Dockerfile` and `compose.yml` rather than adding per-app container definitions unless deployment requirements force a split.
- When changing server networking, preserve Docker-compatible binding through `HOST=0.0.0.0`; browser-facing defaults should continue to work at `localhost` from the host.

## Docker Workflow

- Use `docker compose up --build` for the full local stack with client, server, and Postgres.
- Keep the Compose `deps` service in place when changing container volumes; it prevents stale container dependencies after `bun.lock` changes.
- Run Drizzle migrations in Docker with `docker compose exec server bun run --cwd apps/server db:migrate`.
- Prefer repository scripts inside the running `server` container for Docker parity checks: `bun run typecheck`, `bun run lint`, and `bun test`.
- Keep Compose database credentials development-only. Production deployments should provide `DATABASE_URL` through the target platform secret/config mechanism.

## Product Scope

- Keep implementation focused on the browser multiplayer room loop described in [docs/overview.md](docs/overview.md) and [docs/realtime-room-loop.md](docs/realtime-room-loop.md).
- Use [docs/persistence.md](docs/persistence.md) as the source of truth for the next database and migration pass.
- If a feature is outside the current room, presence, movement, chat, or persistence foundations, add a TODO instead of implementing it.
