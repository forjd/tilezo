# Realtime Room Loop

This document describes the implemented multiplayer loop.

## Connection

The browser first creates an account or logs in through `/auth/register` or `/auth/login`. Usernames are unique case-insensitively, and passwords are stored as hashes.

When a browser opens `ws://localhost:3000/ws?token=<auth-token>`, the server:

1. Verifies the auth token.
2. Stores socket metadata from the authenticated database user.
3. Sends a `connected` message.

Socket metadata currently includes:

- `userId`
- `username`
- `roomId`

## Join

When the client sends `room.join`, the server:

1. Confirms the socket is authenticated and validates the room ID.
2. Leaves the previous room if the socket had already joined one.
3. Creates or retrieves the requested room.
4. Adds the user at the room spawn position.
5. Subscribes the socket to the room topic.
6. Sends a `room.snapshot` to the joining socket.
7. Broadcasts `user.joined` to the room topic.

The default room is loaded from `assets/rooms/default-room.json` and expanded into a rectangular tile layout at server startup.

## Movement

Movement is server-authoritative.

The client sends only intent:

```json
{
  "type": "avatar.move.request",
  "target": {
    "x": 3,
    "y": 2
  }
}
```

The server:

1. Confirms the socket is in a room.
2. Looks up the user's current authoritative tile.
3. Rejects out-of-bounds or blocked targets.
4. Calculates a path with shared A* pathfinding logic.
5. Updates the authoritative user position.
6. Broadcasts `avatar.moved` with the accepted path.

The client animates avatars along the accepted path. It does not decide final position.

## Chat

When the client sends `chat.say`, the server:

1. Confirms the socket is in a room.
2. Uses the validated and trimmed message text.
3. Broadcasts `chat.message` to the room topic.

The client renders chat with DOM text nodes, not `innerHTML`.

## Disconnect

When a WebSocket closes, the server:

1. Removes the user from the joined room.
2. Unsubscribes the socket from the room topic.
3. Broadcasts `user.left`.
4. Deletes the in-memory room if it is empty.

## Current Tradeoffs

- Occupied-user tile blocking is not implemented.
- Diagonal movement is supported when the diagonal tile is walkable and the move does not cut between two blocked adjacent tiles.
- High-frequency position persistence is intentionally not implemented.
- Room state is in memory and resets when the server restarts.
