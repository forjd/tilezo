# Project Overview

This repository contains a browser-first multiplayer prototype for an isometric social room game.

The current product loop is:

1. Start the Bun server and Bun-served client.
2. Open the client in two or more browser tabs.
3. Create accounts or log in.
4. Join the same room.
5. See connected users as avatars.
6. Click tiles to request server-authoritative movement.
7. Send and receive room chat messages.
8. See users leave the room when they disconnect.

The project is inspired by the social-room interaction pattern of classic browser hotels, but it is not a clone. The goal is to establish reusable foundations for a custom social room game.

## Current Status

Implemented:

- Bun workspace monorepo.
- TypeScript across client, server, and shared packages.
- PixiJS isometric room renderer.
- Shared isometric projection, grid, and pathfinding logic.
- Shared JSON WebSocket protocol types and validation.
- Bun WebSocket server with in-memory authoritative room state.
- Account creation and login with case-insensitive usernames and hashed passwords.
- Multi-user presence.
- Server-authoritative tile movement.
- Basic realtime chat.
- PostgreSQL schema, migrations, and account persistence.
- Bun tests for shared deterministic logic and room state.

Not implemented yet:

- Durable room customization persistence.
- Room editor UI.
- Inventory, catalogue, economy, moderation dashboard, trading, pets, bots, or quests.

## Scope Discipline

The near-term product should stay focused on the browser multiplayer room loop. Add durable storage and operational foundations before expanding gameplay systems.

Do not add non-core social-game systems until the room, presence, movement, chat, and persistence foundations are stable.
