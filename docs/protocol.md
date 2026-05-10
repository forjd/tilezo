# WebSocket Protocol

The realtime protocol uses JSON messages over WebSocket.

Default endpoint:

```txt
ws://localhost:3000/ws
```

## Client Messages

### `room.join`

Join a room with a temporary username.

```json
{
  "type": "room.join",
  "roomId": "lobby",
  "username": "Tom"
}
```

### `avatar.move.request`

Request movement to a target tile. The server decides whether the target is valid and which path is accepted.

```json
{
  "type": "avatar.move.request",
  "target": {
    "x": 5,
    "y": 3
  }
}
```

### `chat.say`

Send a plain room chat message.

```json
{
  "type": "chat.say",
  "text": "Hi"
}
```

### `ping`

Simple ping/pong support.

```json
{
  "type": "ping",
  "sentAt": "2026-05-10T12:00:00.000Z"
}
```

## Server Messages

### `connected`

Sent immediately after a WebSocket connection opens.

```json
{
  "type": "connected",
  "userId": "user_..."
}
```

### `room.snapshot`

Sent after a successful join.

```json
{
  "type": "room.snapshot",
  "roomId": "lobby",
  "users": [],
  "tiles": []
}
```

### `user.joined`

Broadcast when a user joins a room.

```json
{
  "type": "user.joined",
  "user": {
    "id": "user_...",
    "username": "Tom",
    "position": {
      "x": 2,
      "y": 2
    }
  }
}
```

### `user.left`

Broadcast when a user disconnects or changes rooms.

```json
{
  "type": "user.left",
  "userId": "user_..."
}
```

### `avatar.moved`

Broadcast after the server accepts a movement request.

```json
{
  "type": "avatar.moved",
  "userId": "user_...",
  "path": [
    {
      "x": 2,
      "y": 2
    },
    {
      "x": 3,
      "y": 2
    }
  ]
}
```

### `chat.message`

Broadcast after the server accepts a chat message.

```json
{
  "type": "chat.message",
  "userId": "user_...",
  "username": "Tom",
  "text": "Hi",
  "sentAt": "2026-05-10T12:00:00.000Z"
}
```

### `pong`

Response to `ping`.

```json
{
  "type": "pong",
  "sentAt": "2026-05-10T12:00:00.000Z"
}
```

### `error`

Structured error response.

```json
{
  "type": "error",
  "code": "INVALID_MESSAGE",
  "message": "Invalid message"
}
```

## Validation Limits

Inbound client messages are validated by `packages/protocol`.

Current limits:

- Raw WebSocket payload: 8 KB.
- Username: 1 to 24 trimmed characters.
- Room ID: 1 to 64 trimmed characters.
- Chat text: 1 to 240 trimmed characters.
- Tile coordinates: integers only.

Malformed JSON, unknown message types, invalid payloads, movement before joining, chat before joining, and invalid tiles are rejected without crashing the server.
