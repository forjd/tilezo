# Ideas

## Centralised Logging

Added: 2026-05-13 19:19 BST

Add centralised logging so Tilezo can collect client, server, and room-loop events in one place for debugging, operations, and post-incident review.

The logging pass should keep the current Bun/TypeScript stack in mind, preserve useful local developer output, and avoid adding noisy product scope outside the multiplayer room loop. Useful early signals could include server startup, WebSocket connect/disconnect events, room joins/leaves, movement validation failures, chat moderation hooks, persistence errors, and request correlation IDs.

## AI-Backed NPCs and Bots

Added: 2026-05-13 19:20 BST

Add room NPCs or bots that can participate in the multiplayer room loop and optionally connect to AI providers for actual conversational chat.

Keep the first version scoped to room presence, movement, and chat foundations: bots should behave like server-authoritative room occupants, with clear boundaries for scripted behavior, moderation, rate limits, provider configuration, and fallback canned responses when AI is unavailable.

## Persistent Room Sessions

Added: 2026-05-13 19:21 BST
Implemented: 2026-05-13

Persist enough session and room-presence state that a logged-in player can reload the page and respawn back into the same room instead of returning to a blank or disconnected starting state.

The first version should focus on the core room loop: authenticate the reconnecting user, restore their most recent room membership, validate that the room still exists and is joinable, place the avatar on a safe tile, and broadcast the rejoined presence to other occupants. Open questions include how long room presence should remain resumable after disconnect, whether exact tile position should be restored, and how to handle rooms that have since closed, reached capacity, or changed rights.

## Friends List and Presence

Added: 2026-05-13 19:22 BST

Add a friends list so players can manage social connections, see who is online or offline, and quickly act on a selected friend.

The feature should include adding and removing friends, online/offline presence indicators, and a friend detail view that shows the friend's avatar plus options to message them or join their current room when available. The first version should stay close to Tilezo's room, presence, movement, chat, and persistence foundations, with clear handling for privacy, unavailable rooms, and friends who are offline.
