# Realtime Room Loop

This document describes the implemented multiplayer loop.

## Connection

The browser first creates an account or logs in through `/auth/register` or `/auth/login`. Usernames are unique case-insensitively, and passwords are stored as hashes.

When a browser opens `ws://localhost:3000/ws?token=<auth-token>`, the server:

1. Verifies the auth token.
2. Stores socket metadata from the authenticated database user.
3. Sends a `connected` message.
4. If persistence has a valid last joined room for the user, rejoins that room automatically.

Socket metadata currently includes:

- `userId`
- `username`
- `roomId`
- `connectionId`
- `resumeRoomId`

When a browser reloads with a stored auth token, the client opens a new WebSocket with that token.
If the previous room is still available and joinable by the same user, the server restores room
membership at the room spawn position, sends a `room.snapshot`, broadcasts `user.joined`, and sends
an updated `room.list`. If the persisted room is no longer available, the server clears the saved
room and leaves the client at the room browser.

## Join

The client can send `room.list.request` before joining or while already in a room. The server
responds with the rooms available to the authenticated user, including public rooms, that user's
private room, live user counts, and which room the socket has joined.

When the client sends `room.join`, the server:

1. Confirms the socket is authenticated and validates the room ID.
2. Confirms the requested room is public or privately owned by the socket user.
3. Leaves the previous room if the socket had already joined one.
4. Creates or retrieves the requested room.
5. Adds the user at the room spawn position.
6. Subscribes the socket to the room topic.
7. Sends a `room.snapshot` to the joining socket.
8. Broadcasts `user.joined` to the room topic.
9. Sends an updated `room.list` to the joining socket.
10. Persists the room as the user's last joined room when database persistence is available.

Public rooms are loaded from `assets/rooms/public-rooms.json` and expanded into rectangular tile
layouts at server startup. When persistence is available, the bundled public rooms are seeded into
the `rooms` table and persisted private rooms are included only for their owner.

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

1. Removes the user from the joined room only if the closing socket is still the active socket for that user.
2. Unsubscribes the socket from the room topic.
3. Broadcasts `user.left`.
4. Deletes the in-memory room if it is empty.

## Current Tradeoffs

- Occupied-user tile blocking is not implemented.
- Diagonal movement is supported when the diagonal tile is walkable and the move does not cut between two blocked adjacent tiles.
- High-frequency position persistence is intentionally not implemented.
- Room state is in memory and resets when the server restarts.
