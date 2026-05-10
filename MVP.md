# Habbo-Like Browser Game MVP

## 1. Objective

Build a browser-first multiplayer prototype inspired by the social-room interaction style of Habbo Hotel.

The goal is not to clone Habbo mechanically, visually, commercially, or legally. The goal is to prove the core technical loop:

> Multiple browser clients can join the same isometric room, see each other, move around using server-authoritative movement, and chat in real time.

This MVP should establish the foundation for a future custom social room game with rooms, avatars, furniture, inventory, moderation, and economy systems.

## 2. Technical Stack

### Runtime and language

- TypeScript across client, server, and shared packages.
- Bun as the server runtime and workspace/package manager.
- Bun's native frontend bundler/dev server for the browser client.

### Client

- TypeScript.
- Bun HTML imports and bundling.
- PixiJS for 2D rendering.
- Custom game-layer code for:
  - isometric coordinate conversion;
  - tile grid rendering;
  - avatar rendering;
  - movement interpolation;
  - WebSocket messaging;
  - room scene state.

### Server

- Bun.
- `Bun.serve()` with native WebSocket support.
- Authoritative in-memory room state for the MVP.
- Shared TypeScript protocol package for client/server message types.
- Runtime validation for inbound client messages using Zod or Valibot.

### Database

- PostgreSQL.
- Bun SQL or Drizzle.
- Keep the first version simple.
- Do not store high-frequency movement updates in the database.
- Store durable entities only:
  - users;
  - rooms;
  - room items;
  - chat messages, if enabled for MVP persistence.

### Not required for MVP

- Redis.
- Kubernetes.
- Microservices.
- Binary protocol.
- Custom WebGL renderer.
- User-generated asset pipeline.
- Full authentication system.
- Payments.
- Marketplace.
- Moderation dashboard.
- Room editor UI.

## 3. Core MVP Requirements

The MVP is complete when the following can be demonstrated locally:

1. Start the Bun server.
2. Open the Bun-served client.
3. Open two or more browser tabs.
4. Enter a temporary username in each tab.
5. Join the same room.
6. See all connected users represented as avatars.
7. Click a tile to request movement.
8. Server validates the requested destination.
9. Server broadcasts an approved movement path.
10. All connected clients animate the avatar moving along the path.
11. Users can send and receive basic chat messages in the room.
12. Users disappear from the room when they disconnect.

## 4. Non-Goals

Do not implement these in the MVP:

- real account registration;
- password login;
- OAuth;
- inventory;
- catalogue/shop;
- currency;
- avatar clothing/customisation;
- private messages;
- friends list;
- public room directory;
- room creation UI;
- furniture placement UI;
- wall/floor editing;
- staff/mod tools;
- trade system;
- pets;
- bots;
- quests;
- pathfinding around complex stacked furniture;
- mobile support;
- production deployment;
- anti-cheat beyond server-authoritative movement validation.

If tempted to add any of these, add a TODO and continue with the MVP.

## 5. Repository Structure

Use a Bun workspace monorepo.

```txt
habbo-like-mvp/
  apps/
    client/
      index.html
      package.json
      tsconfig.json
      src/
        main.ts
        app/
          createApp.ts
        game/
          Game.ts
          RoomScene.ts
          IsoMath.ts
          Avatar.ts
          TileMap.ts
          NetClient.ts
          types.ts
        ui/
          LoginForm.ts
          ChatPanel.ts
        assets.ts

    server/
      package.json
      tsconfig.json
      src/
        index.ts
        config.ts
        rooms/
          RoomManager.ts
          Room.ts
          pathfinding.ts
          types.ts
        net/
          handleMessage.ts
          socketTypes.ts
        db/
          db.ts
          schema.sql
          migrations/
        util/
          ids.ts
          safeJson.ts

  packages/
    protocol/
      package.json
      tsconfig.json
      src/
        messages.ts
        schemas.ts
        parse.ts
        index.ts

    engine/
      package.json
      tsconfig.json
      src/
        iso.ts
        grid.ts
        pathfinding.ts
        types.ts
        index.ts

  assets/
    rooms/
      default-room.json
    sprites/
      tiles/
        basic-floor.png
      avatars/
        placeholder-avatar.png

  package.json
  tsconfig.base.json
  bun.lock
  README.md
  MVP.md
```

## 6. Package Responsibilities

### `apps/client`

Owns browser rendering and local interaction.

Responsibilities:

