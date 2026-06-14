# Economy System Implementation Plan

## Goal
Add a server-authoritative economy system to Tilezo:
- Every new user starts with **$500**.
- Creating a new room costs **$100** (flat fee).
- Furniture is bought from a catalogue into a persistent inventory.
- Inventory items can be placed, moved, and picked up freely; pickup returns the item to inventory (no cash refund).
- The user's personal/home room remains free.
- The client displays a live balance and inventory-aware furniture panel.

## Constraints & Decisions
- **Inventory-first model**: buy once, place/pickup/move for free. The server deducts one item from inventory when placing and refunds it when picking up.
- **No refunds on pickup**: cash is not returned; only the item goes back to inventory.
- **Flat room creation cost**: `$100` per room, charged via the HTTP `POST /rooms` path. Personal rooms provisioned by `ensurePersonalRoom` are not charged.
- **Starting balance**: `$500` (constant `DEFAULT_STARTING_DOLLARS` in `apps/server/src/auth/auth.ts`).
- **Default furniture prices** (set in `packages/protocol/src/furniture.ts`):
  - `woven_rug`: $25
  - `crate_table`: $50
  - `low_stool`: $35
  - `reed_divider`: $45
  - `glass_lamp`: $60
- Real-time updates are delivered via per-user WebSocket messages:
  - `balance.updated` `{ dollars: number }`
  - `inventory.updated` `{ items: InventoryItem[] }`

## Architecture

### Protocol / Shared Types
- `packages/protocol/src/user.ts` — `AuthUser` now includes `dollars: number`.
- `packages/protocol/src/economy.ts` — `ROOM_CREATION_COST` constant.
- `packages/protocol/src/furniture.ts` — `FurnitureDefinition` includes `price`.
- `packages/protocol/src/messages.ts` and `src/schemas.ts` — added `BalanceUpdatedMessage`, `InventoryUpdatedMessage`, and `connected` now includes `dollars`.

### Server
- `apps/server/src/economy/economy.ts` — `DrizzleEconomyStore` and `EconomyError`.
  - Methods: `getBalance`, `getInventory`, `purchase`, `spend`, `reserveItem`, `refundItem`.
  - Uses conditional atomic updates on `users` / `user_inventory` and UPSERTs on `user_inventory`.
- `apps/server/src/db/schema.ts` — `users.dollars` column and `user_inventory` table (`user_id`, `item_type`, `quantity`, PK on `(user_id, item_type)`).
- `apps/server/src/db/migrations/0014_medical_supreme_intelligence.sql` — generated migration.
- `apps/server/src/auth/auth.ts` — seeds `dollars` on user creation; `AuthUser` exposes it.
- `apps/server/src/http/router.ts` — added:
  - `POST /rooms` charges `ROOM_CREATION_COST` via `economy.spend` and returns `{ room, balance }`.
  - `GET /inventory` returns `{ items }`.
  - `POST /inventory/purchase` returns `{ balance, items }` and broadcasts `balance.updated` / `inventory.updated` to all sockets for the user.
- `apps/server/src/net/handleMessage.ts` — `placeRoomItem` reserves inventory; `pickupRoomItem` refunds inventory; `connected` sends `dollars`.
- `apps/server/src/net/socketTypes.ts` — `SocketData` includes `dollars`.
- `apps/server/src/serverRuntime.ts` — instantiates `DrizzleEconomyStore`, exposes `publishUserMessage` helper for per-user broadcasts, and passes `economy` into the WebSocket context.

### Client
- `apps/client/src/auth/AuthClient.ts` — `AuthUser` now includes `dollars`.
- `apps/client/src/inventory/InventoryClient.ts` — new `getInventory` / `purchaseItem` helpers.
- `apps/client/src/inventory/InventoryClient.test.ts` — tests for the helpers.
- `apps/client/src/game/Game.ts` — listens for `balance.updated` and `inventory.updated`; exposes callbacks `onBalanceChange` and `onInventoryChange`.
- `apps/client/src/app/createApp.ts` — displays balance in the top bar, wires `Game` callbacks to the `FurniturePanel`, and passes balance to `CreateRoomDialog.show`.
- `apps/client/src/ui/FurniturePanel.ts` — shows a catalogue dropdown with price/owned count, buy button, place button, and placed item list. Requires `onBuy` and `inventory` in its constructor.
- `apps/client/src/ui/CreateRoomDialog.ts` — shows creation cost and current balance.

