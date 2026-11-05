---
id: US-ROOM-002
title: Join a room by code and see the live roster
epic: EPIC-02-rooms
status: ready
priority: P0
size: M
depends_on: [US-ROOM-001]
open_questions: []
accepted_assumptions: [OQ-04]
refs: [02-reference/api/signaling.md, 02-reference/data/room-state.md, 02-reference/screens/lobby.md]
---

# US-ROOM-002 — Join a room by code and see the live roster

## 1. Story

**As a** player with a code
**I want** to open one socket and see the room fill up
**so that** everyone knows who is in, on which team, before the match starts.

## 2. Context

The WebSocket to the `Room` DO is the single channel for roster, signaling and match events; joining means
authenticating the first message, becoming a member with a stable slot, and receiving `room_state`. Presence changes
fan out as `room_state`, not as deltas.

| Topic | Reference |
|-------|-----------|
| Envelope, `auth`, `room_state` | [api/signaling.md](../../02-reference/api/signaling.md) |
| `RoomState`, `Member`, storage keys | [data/room-state.md](../../02-reference/data/room-state.md) |
| Lobby layout and copy keys | [screens/lobby.md](../../02-reference/screens/lobby.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A valid session token and a joinable room | The client opens `/rooms/{code}/ws` and sends `auth` within 5 s | No member is created before `auth`; after it, the client receives `room_state` with itself as the only member and `connectionState: "connected"` (`TC-ROOM-121`) |
| AC2 | A socket that sends nothing for 5 s, or an invalid token | The timeout expires | The DO closes with `4401` and creates no member (`TC-ROOM-121`, `TC-ROOM-126`) |
| AC3 | A full 8-slot room | A ninth player authenticates | Close `4409`, the roster is unchanged (`TC-ROOM-122`) |
| AC4 | Two browser contexts in the same room | The second joins | Both receive the same roster, the same slot numbering and the same teams (`TC-ROOM-147`) |
| AC5 | A member leaves in `lobby` | `leave` or the socket closes | The slot is reused by the next joiner and no duplicate member appears (`TC-ROOM-128`) |
| AC6 | A member stops answering pings | Three missed pings | Their `connectionState` becomes `grace` and peers see it in the next `room_state` (`TC-ROOM-127`) |
| AC7 | All members gone | 60 s pass | The room closes and its storage is deleted (`TC-ROOM-123`) |

## 4. Contract

WebSocket `wss://<host>/api/v1/rooms/{code}/ws`, first client message within 5 s:

```json
{"t":"auth","token":"<sessionToken>","displayName":"Bao","avatarId":"avatar-03","guestId":null}
```

`auth` reply is `room_state`:

| Field | Type | Notes |
|-------|------|-------|
| `code` | string | — |
| `status` | `lobby\|playing\|ended\|abandoned` | — |
| `hostPlayerId` | string | — |
| `hostGeneration` | integer | Starts at 1 |
| `maxPlayers` | integer | 2, 4, 6, 8 |
| `members` | array | `{playerId, slot, team, displayName, avatarId, role, connectionState}` — no account or guest ids |
| `you` | string | The receiver's `playerId` |

Slot assignment: lowest free slot in `0…maxPlayers-1`. `team` is `null` until [US-ROOM-003](US-ROOM-003-assign-teams-and-start-the-match.md).

## 5. Rules and edge cases

- The token is never sent in the URL; a proxy log must not contain a credential (`NFR-09`).
- A second socket for the same subject replaces the first (`TC-ROOM-068`).
- `displayName` is captured at join time and stored on the member; renames reach peers through the next `room_state`.
- Membership survives `grace`; only `disconnected` frees the slot in `lobby`.
- The DO never parses SDP, never stores a credential and never trusts a client-supplied `playerId`.

## 6. Implementation notes

- `apps/worker/src/room.ts`: `webSocketMessage`, `webSocketClose`, `alarm()` for sweep, grace and ping timeouts.
- A `socket` field on a member is in-memory only; it is stripped by `serializeRoomState()`.
- The lobby UI renders two team columns from `members`, with empty slots shown as placeholders up to `maxPlayers`.

## 7. Out of scope

- Team assignment and starting the match — [US-ROOM-003](US-ROOM-003-assign-teams-and-start-the-match.md).
- Peer connection setup after `match_started` — EPIC-04.

## 8. Test notes

`TC-ROOM-121`, `TC-ROOM-126`, `TC-ROOM-122`, `TC-ROOM-147`, `TC-ROOM-128`, `TC-ROOM-127`, `TC-ROOM-123`. Worker tests
use `miniflare`'s `SELF.fetch` for the upgrade and a raw `WebSocketPair` harness. Red first:
`apps/worker/tests/signaling.test.ts::auth_required_within_5s`.

## 9. Open questions

- **OQ-04** (accepted assumption) — the room lifetime drives AC7's 60-second close; see [US-ROOM-001](US-ROOM-001-create-a-room-with-a-shareable-code.md) § 9.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `POST /api/v1/rooms/{code}/join` seats the guest, the lobby opens `GET /rooms/{code}/ws`, the DO verifies the session token from the `auth` frame and pushes `room_state` with `you`. Proven against a real Durable Object with two clients (join → teams → start → snapshot → host migration). Remaining: the two-phone pass on real devices.