- connect to WebSocket server;
- send client messages;
- receive server messages;
- maintain client-side room projection state;
- render room tiles;
- render avatars;
- animate movement along server-provided paths;
- show chat UI;
- collect username before joining.

The client must not be trusted for authoritative state.

### `apps/server`

Owns authoritative multiplayer state.

Responsibilities:

- accept WebSocket connections;
- attach socket metadata;
- validate inbound messages;
- create and manage room instances;
- handle join/leave;
- validate movement requests;
- calculate movement paths;
- broadcast room events;
- optionally persist chat messages;
- optionally load room layout from PostgreSQL or JSON file.

### `packages/protocol`

Owns network message types and schemas.

Responsibilities:

- define `ClientMessage`;
- define `ServerMessage`;
- define Zod/Valibot schemas;
- expose safe parse helpers;
- avoid importing client or server code.

### `packages/engine`

Owns shared deterministic room/game logic.

Responsibilities:

- isometric coordinate conversion;
- tile/grid types;
- walkability checks;
- simple pathfinding;
- shared constants.

This package should contain logic that can safely run on both client and server.

## 7. Protocol

Use JSON messages for the MVP.

### Client-to-server messages

```ts
export type ClientMessage =
  | RoomJoinMessage
  | AvatarMoveRequestMessage
  | ChatSayMessage
  | PingMessage;

export type RoomJoinMessage = {
  type: 'room.join';
  roomId: string;
  username: string;
};

export type AvatarMoveRequestMessage = {
  type: 'avatar.move.request';
  target: TilePosition;
};

export type ChatSayMessage = {
  type: 'chat.say';
  text: string;
};

export type PingMessage = {
  type: 'ping';
  sentAt: string;
};
```

### Server-to-client messages

```ts
export type ServerMessage =
  | ConnectedMessage
  | RoomSnapshotMessage
  | UserJoinedMessage
  | UserLeftMessage
  | AvatarMovedMessage
  | ChatMessage
  | PongMessage
  | ErrorMessage;

export type ConnectedMessage = {
  type: 'connected';
  userId: string;
};

export type RoomSnapshotMessage = {
  type: 'room.snapshot';
  roomId: string;
  users: RoomUserSnapshot[];
  tiles: RoomTile[];
};

export type UserJoinedMessage = {
  type: 'user.joined';
  user: RoomUserSnapshot;
};

export type UserLeftMessage = {
  type: 'user.left';
  userId: string;
};

export type AvatarMovedMessage = {
  type: 'avatar.moved';
  userId: string;
  path: TilePosition[];
};

export type ChatMessage = {
  type: 'chat.message';
  userId: string;
  username: string;
  text: string;
  sentAt: string;
};

export type PongMessage = {
  type: 'pong';
  sentAt: string;
};

export type ErrorMessage = {
  type: 'error';
  code: string;
  message: string;
};
```

### Shared types

```ts
export type TilePosition = {
  x: number;
  y: number;
};

export type RoomTile = {
  x: number;
  y: number;
  z: number;
  walkable: boolean;
};

export type RoomUserSnapshot = {
  id: string;
  username: string;
  position: TilePosition;
};
```

## 8. Protocol Validation

All inbound client messages must be validated on the server before handling.

Use Zod or Valibot.

Example helper shape:

```ts
export function parseClientMessage(input: unknown):
  | { ok: true; value: ClientMessage }
  | { ok: false; error: string } {
  // Runtime validation goes here.
}
```

Validation requirements:

- `type` must be a known client message type.
- `username` must be trimmed and length-limited.
- `roomId` must be trimmed and length-limited.
- chat text must be trimmed and length-limited.
- tile coordinates must be integers.
- reject malformed JSON.
- reject messages over a sensible size limit.

Suggested limits:

```txt
username max length: 24 characters
roomId max length: 64 characters
chat max length: 240 characters
max raw WebSocket message size: 8 KB
```

## 9. Server Architecture

### WebSocket lifecycle

On connection:

1. Generate a temporary `userId`.
2. Store socket metadata:
   - `userId`;
   - `username`, initially unset or `Guest`;
   - `roomId`, initially unset.
3. Send `connected` message.

On `room.join`:

1. Validate username.
2. Create or retrieve room.
3. Add user to room at spawn position.
4. Subscribe socket to room topic.
5. Send `room.snapshot` to joining socket.
6. Broadcast `user.joined` to room.

On `avatar.move.request`:

