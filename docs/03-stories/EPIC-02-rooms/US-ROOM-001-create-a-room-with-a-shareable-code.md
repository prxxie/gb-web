---
id: US-ROOM-001
title: Create a room and share a six-character code
epic: EPIC-02-rooms
status: ready
priority: P0
size: M
depends_on: [US-FND-002, US-AUTH-001]
open_questions: []
accepted_assumptions: [OQ-04]
refs: [02-reference/api/rooms.md, 02-reference/data/room-state.md, 02-reference/screens/main.md]
---

# US-ROOM-001 — Create a room and share a six-character code

## 1. Story

**As a** host on a phone
**I want** a room with a short code I can say out loud
**so that** my friends join without accounts, invites or links.

## 2. Context

The room code is the only join mechanism in v1 and it is typed by hand on a touch keyboard, which drives both the
alphabet and the length ([glossary](../../01-overview/glossary.md)). The room itself is a Durable Object keyed by the
code ([ADR-0001](../../04-decisions/adr/ADR-0001-stack-phaser-react-cloudflare.md)).

| Topic | Reference |
|-------|-----------|
| `POST /rooms`, `GET /rooms/{code}` | [api/rooms.md](../../02-reference/api/rooms.md) |
| `RoomState` and its lifecycle | [data/room-state.md](../../02-reference/data/room-state.md) |
| Main menu create/join controls | [screens/main.md](../../02-reference/screens/main.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A valid session token | `POST /api/v1/rooms {"maxPlayers":4,"isPrivate":true,"mode":"solo","mapId":"map-01"}` | `201` with a six-character `roomCode` matching `^[A-HJ-NP-Z2-9]{6}$`, `joinUrl` and `wsUrl` (`TC-ROOM-120`) |
| AC2 | A code collision | A new room is created | The DO retries with a fresh code up to 5 times, then returns `503` with `retryAfterSeconds`; no duplicate room is created (`TC-ROOM-120`) |
| AC3 | `maxPlayers` of 3 or 10 | `POST /rooms` is called | `422 validation_failed` naming the field — GunBound's capacities are 4/6/8, and 1v1 stays as our extra (`TC-ROOM-071`) |
| AC4 | One IP | 11 rooms are created within a minute | The 11th returns `429` with `retryAfterSeconds`; the first 10 succeed (`TC-ROOM-072`) |
| AC5 | A closed room code | `GET /rooms/{code}` is called | `410 room-closed` and the main menu shows the translated banner, staying on `/` (`TC-ROOM-073`, `TC-ROOM-136`) |
| AC6 | A successful create on the main menu | The response arrives | The host is routed to `/lobby/<code>` and sees the code with a copy control (`TC-ROOM-134`) |
| AC7 | The code input on the main menu | `i`, `o`, `1` or `0` is typed | The character is rejected and Join enables only at 6 characters (`TC-ROOM-133`) |
| AC8 | A created room | 10 minutes pass with no activity | The room storage is deleted and the code can be issued again (`TC-ROOM-123`) |

## 4. Contract

`POST /api/v1/rooms` (session token) → `201`:

| Field | Type | Notes |
|-------|------|-------|
| `roomCode` | string | `^[A-HJ-NP-Z2-9]{6}$` |
| `joinUrl` | string | `https://<host>/lobby/<code>` |
| `wsUrl` | string | `wss://<host>/api/v1/rooms/<code>/ws` |
| `maxPlayers` | integer | Echo of the request, one of 2, 4, 6, 8 (GunBound: 4/6/8) |
| `mode` | enum | `solo` \| `score` \| `tag` \| `jewel`, default `solo` (`US-CORE-010`) |
| `mapId` | string | one of the eleven maps, default `map-01` (`US-CORE-012`) |
| `expiresAt` | string | ISO-8601, `createdAt + 10 min` while idle |

`GET /api/v1/rooms/{code}` (no auth) → `200` with `{code, status, joined, maxPlayers, joinable}` and deliberately no
player ids. Rate limit: 10 rooms/minute per IP, 30/hour per account (`NFR-25`).

Code alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (31 symbols, no `I`, `O`, `0`, `1`); 31^6 ≈ 887 million.

## 5. Rules and edge cases

- The host must be a member of the room it creates (`hostPlayerId`).
- `isPrivate` only suppresses the leaderboard-free public listing that does not exist in v1; every room is joined by code.
- A room in `ended` status cannot be recreated with the same code for 60 seconds.
- `GET /rooms/{code}` must never leak `playerId`, `accountId` or `guestId` — joiners learn those from the socket.
- Rate limiting uses the client IP from `CF-Connecting-IP`; an account limit applies on top when signed in.

## 6. Implementation notes

- `apps/worker/src/routes/rooms.ts` creates the DO stub and calls `POST /internal/create` on it; the DO owns the code
  retry so two concurrent creates cannot both win.
- `ctx.storage.setAlarm(now + 10 min)` on creation, re-armed on every activity.
- Rate limit counters live in a `RateLimit` DO or KV — one instance per IP is enough at the target scale (`OQ-33`).

## 7. Out of scope

- Joining, roster, teams — [US-ROOM-002](US-ROOM-002-join-a-room-and-see-the-roster.md), [US-ROOM-003](US-ROOM-003-assign-teams-and-start-the-match.md).
- The WebSocket — [US-ROOM-006](US-ROOM-006-relay-signaling-and-issue-turn-credentials.md).

## 8. Test notes

`TC-ROOM-120`, `TC-ROOM-071`, `TC-ROOM-072`, `TC-ROOM-073`, `TC-ROOM-133`, `TC-ROOM-134`, `TC-ROOM-136`,
`TC-ROOM-123`. Miniflare runs the DO; the collision test stubs the code generator to return the same code twice. Red
first: `tests/worker/rooms.test.ts::create_returns_valid_code`.

## 9. Open questions

- **OQ-04** (accepted assumption) — the code alphabet and the code's lifetime are implicitly decided by the spec's
  "6 characters" plus the glossaries' exclusion set; the assumption is a 10-minute idle expiry and a 60-second reuse
  block. If the client wants longer-lived codes, `room-state.md` and AC8 change together.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** room creation, the 31-character alphabet, the code format and the 10-per-minute limiter are implemented; code generation and capacity are covered by `packages/core/tests/room.test.ts`
