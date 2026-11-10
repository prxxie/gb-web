---
id: EPIC-02-rooms
code: ROOM
title: Rooms, lobby, presence and host migration
---

# EPIC-02 — Rooms, lobby, presence and host migration

The server half of a match: a six-character room code, a `Room` Durable Object that holds the roster, the WebSocket
signaling relay, the 20-second grace window for dropped players, and the election that keeps a match alive when the
host disappears.

## Goal

Up to eight players on two teams join one room by code from a phone, see each other live, start a balanced match, survive
one player's tunnel, and continue within five seconds when the host's phone dies.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-ROOM-001](US-ROOM-001-create-a-room-with-a-shareable-code.md) | Create a room and share a six-character code | P0 | M | done | US-FND-002, US-AUTH-001 |
| [US-ROOM-002](US-ROOM-002-join-a-room-and-see-the-roster.md) | Join a room by code and see the live roster | P0 | M | done | US-ROOM-001 |
| [US-ROOM-003](US-ROOM-003-assign-teams-and-start-the-match.md) | Assign teams and start the match only when they are balanced | P0 | S | done | US-ROOM-002 |
| [US-ROOM-004](US-ROOM-004-reconnect-within-the-grace-window.md) | Survive a dropped connection with a 20-second grace window | P1 | M | done | US-ROOM-002 |
| [US-ROOM-005](US-ROOM-005-elect-a-new-host-when-the-host-leaves.md) | Elect a new host within five seconds when the host disappears | P0 | M | done | US-ROOM-004 |
| [US-ROOM-006](US-ROOM-006-relay-signaling-and-issue-turn-credentials.md) | Relay peer signaling and issue TURN credentials | P0 | M | done | US-ROOM-002 |
| [US-ROOM-007](US-ROOM-007-pick-mode-map-and-loadout.md) | Pick the mode, the map and the loadout | P0 | M | done | US-ROOM-002, US-CORE-010, US-CORE-012 |
| [US-ROOM-008](US-ROOM-008-split-the-room-object.md) | Split the room object into collaborators | P2 | L | done | US-ROOM-003, US-ROOM-005, US-ROOM-006, US-ROOM-007, US-RANK-001 |
<!-- /cpt:epic-stories -->

## Out of scope

- The peer-to-peer data path and snapshots — EPIC-04.
- Match rules and physics — EPIC-03.
- Public matchmaking, friends lists, invites by link beyond the room code.
