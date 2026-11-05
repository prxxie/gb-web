---
id: US-ROOM-005
title: Elect a new host within five seconds when the host disappears
epic: EPIC-02-rooms
status: ready
priority: P0
size: M
depends_on: [US-ROOM-004]
open_questions: []
accepted_assumptions: [OQ-07, OQ-30]
refs: [02-reference/api/signaling.md, 01-overview/nonfunctional-requirements.md, 02-reference/data/room-state.md]
---

# US-ROOM-005 — Elect a new host within five seconds when the host disappears

## 1. Story

**As a** player in a match
**I want** the game to continue when the host's phone dies
**so that** a three-minute match is not lost to someone's battery.

## 2. Context

The host is authoritative for physics and state ([ADR-0004](../../04-decisions/adr/ADR-0004-gameplay-topology-p2p.md)).
When its socket drops, the `Room` DO promotes the longest-connected connected peer, bumps `hostGeneration` and tells
everyone with the last snapshot. Migration must complete inside 5 s (`NFR-06`).

| Topic | Reference |
|-------|-----------|
| `host_changed`, election rule, close codes | [api/signaling.md](../../02-reference/api/signaling.md) |
| NFR-06, NFR-08 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| `hostGeneration` guard | [data/room-state.md](../../02-reference/data/room-state.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A host in `playing` | Its socket closes | The DO picks the connected member with the oldest `joinedAt` (excluding the host) and bumps `hostGeneration` by 1 (`TC-ROOM-048`) |
| AC2 | The promotion | It happens | Every member receives `host_changed {hostPlayerId, hostGeneration, lastSnapshot: <payload>}` and the new host starts sending snapshots with the bumped generation |
| AC3 | A failed migration | 5 s pass without a new host live | The DO retries with the next candidate once, then marks the room `abandoned` (`TC-ROOM-049`) |
| AC4 | The old host | It reconnects after migration | It returns as a plain peer with `role: "peer"`; it may not send `snapshot_push` and gets `error not-host` (`TC-NET-044`) |
| AC5 | The room in `lobby` | The host leaves | The earliest joiner is promoted and the lobby shows the new host badge; no match is interrupted (`TC-ROOM-149`) |
| AC6 | A migration end to end on two phones | The host app is force-quit mid-match | The remaining player is playable again within 5 s and the match reaches a winner (`TC-ROOM-182`) |
| AC7 | Two promotions in a row | The second host also drops | Election continues down the roster; `hostGeneration` increases once per promotion and never repeats |

## 4. Contract

`host_changed` (server → all members):

| Field | Type | Notes |
|-------|------|-------|
| `hostPlayerId` | string | New host's `playerId` |
| `hostGeneration` | integer | Monotonic, starts at 1 |
| `lastSnapshot` | object | The most recent snapshot the DO holds (≤ 8 KB), or `null` before the first one |

Every snapshot the new host sends carries `host_generation`; the DO and peers discard any snapshot whose generation is
lower than the current one.

## 5. Rules and edge cases

- The DO never simulates: it holds `lastSnapshot` only as a handover artefact, capped at 8 KB (`TC-ROOM-124`).
- A peer that was itself unmigrated (`grace`/`disconnected`) cannot be elected.
- Election is deterministic given `joinedAt` and `slot`; ties are broken by the lower slot.
- A host that is merely `grace` is **not** replaced until the 20 s window expires — this prevents a 2-second tunnel
  from stealing authority away from the player with the best state.
- Authority stays with the newly elected host for the rest of the match; the old host does not reclaim it.

## 6. Implementation notes

- `apps/worker/src/room/elect.ts`: `electHost(members, now): playerId | null`.
- Send `host_changed` **before** the 5 s budget is measured: the budget is measured from the drop detection (floor 1 s).
- The client switches its `GameSession` role and re-sends its own `host_generation` on the next snapshot.

## 7. Out of scope

- Anti-cheat beyond generation checks ([US-RANK-001](../EPIC-06-ranked/US-RANK-001-record-a-finished-match.md), `OQ-30`).
- Restoring the peer connections to the new host — [US-NET-003](../EPIC-04-netplay/US-NET-003-restore-state-after-migration.md).

## 8. Test notes

`TC-ROOM-048`, `TC-ROOM-049`, `TC-ROOM-124`, `TC-ROOM-149`, `TC-ROOM-182`; `TC-NET-044` covers the stale-host
rejection. Worker test drives `electHost` as a pure function plus a socket-level test for the broadcast. Red first:
`apps/worker/tests/room.test.ts::host_election_on_close`.

## 9. Open questions

- **OQ-07** (accepted assumption) — the new host adopts the old host's `lastSnapshot` without replaying lost inputs.
- **OQ-30** (accepted assumption) — a tampered host client is only caught by plausibility checks at result submission;
  this story does not attempt to verify simulation correctness mid-match.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** host election by `joinedAt`, `hostGeneration` and `host_changed` are implemented in `packages/core/src/room.ts` and `apps/worker/src/room-do.ts`; election is covered by `packages/core/tests/room.test.ts`
