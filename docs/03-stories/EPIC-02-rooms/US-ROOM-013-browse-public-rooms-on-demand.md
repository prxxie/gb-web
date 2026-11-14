---
id: US-ROOM-013
title: Browse public rooms on demand
epic: EPIC-02-rooms
status: done
priority: P2
size: M
depends_on: [US-ROOM-001, US-ROOM-002, US-ROOM-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/rooms.md, 02-reference/screens/main.md, 02-reference/data/README.md, 04-decisions/adr/ADR-0008-public-room-directory.md]
---

# US-ROOM-013 — Browse public rooms on demand

## 1. Story

**As a** player on the main menu
**I want** to load a snapshot of public rooms and filter it by waiting or playing
**so that** I can find a room without knowing its code, while the live room and signaling stay authoritative.

## 2. Context

The current main menu only joins by six-character code. A public directory can be a static read model in D1 because the
browser loads it only when the panel opens, a filter is selected or the player refreshes. The room itself remains a
Durable Object: seat assignment, host election, WebSocket signaling and host migration are live operations that D1
cannot coordinate (`ADR-0008`).

The directory is a projection, not a second room state. A short cache and expiring rows make eventual consistency
acceptable; selecting a stale room is resolved by the existing join endpoint and Room DO.

| Topic | Reference |
|---|---|
| List API | [`02-reference/api/rooms.md`](../../02-reference/api/rooms.md) |
| Menu surface | [`02-reference/screens/main.md`](../../02-reference/screens/main.md) |
| Directory projection | [`02-reference/data/README.md`](../../02-reference/data/README.md) |
| Storage decision | [`ADR-0008`](../../04-decisions/adr/ADR-0008-public-room-directory.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the public-room panel is closed or showing one filter | time passes without a player action | the client sends no list request and opens no room WebSocket; only open, filter selection or an explicit refresh starts a fetch (`TC-ROOM-725`) |
| AC2 | public rooms exist | the browser calls `GET /rooms` | it returns at most the bounded page, only public non-expired rows, fixed `updatedAt DESC, roomCode ASC` order, filters by `waiting`/`playing`, and exposes no identity or socket data (`TC-ROOM-722`, `TC-ROOM-723`, `TC-ROOM-727`) |
| AC3 | a room changes lifecycle | the room is created, joined, left, started or closed | its directory row is upserted on the first four transitions and deleted on close; heartbeat or snapshot traffic writes no directory row (`TC-ROOM-724`) |
| AC4 | the main menu is at 844 × 390 | the player opens the public-room panel and changes filters | the panel has loading, empty, error and retry states, the three primary menu actions keep their layout, and closing the panel returns focus to its trigger (`TC-ROOM-725`) |
| AC5 | a listed waiting room becomes stale | the player selects it | the existing join flow returns the authoritative `room-full`, `room-closed` or `room-not-found` result inline and refreshes the list; a playing row is visible but not joinable (`TC-ROOM-726`) |
| AC6 | the host creates a room | the create form renders | a localised public/private control is present, public is the default, private rooms are omitted from the directory, and the room code still joins both kinds (`TC-ROOM-728`) |

## 4. Contract

### Public list

```http
GET /api/v1/rooms?status=waiting&limit=20&cursor=<opaque>
```

| Field | Type | Rule |
|---|---|---|
| `status` | `waiting \| playing`, optional | Omitted means all public rooms; `lobby` is projected as `waiting`; ended/abandoned rooms are absent |
| `limit` | integer | Default 20, minimum 1, maximum 50 |
| `cursor` | opaque string | Invalid or truncated cursor is `400 bad-request` |

Response `200`:

```json
{
  "rooms": [
    {
      "roomCode": "K7M2QX",
      "status": "waiting",
      "mode": "solo",
      "mapId": "map-01",
      "seated": 2,
      "maxPlayers": 4,
      "joinable": true,
      "updatedAt": "2026-11-14T09:15:00Z"
    }
  ],
  "nextCursor": null,
  "request_id": "uuid"
}
```

The response carries no host name, account id, guest id, player id, IP address, token or socket information.
`Cache-Control: public, max-age=5` is the maximum cache lifetime.

### Directory projection

`room_directory` is a D1 table written by the Room DO through one narrow directory adapter. It contains
`room_code`, `status`, `mode`, `map_id`, `seated`, `max_players`, `is_private`, `joinable`, `created_at`, `updated_at`
and `expires_at`. The list query filters `is_private = 0` and `expires_at > now`.

The projection is updated on create, join, leave, start and close. A waiting row expires 10 minutes after its last
directory lifecycle write (`updated_at + 10 min`); heartbeat traffic does not extend it because that traffic may not
write D1. A playing row expires at `matchStartedAt + 24 h`. A close deletes the row. No heartbeat, chat or snapshot path
writes it.

### Selection

A joinable row enters the existing `POST /rooms/{code}/join` flow and then the existing room socket. The list never
opens a room socket. A playing row is rendered read-only because v1 has no spectator or late-join flow.

## 5. Rules and edge cases

- The list is eventual and may lag by at most five seconds plus its row-expiry window.
- A private room never appears, even when it is full or playing; joining by code is unchanged.
- The public/private control defaults to public because the existing API default is `isPrivate: false`; the host can
  opt out before creating the room.
- The all-filter omits `status`; waiting and playing each send their exact enum.
- Clicking the selected filter refreshes that page; no timer or background polling exists.
- An empty page has an explicit empty state, not a blank panel.
- A stale selection may fail; the resulting problem is rendered inline and the current filter reloads.
- The panel is a modal/dialog with a named close control and returns focus to its trigger.

## 6. Implementation notes

- New route: `apps/worker/src/routes/rooms.ts` `GET /rooms`.
- New D1 migration: `room_directory` plus `(is_private, status, updated_at DESC, room_code)` and `expires_at` indexes.
- New directory adapter used by `Room` on lifecycle transitions; no full `RoomState` copy in D1.
- Worker response cache for at most 5 seconds; no Durable Object fan-out for listing.
- Main menu panel consumes the API; existing create-room form sends `isPrivate`.

## 7. Out of scope

- Matchmaking, room recommendations, search by player, invites and spectator mode.
- Joining a room after its match has started.
- A live subscription to directory changes.
- Host names or other player identity in the list.

## 8. Test notes

`TC-ROOM-722` (public filter and expiry), `TC-ROOM-723` (cursor ordering), `TC-ROOM-724` (projection lifecycle),
`TC-ROOM-725` (on-demand loading and menu layout), `TC-ROOM-726` (stale selection and playing read-only),
`TC-ROOM-727` (no identity/socket fields), `TC-ROOM-728` (visibility control).

The first implementation run must fail these cases before the route, migration and panel exist.

Red: `apps/worker/tests/migrations.test.ts`, `apps/worker/tests/rooms.test.ts`,
`apps/worker/tests/room-directory.test.ts`, `apps/web/tests/public-rooms.test.tsx` — all failed before the
implementation because `room_directory`, `GET /rooms`, the lifecycle adapter and the menu dialog did not exist.

## 9. Open questions

None.

## Delivery status — 2026-11-14

Implemented the D1 public-room projection, its lifecycle adapter, the bounded cached list route, the main-menu dialog and
the public/private create choice. The list stays a snapshot: opening, changing a filter, pressing refresh or asking for
the next page is the only read path.

- **Tests:** `pnpm test` for this branch commit — 145 files / 1,235 cases, 1,234 passed and 1 skipped; `TC-ROOM-722`–`TC-ROOM-728` are cited
  by the worker, component and browser suites.
- **Browser:** `pnpm e2e` — 103 passed on a free port; the on-demand, stale-join and visibility cases are in
  `tests/e2e/public-rooms.spec.ts`.
- **Evidence:** [`US-ROOM-013`](../../05-quality/evidence/US-ROOM-013/README.md).
- **Safety:** one additive `room_directory` migration with no backfill; private rooms are excluded and the public body
  carries no identity, token, IP or socket field.
