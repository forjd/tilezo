# Follow Ups

## Provider-Backed Bot Chat

The first bot pass adds scripted server-authoritative room occupants with movement and chat broadcasts. Before enabling AI-backed conversations, add provider configuration, request timeouts, moderation and rate-limit boundaries, fallback canned responses, and tests that prove rooms continue to work when the provider is unavailable.

## Direct Friend Messaging — implemented

Tilezo ships **friend-gated direct messages** (not room-scoped whispers): a `dm.send`
WebSocket message routes through `DirectMessageService`, which checks that the two users
are mutual friends, persists the message (`direct_messages` table), and publishes a
`dm.message` to the recipient's and sender's per-user topics (`user:<id>`) for realtime
delivery to every open tab. History is available via `GET /friends/:id/messages` and is
also friend-gated. Sends are rate-limited (`dm` token bucket) and the text is sanitized and
length-bounded by the protocol schema. Covered by protocol/service/store/router unit tests,
a real-Postgres integration test, and a two-user browser test.

Not yet built: read receipts/unread badges, typing indicators in DMs, message deletion or
editing, and blocking. A blocked-users list would gate `DirectMessageService.send` the same
way the friendship check does today.
