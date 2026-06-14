# Project Overview

This repository contains a browser-first multiplayer prototype for an isometric social room game.

The current product loop is:

1. Start the Bun server and Bun-served client.
2. Open the client in two or more browser tabs.
3. Create accounts or log in.
4. Join the same room.
5. Browse public rooms and hop between them.
6. See connected users as avatars.
7. Click tiles to request server-authoritative movement.
8. Send and receive room chat messages.
9. If you own the room, place, move, rotate, and pick up room furniture bought from the catalogue.
10. Earn a starting balance of $500 and spend it on room creation and furniture.
11. Buy furniture once, keep it in a persistent inventory, and place or pick it up freely in owned rooms.
12. See live balance and inventory updates across sessions.
13. See users leave the room when they disconnect or switch rooms.

The project is inspired by the social-room interaction pattern of classic browser hotels, but it is not a clone. The goal is to establish reusable foundations for a custom social room game.

## Current Status

Implemented:

- Bun workspace monorepo.
- TypeScript across client, server, and shared packages.
- PixiJS isometric room renderer.
- Shared isometric projection, grid, and pathfinding logic.
- Shared JSON WebSocket protocol types and validation (client and server message schemas).
- Bun WebSocket server with in-memory authoritative room state.
- Account creation and login with case-insensitive usernames, argon2id password hashing,
  token revocation, and rate limiting.
- Avatar appearance customization persisted per account.
- Multi-user presence and friends (add/remove, online status, join a friend's room).
- Friend-gated direct messages: realtime delivery, persistence, and history.
- Public room browser with live room population counts, plus per-user private rooms and
  player-created rooms persisted to PostgreSQL.
- Server-authoritative economy: starting balance, room creation fees, furniture catalogue,
  persistent inventory, and live balance/inventory updates.
- Owner-only room furniture placement, movement, rotation, pickup, persistence, and
  snapshot delivery.
- Scripted, server-authoritative room bots (movement and chat).
- Server-authoritative tile movement, including blocking from placed furniture.
- Realtime chat with typing indicators.
- Reconnect/resume of the last joined room.
- PostgreSQL schema, migrations, and persistence (accounts, rooms, sessions, friendships).
- Bun tests for shared deterministic logic, room state, auth, and HTTP routing.

Not implemented yet:

- Room editor UI.
- Provider-backed (AI) bot conversations (see [FOLLOW_UPS.md](../FOLLOW_UPS.md)).
- Moderation dashboard, trading, pets, or quests.

## Scope Discipline

The near-term product should stay focused on the browser multiplayer room loop and its
supporting room, presence, movement, chat, friends, bot, and persistence foundations. Add
durable storage and operational hardening before expanding into new gameplay systems
(inventory, catalogue, economy, trading, pets, quests, moderation dashboards).
