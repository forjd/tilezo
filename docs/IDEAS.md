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

## Retro Paused Disconnected State

Added: 2026-05-13 20:54 BST

Add a disconnected state that feels like a retro game paused pop-up instead of a generic network error.

When the client loses the room connection, freeze or dim the current room view and show a compact pixel-art modal with clear reconnection status. It should feel in-world and console-like, with actions such as retrying, returning to the lobby, or showing a short reconnect countdown. The first version should stay scoped to the room loop and WebSocket lifecycle, including graceful handling for server restarts, idle disconnects, and failed reconnect attempts.

## Create Room Dialog

Added: 2026-05-13 20:55 BST

Add a create-room option that opens a dialog where players can make their own rooms instead of only joining existing ones.

The dialog should let players choose from a small selection of predefined room layouts, then configure basic options such as room name, description, capacity, visibility, starting tile, and access rules. The first version should stay close to Tilezo's room and persistence foundations: create the room server-side, validate selected layout IDs against Tilezo-defined templates, persist ownership and settings, then route the creator into the new room once it is ready.

## Stress Test CLI

Added: 2026-05-13 21:03 BST

Add a CLI tool that can run realistic load scenarios against different areas of the app, including registration, login, character creation, room entry, movement, and chat.

The tool should support scripted bot flows, such as triggering 100 bots to register accounts, log in, create characters, enter a room, walk around, and send chat messages. It should make it easy to target specific subsystems independently or as an end-to-end room-loop scenario, collect timing and failure metrics, and surface server bottlenecks without requiring manual browser sessions.
