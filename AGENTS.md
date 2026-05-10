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

## Product Scope

- Keep implementation focused on the browser multiplayer room loop described in [docs/overview.md](docs/overview.md) and [docs/realtime-room-loop.md](docs/realtime-room-loop.md).
- Use [docs/persistence.md](docs/persistence.md) as the source of truth for the next database and migration pass.
- If a feature is outside the current room, presence, movement, chat, or persistence foundations, add a TODO instead of implementing it.
