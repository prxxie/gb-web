---
id: CR-2026-11-14-public-room-browser
status: applied
requested_by: product owner
date: 2026-11-14
---

# CR-2026-11-14-public-room-browser — browse public rooms on demand

## Request

> Ví dụ ngoài sảnh sẽ load list các phòng hiện tại. Khi người chơi vào phòng se signaling với chủ phòng được không

> Ok làm cr đi

The product owner wants a public room browser outside the lobby. The list is a snapshot, not a live feed: it loads when
the browser opens and reloads only when the player chooses a filter such as all, waiting or playing. Selecting a room
still goes through the room authority and signaling path before gameplay becomes peer-to-peer.

## Impact

| Kind | Item | Change |
|---|---|---|
| Doc | `02-reference/api/rooms.md` | Add `GET /api/v1/rooms` with `status`, bounded cursor pagination, allowlisted sort and public fields |
| Doc | `02-reference/screens/main.md` | Add the room-browser panel, filter tabs, refresh behavior, loading/empty/error/stale outcomes |
| Doc | `02-reference/data/README.md` | Document the materialized `room_directory` projection and its lifecycle writes |
| Doc | `01-overview/architecture.md` | D1 provides the directory read model; the per-room DO remains the authority for membership and signaling |
| Story | New `EPIC-02-rooms` story | One vertical slice, size M: directory projection, public list API, menu filters, visibility, tests |
| Code | `apps/worker/src/routes/rooms.ts`, `apps/worker/src/room-do.ts`, `apps/worker/src/lib/db.ts` | Add the list route and directory upsert/delete on room create, join, leave, start and close |
| Code | `apps/worker/migrations/` | Add the `room_directory` table and indexes; no backfill of ephemeral rooms |
| Code | `apps/web/src/routes/MainPage.tsx`, API client, i18n, styles | Add static room-browser panel and filter buttons; no polling or room WebSocket until selection |
| Code | Tests | API contract, D1 projection, private-room exclusion, pagination, stale-room join, filter-only refresh and browser accessibility |
| Plan | `03-stories/delivery-plan.md` | Add 2.5 story-days to W7; active backlog moves 146.5 → 149.0 |
| Decision | Proposed `ADR-0008` | Record D1 as the public directory read model and the Room DO as the live room authority |
| Operations | `08-ops/runbook.md` | Add the directory-staleness and empty-directory checks; no new DO traffic is expected from listing |
| Gate | G1, G2 | Scope and the rooms API contract change, so both gates re-open |
| Stack | None | Uses the installed Worker, D1, React and API packs; no dependency or new layer |

Classification: **additive** with one new story and one D1 table. No shipped story needs rework. ⚠️ The migration creates
a new table; there is no backfill because room state is ephemeral, so rooms created before the deploy are not listed
until their directory row is written.

## Proposed contract

```http
GET /api/v1/rooms?status=waiting&limit=20&cursor=<opaque>
```

- `status` is optional; the allowed values are `waiting` and `playing`. Omitting it means all public rooms.
- `limit` is bounded to `1…50`; the default is `20`.
- Sort is fixed to `updatedAt DESC, roomCode ASC`; clients cannot supply a sort field.
- Response is `{ rooms: PublicRoom[], nextCursor: string | null }`.
- `PublicRoom` contains only public room metadata: `roomCode`, `status`, `mode`, `mapId`, `seated`, `maxPlayers`,
  `joinable`, `updatedAt`. It never contains tokens, account ids, guest ids, IPs or socket data.
- `joinable` is true only for `status=waiting` and `seated < maxPlayers`. A `playing` room is view-only because v1 has
  no spectator or late-join flow.
- The Worker may cache the response for at most 5 seconds. The browser fetches only on first open, filter change or an
  explicit refresh; it does not poll.
- Selecting a waiting room enters the existing join flow. The Room DO remains authoritative, so a stale `room-full`,
  `room-closed` or `not-found` answer is rendered inline and the list is refreshed.

The existing `isPrivate` field is the opt-out. Only rooms with `isPrivate=false` appear. The create-room surface gains a
localised public/private control so a host knows the room can be discovered; the room code remains valid for private
rooms.

## Decision

**Approved and applied** by the product owner on 2026-11-14. The public browser uses a D1-backed materialized directory,
loads only on open/filter/refresh, keeps the Room DO as the live authority, and adds one M story (`US-ROOM-013`) plus
`ADR-0008`. G1 and G2 are re-opened for re-signature.