## Current Progress
- [x] Protocol types and schemas updated.
- [x] Database schema + migration generated and applied.
- [x] Server auth seeds and exposes `dollars`.
- [x] `DrizzleEconomyStore` implemented.
- [x] Server runtime wired for economy and per-user broadcasts.
- [x] HTTP endpoints for room creation cost, inventory list, and purchase.
- [x] WebSocket handlers consume/refund inventory and broadcast updates.
- [x] Client `AuthUser`, `InventoryClient`, `Game`, `createApp`, `FurniturePanel`, and `CreateRoomDialog` updated.
- [x] All existing tests updated for `dollars`, `connected`, and new constructor signatures.
- [x] New `InventoryClient.test.ts` added.
- [x] `db/integration.test.ts` updated to cover `DrizzleEconomyStore` and truncate `user_inventory`.
- [x] Local Postgres container started, migrations applied, integration tests pass.
- [x] `typecheck`, `lint`, `bun test`, `test:coverage`, and `coverage:check` all pass.

## Remaining Work
- [x] **Update `docs/overview.md`** — added economy steps to the product loop and moved economy out of the "not implemented" list.
- [x] **Update `docs/persistence.md`** — documented `users.dollars` and the `user_inventory` table with columns, keys, and behavior.
- [x] **UI polish**:
  - [x] Disable the top-bar "Create room" button when balance is below `$100` (with a tooltip).
  - [x] Disable the `CreateRoomDialog` submit button when balance is below `$100`.
  - [x] Show an inline error in `FurniturePanel` when a purchase fails.
  - [x] Show a visible balance change color cue.
- [x] **Extra tests**:
  - [x] `FurniturePanel` tests for buy button, inventory display, owned counts, place disabled when empty, and purchase error.
  - [x] `CreateRoomDialog` tests for cost/balance display and insufficient-funds disabled submit.
  - [x] `createApp` test verifying the top-bar create-room button disables on low balance.
  - [x] `handleMessage` tests for `INSUFFICIENT_INVENTORY` and inventory refund on pickup.
  - [x] HTTP-level tests for `/inventory` and `/inventory/purchase`.

## Known Gotchas
- The `connected` server message now requires `dollars`; any new client/server test must include it.
- `handleMessage` expects `context.economy` for `placeRoomItem`; tests that exercise placement must provide an `EconomyStore` stub.
- `FurniturePanel` now requires `onBuy` and `inventory` in its constructor options.
- `CreateRoomDialog.show` now takes two arguments: `templates` and `balance`.
- The `db/integration.test.ts` truncate statement must include `user_inventory` so economy tests don't leak across cases.
- The `DrizzleEconomyStore` relies on Postgres-backed conditional updates and UPSERT behavior; it must be tested against Postgres (via `RUN_DB_TESTS=1`), not only in-memory doubles.
- `economy.ts` line coverage is still low in the unit test run because the real store is only exercised in the integration test. The adjusted coverage gate passes, but a future agent may want to add more coverage.

## Useful Commands
```bash
# Full local verification
bun run typecheck
bun run lint
bun test
bun run test:coverage
bun run coverage:check

# Database (when needed)
bun run db:up
bun run db:migrate
RUN_DB_TESTS=1 bun test apps/server/src/db/integration.test.ts
```

## Files Touched
- `packages/protocol/src/user.ts`
- `packages/protocol/src/economy.ts`
- `packages/protocol/src/furniture.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/schemas.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/0014_medical_supreme_intelligence.sql`
- `apps/server/src/db/migrations/meta/0014_snapshot.json`
- `apps/server/src/db/migrations/meta/_journal.json`
- `apps/server/src/db/integration.test.ts`
- `apps/server/src/auth/auth.ts`
- `apps/server/src/economy/economy.ts`
- `apps/server/src/http/router.ts`
- `apps/server/src/http/router.test.ts`
- `apps/server/src/net/handleMessage.ts`
- `apps/server/src/net/handleMessage.test.ts`
- `apps/server/src/net/socketTypes.ts`
- `apps/server/src/serverRuntime.ts`
- `apps/client/src/auth/AuthClient.ts`
- `apps/client/src/auth/AuthClient.test.ts`
- `apps/client/src/inventory/InventoryClient.ts`
- `apps/client/src/inventory/InventoryClient.test.ts`
- `apps/client/src/game/Game.ts`
- `apps/client/src/game/Game.test.ts`
- `apps/client/src/game/NetClient.test.ts`
- `apps/client/src/app/createApp.ts`
- `apps/client/src/app/createApp.test.ts`
- `apps/client/src/ui/CreateRoomDialog.ts`
- `apps/client/src/ui/CreateRoomDialog.test.ts`
- `apps/client/src/ui/FurniturePanel.ts`
- `apps/client/src/ui/FurniturePanel.test.ts`
- `packages/protocol/src/protocol.test.ts`
- `apps/server/src/auth/auth.test.ts`
- `apps/server/src/rooms/RoomClient.ts`
- `apps/server/src/rooms/RoomClient.test.ts`

## Local Services State
- The `tilezo-db-1` Postgres container is currently running (started via `bun run db:up`) and migrations are applied.
- A future agent can stop it with `bun run db:down` if desired.