1. Ensure socket has joined a room.
2. Find room.
3. Validate target tile.
4. Calculate path from current tile to target tile.
5. If invalid, send error.
6. If valid:
   - update authoritative user position;
   - broadcast `avatar.moved` with path.

On `chat.say`:

1. Ensure socket has joined a room.
2. Validate and trim text.
3. Broadcast `chat.message`.
4. Optionally persist message.

On disconnect:

1. Remove user from room.
2. Unsubscribe socket from room topic.
3. Broadcast `user.left`.
4. Delete empty room instance if appropriate.

### Room manager

```ts
export class RoomManager {
  get(roomId: string): Room | undefined;
  getOrCreate(roomId: string): Room;
  removeIfEmpty(roomId: string): void;
}
```

### Room

```ts
export class Room {
  readonly id: string;

  join(user: RoomUser): void;
  leave(userId: string): void;
  moveUser(userId: string, target: TilePosition): TilePosition[] | null;
  getSnapshot(): RoomSnapshot;
  getUsers(): RoomUserSnapshot[];
  isWalkable(position: TilePosition): boolean;
}
```

## 10. Movement Model

The client sends movement intent only.

Allowed client message:

```json
{
  "type": "avatar.move.request",
  "target": { "x": 5, "y": 3 }
}
```

Disallowed conceptual behaviour:

```txt
Client says: "I am now at x=5, y=3"
```

The server owns:

- current avatar position;
- target validation;
- path calculation;
- final accepted path.

The client owns:

- click detection;
- sending movement intent;
- visual interpolation along approved path.

## 11. Pathfinding

Use simple grid pathfinding.

For MVP, use one of:

- breadth-first search;
- A* with Manhattan distance.

Rules:

- movement is tile-based;
- only cardinal movement is required initially;
- diagonal movement is optional and should be avoided for first version;
- blocked tiles cannot be walked through;
- occupied-user blocking is optional for MVP;
- furniture blocking is optional for MVP unless static furniture is added.

Acceptance criteria:

- moving to a valid tile returns a path;
- moving outside the room returns `null`;
- moving to a blocked tile returns `null`;
- moving from a tile to itself returns an empty path or a single-position path consistently.

## 12. Isometric Projection

Use a simple 2:1 isometric projection.

Suggested tile dimensions:

```txt
tile width: 64px
tile height: 32px
```

Shared helper:

```ts
export function tileToScreen(
  tileX: number,
  tileY: number,
  tileWidth = 64,
  tileHeight = 32,
) {
  return {
    x: (tileX - tileY) * (tileWidth / 2),
    y: (tileX + tileY) * (tileHeight / 2),
  };
}

export function screenToTile(
  screenX: number,
  screenY: number,
  tileWidth = 64,
  tileHeight = 32,
) {
  return {
    x: Math.floor((screenY / (tileHeight / 2) + screenX / (tileWidth / 2)) / 2),
    y: Math.floor((screenY / (tileHeight / 2) - screenX / (tileWidth / 2)) / 2),
  };
}
```

The room scene should have a camera/world offset so the isometric grid is centred in the browser viewport.

## 13. Client Rendering

### Scene layers

Render in this order:

1. background;
2. floor tiles;
3. static furniture, if any;
4. avatars;
5. hover/highlight tile;
6. UI overlay/chat.

### Minimal classes

```ts
class Game {
  start(): Promise<void>;
  stop(): void;
}

class RoomScene {
  loadSnapshot(snapshot: RoomSnapshotMessage): void;
  handleServerMessage(message: ServerMessage): void;
  update(delta: number): void;
  render(): void;
}

class Avatar {
  userId: string;
  username: string;
  position: TilePosition;
  setPath(path: TilePosition[]): void;
  update(delta: number): void;
}

class NetClient {
  connect(username: string): Promise<void>;
  send(message: ClientMessage): void;
  onMessage(callback: (message: ServerMessage) => void): void;
  disconnect(): void;
}
```

### Avatar MVP rendering

Use a simple placeholder asset first:

- coloured circle;
- simple rectangle;
- or a temporary PNG sprite.

Do not implement avatar body-part composition in the MVP.

## 14. Chat UI

Chat can be plain HTML overlaying the PixiJS canvas.

Requirements:

- message list;
- text input;
- Enter sends message;
- empty messages are ignored;
- long messages are rejected or truncated server-side;
- messages display username and text.

No rich text.
No emoji picker.
No moderation tools.
No profanity filtering in MVP.

## 15. Room Data Format

