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

## Runtime and Dependencies

- Use Bun-native APIs where possible.
- Prefer `Bun.serve`, Bun WebSocket support, Bun workspace/package management, and Bun test tooling before adding Node-specific alternatives.
- Add dependencies only when they solve a real product requirement and fit the existing TypeScript/Bun stack.
- Keep Docker development aligned with the Bun workspace. Use the shared `Dockerfile` and `compose.yml` rather than adding per-app container definitions unless deployment requirements force a split.
- When changing server networking, preserve Docker-compatible binding through `HOST=0.0.0.0`; browser-facing defaults should continue to work at `localhost` from the host.

## Docker Workflow

- Before running Docker or other project services, check whether the required service is already available. For Docker commands, verify the Docker daemon is running first, then start or ask the user to start it only if needed.
- Use `docker compose up --build` for the full local stack with client, server, and Postgres.
- Keep the Compose `deps` service in place when changing container volumes; it prevents stale container dependencies after `bun.lock` changes.
- Run Drizzle migrations in Docker with `docker compose exec server bun run --cwd apps/server db:migrate`.
- Prefer repository scripts inside the running `server` container for Docker parity checks: `bun run typecheck`, `bun run lint`, and `bun test`.
- Keep Compose database credentials development-only. Production deployments should provide `DATABASE_URL` through the target platform secret/config mechanism.

## Product Scope

- Keep implementation focused on the browser multiplayer room loop described in [docs/overview.md](docs/overview.md) and [docs/realtime-room-loop.md](docs/realtime-room-loop.md).
- Use [docs/persistence.md](docs/persistence.md) as the source of truth for the next database and migration pass.
- If a feature is outside the current room, presence, movement, chat, or persistence foundations, add a TODO instead of implementing it.
