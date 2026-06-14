# WebSocket Protocol

The realtime protocol uses JSON messages over WebSocket.

Default endpoint after login or account creation:

```txt
ws://localhost:3000/ws?token=<auth-token>
```

## Client Messages

### `room.list.request`

Request the room directory available to the authenticated user with live occupancy.

```json
{
  "type": "room.list.request"
}
```

### `room.join`

Join a room as the authenticated WebSocket user.

```json
{
  "type": "room.join",
  "roomId": "lobby"
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

### `chat.typing`

Send transient typing state for the current room.

```json
{
  "type": "chat.typing",
  "isTyping": true
}
```

### `dm.send`

Send a friend-gated direct message to another user.

```json
{
  "type": "dm.send",
  "toUserId": "user_...",
  "text": "Hi"
}
```

### `dm.typing`

Send transient typing state for a direct-message conversation. The server only forwards the update
when the users are allowed to message each other.

```json
{
  "type": "dm.typing",
  "toUserId": "user_...",
  "isTyping": true
}
```

### `avatar.appearance.update`

Broadcast the authenticated user's saved character appearance to the current room after the profile
update succeeds.

```json
{
  "type": "avatar.appearance.update",
  "appearance": {
    "hair": "side-part",
    "hairColor": "#8b4a24",
    "skinTone": "#f2c097",
    "shirt": "hoodie",
    "shirtColor": "#2f5f7f",
    "pants": "straight",
    "pantsColor": "#d2c294",
    "shoes": "boots",
    "shoesColor": "#5b4218"
  }
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

Sent immediately after a WebSocket connection opens. When the authenticated user has a valid
persisted last room, the server may immediately follow this with `room.snapshot`, `user.joined`,
and `room.list` messages for the resumed room.

```json
{
  "type": "connected",
  "userId": "user_..."
}
```

### `room.snapshot`

Sent after a successful join or automatic room resume.

```json
{
  "type": "room.snapshot",
  "roomId": "lobby",
  "users": [],
  "tiles": []
}
```

Each room user includes `id`, `username`, `position`, and `appearance`.

### `room.list`

Sent after a room list request, a successful join, and an automatic room resume.

```json
{
  "type": "room.list",
  "rooms": [
    {
      "id": "lobby",
      "name": "Lobby",
      "userCount": 4,
      "joined": true
    }
  ]
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
    },
    "appearance": {
      "hair": "short",
      "hairColor": "#7a4424",
      "skinTone": "#f2c097",
      "shirt": "crew",
      "shirtColor": "#2f5f7f",
      "pants": "straight",
      "pantsColor": "#d2c294",
      "shoes": "boots",
      "shoesColor": "#5b4218"
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

### `avatar.appearance.updated`

Broadcast after a user changes their character while inside a room.

```json
{
  "type": "avatar.appearance.updated",
  "userId": "user_...",
  "appearance": {
    "hair": "bob",
    "hairColor": "#3b2418",
    "skinTone": "#f2c097",
    "shirt": "hoodie",
    "shirtColor": "#7f3b44",
    "pants": "wide",
    "pantsColor": "#77684b",
    "shoes": "sneakers",
    "shoesColor": "#2f3b40"
  }
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

### `chat.typing`

Broadcast after the server accepts a typing state update.

```json
{
  "type": "chat.typing",
  "userId": "user_...",
  "username": "Tom",
  "isTyping": true
}
```

### `dm.message`

Published to the sender and recipient user topics after the server accepts and persists a direct
message.

```json
{
  "type": "dm.message",
  "id": "dm_...",
  "fromUserId": "user_...",
  "toUserId": "user_...",
  "text": "Hi",
  "sentAt": "2026-05-10T12:00:00.000Z"
}
```

### `dm.typing`

Published to the recipient user topic after the server accepts a direct-message typing state update.

```json
{
  "type": "dm.typing",
  "fromUserId": "user_...",
  "toUserId": "user_...",
  "isTyping": true
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
- Room ID: 1 to 64 trimmed characters.
- Chat text: 1 to 240 trimmed characters.
- Tile coordinates: integers only.
- Avatar styles and colors must be one of the supported values exported by `@tilezo/protocol`.

Malformed JSON, unknown message types, invalid payloads, unauthenticated room joins, movement before
joining, chat before joining, character updates before joining, and invalid tiles are rejected
without crashing the server.