Use a JSON file for the default room.

`assets/rooms/default-room.json`:

```json
{
  "id": "lobby",
  "name": "Lobby",
  "width": 10,
  "height": 10,
  "spawn": {
    "x": 2,
    "y": 2
  },
  "tiles": [
    { "x": 0, "y": 0, "z": 0, "walkable": true },
    { "x": 1, "y": 0, "z": 0, "walkable": true }
  ]
}
```

For convenience, the server may generate a rectangular walkable room at startup instead of manually listing every tile.

## 16. Database Schema

PostgreSQL is part of the intended architecture, but the first realtime loop can run without database persistence.

Implement schema early if practical, but do not block the multiplayer prototype on a polished persistence layer.

Suggested schema:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  layout JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_items (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL DEFAULT 0,
  rotation INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

For MVP, temporary users do not have to be persisted unless doing so is convenient.

## 17. Environment Variables

Server should support:

```txt
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/habbo_mvp
NODE_ENV=development
```

Client should support:

```txt
PUBLIC_WS_URL=ws://localhost:3000/ws
```

## 18. Local Development Commands

Root `package.json` should expose commands similar to:

```json
{
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:client": "bun --cwd apps/client run dev",
    "dev:server": "bun --cwd apps/server run dev",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "bun run --filter '*' lint",
    "test": "bun run --filter '*' test",
    "format": "bun run --filter '*' format"
  }
}
```

Use whatever Bun workspace command syntax is actually supported by the chosen setup. Keep commands documented in the README.

## 19. Testing Requirements

Do not over-test the rendering layer at MVP stage.

Do test shared deterministic logic.

Required tests:

- `tileToScreen` produces expected coordinates;
- `screenToTile` maps basic points back to expected tiles;
- grid walkability works;
- pathfinding returns a path for valid routes;
- pathfinding rejects blocked routes;
- protocol parser accepts valid messages;
- protocol parser rejects malformed messages;
- room join adds a user;
- room leave removes a user;
- room movement updates authoritative user position.

Use Bun’s test runner unless there is a strong reason not to.

## 20. Error Handling

The server should never crash from malformed client messages.

Handle:

- invalid JSON;
- unknown message type;
- invalid payload;
- movement before joining room;
- chat before joining room;
- unknown room;
- invalid tile;
- disconnected socket.

Return structured error messages:

```ts
{
  type: 'error',
  code: 'INVALID_MESSAGE',
  message: 'Invalid message'
}
```

Do not leak stack traces to clients.

## 21. Security Constraints

This is a prototype, but use sensible defaults.

Requirements:

- validate every inbound message;
- trim user-provided strings;
- cap message lengths;
- HTML-escape chat text in the client UI if rendering with HTML;
- do not use `innerHTML` for chat messages;
- reject oversized WebSocket messages;
- do not trust client position;
- do not trust client username without sanitisation;
- keep server-side room state authoritative.

Not required for MVP:

- full authentication;
- rate limiting;
- profanity filtering;
- audit logs;
- staff permissions;
- ban system.

## 22. Visual Direction

For the first prototype, visuals should be functional rather than polished.

Acceptable MVP visuals:

- simple isometric diamond tiles;
- flat colour placeholder avatars;
- username labels above avatars;
- hover highlight on selected tile;
- basic chat panel.

Avoid spending time on:

- detailed pixel art;
- sprite animation sheets;
- furniture catalogues;
- avatar clothing composition;
- lighting effects;
- shaders.

The visual goal is to prove the grid, projection, movement, and multiplayer state.

## 23. Milestones

### Milestone 1: Project skeleton

Deliver:

- Bun workspace created;
- client app is served by Bun;
- server app runs with Bun;
- shared protocol package imports successfully;
- shared engine package imports successfully;
- root README has setup instructions.

Acceptance criteria:

- `bun install` works;
- `bun run dev` starts the Bun server and client asset pipeline;
- no TypeScript errors.

### Milestone 2: Static room rendering

Deliver:

- PixiJS canvas initialised;
- default isometric room rendered;
- basic camera/world offset;
- tile hover detection.

Acceptance criteria:

- browser displays a 10x10 isometric room;
- moving mouse over tiles highlights the correct tile;
- clicking a tile logs its tile coordinate.

### Milestone 3: WebSocket connection

Deliver:

- client connects to Bun WebSocket server;
- server sends `connected` message;
- client can send `room.join`;
- server responds with `room.snapshot`.

Acceptance criteria:

- browser console shows successful connection;
- joining room returns snapshot;
- invalid messages are rejected safely.

### Milestone 4: Multi-user presence

Deliver:

- users appear in room on join;
- users disappear on disconnect;
- multiple tabs show each other.

Acceptance criteria:

- open two browser tabs;
- each tab sees both avatars;
- closing one tab removes that avatar from the other.

### Milestone 5: Server-authoritative movement

Deliver:

- click tile sends `avatar.move.request`;
- server validates target;
- server calculates path;
- server broadcasts `avatar.moved`;
- clients animate avatar along path.

Acceptance criteria:

- all connected clients see the same movement;
- blocked/out-of-bounds movement is rejected;
- client cannot directly set its own position.

### Milestone 6: Chat

Deliver:

- chat input overlay;
- `chat.say` message;
- server broadcasts `chat.message`;
- clients render messages.

Acceptance criteria:

- user in tab A sends message;
- user in tab B sees it;
- empty/oversized messages are rejected.

### Milestone 7: Persistence foundation

Deliver:

- PostgreSQL schema added;
- database connection helper;
- optional room loading from DB;
- optional chat persistence.

Acceptance criteria:

- migrations/schema can initialise database;
- server can connect to database;
- default room can be loaded or seeded.

This milestone is lower priority than the realtime room loop.

## 24. Definition of Done

The MVP is done when:

- repo installs cleanly with Bun;
- client and server run locally;
- two browser tabs can join the same room;
- both tabs see each other;
- movement is server-authoritative;
- chat works;
- invalid messages do not crash the server;
- core shared logic has tests;
- README explains how to run the project;
- code is organised enough to continue development without a rewrite.

## 25. Implementation Order

Follow this order:

1. Create workspace.
2. Create shared protocol package.
3. Create shared engine package.
4. Create Bun WebSocket server.
5. Create Bun-served PixiJS client.
6. Render static isometric room.
7. Add WebSocket connection.
8. Add room join and snapshot.
9. Add multi-user presence.
10. Add movement request/approval/broadcast.
11. Add movement animation.
12. Add chat.
13. Add tests.
14. Add PostgreSQL schema.
15. Polish README.

Do not start with database persistence or visual polish.

## 26. Suggested Dependencies

### Root/dev

- TypeScript.
- Biome.
- Conventional Commit hook.

### Client

- PixiJS.

### Server

- Zod or Valibot.
- Drizzle optional.
- Bun SQL optional.

### Testing

- Bun test runner.

Keep dependencies minimal.

## 27. Coding Standards

- Follow the repository ground rules in [AGENTS.md](AGENTS.md).
- Use Conventional Commits for all commits.
- Use Biome for formatting, linting, and import organization.
- Prefer Bun-native APIs and tooling before adding Node-oriented alternatives.
- Use strict TypeScript.
- Avoid `any` except at parse boundaries.
- Keep protocol types explicit.
- Prefer small modules.
- Keep rendering code separate from networking code.
- Keep authoritative game logic on the server.
- Keep deterministic shared logic in `packages/engine`.
- Avoid premature abstraction.
- Avoid introducing a framework on the server unless it clearly helps.

## 28. Future Roadmap After MVP

Once the MVP works, next candidates are:

1. Proper user accounts.
2. Room persistence.
3. Furniture rendering.
4. Furniture collision.
5. Furniture placement mode.
6. Room ownership.
7. Basic inventory.
8. Avatar customisation.
9. Room directory.
10. Moderation tools.
11. Redis-backed room routing/presence.
12. Horizontal scaling.
13. Admin panel.
14. Asset pipeline.
15. Better pixel art and animation.

Do not implement these until the MVP loop is stable.

## 29. Architectural Principles

- The server is authoritative.
- The client is a renderer and input collector.
- Durable state belongs in PostgreSQL.
- Ephemeral room state belongs in memory for MVP.
- Shared types prevent protocol drift.
- Runtime validation protects the server from bad clients.
- The first version should be small enough to understand fully.
- Optimise for a playable prototype, not a perfect engine.

## 30. First Visible Demo

The first demo should show:

1. A browser page with username input.
2. User joins `Lobby`.
3. A simple isometric room appears.
4. User avatar appears at spawn tile.
5. Second browser tab joins.
6. Both users see each other.
7. User A clicks a tile and walks there.
8. User B sees User A walk there.
9. User B sends a chat message.
10. User A sees the chat message.

That is the MVP.
