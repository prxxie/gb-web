---
id: US-NET-003
title: Restore every peer's state after a host migration
epic: EPIC-04-netplay
status: done
priority: P1
size: S
depends_on: [US-NET-002, US-ROOM-005]
open_questions: []
accepted_assumptions: [OQ-07]
refs: [02-reference/api/signaling.md, 02-reference/data/room-state.md, 01-overview/nonfunctional-requirements.md]
---

# US-NET-003 — Restore every peer's state after a host migration

## 1. Story

**As a** peer
**I want** the new host to take over from the last snapshot without a hitch
**so that** a host crash costs a second, not the match.

## 2. Context

`host_changed` carries `lastSnapshot`; the elected peer adopts it as its authority, rebuilds its channels to everyone
else, and continues the turn. Peers must accept the new host's `hostGeneration` and drop anything older.

| Topic | Reference |
|-------|-----------|
| `host_changed`, `hostGeneration` | [api/signaling.md](../../02-reference/api/signaling.md) |
| `lastSnapshot` cap and storage | [data/room-state.md](../../02-reference/data/room-state.md) |
| NFR-06 migration < 5 s | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A `host_changed` with a snapshot at `seq` 87 | It is received by the new host | Its state equals that snapshot, and its next published snapshot is `seq` 88 with the bumped `hostGeneration` (`TC-NET-908`, `TC-NET-903`) |
| AC2 | A peer | It receives `host_changed` | It switches its authority to the new host, ignores further snapshots from the old one, and rebuilds its data channel (`TC-NET-909`) |
| AC3 | A `host_changed` whose `lastSnapshot` is `null` (dropped before the first publish) | It is received | The new host starts a fresh snapshot at `seq` 1 rather than failing (`TC-NET-908`) |
| AC4 | A peer that was in `grace` during the migration | It reconnects | It receives the post-migration snapshot and sees the same turn and HP as the others (`TC-NET-909`, `TC-ROOM-184`) |
| AC5 | The migration | It completes on two devices | Play resumes within 5 s of the failure, measured from the host's socket close (`TC-NET-910`) |
| AC6 | An incoming snapshot with `hostGeneration` lower than the adopted one | It arrives | It is dropped and the state is unchanged (`TC-NET-908`, `TC-CORE-941`) |

## 4. Contract

```ts
export interface HostChanged { hostPlayerId: string; hostGeneration: number; lastSnapshot: Snapshot | null }
export interface Adoption { state: MatchState | null; hostGeneration: number; seq: number; adopted: boolean }
export function adoptHostChanged(prev: MatchState | null, message: HostChanged): Adoption;
export function restoreFromSnapshot(state: MatchState, snapshot: Snapshot): MatchState;  // core
export function resyncFromSnapshot(state, snapshot, generation): ResyncResult;            // drops a lower generation
```

`apps/web/src/net/migration.ts` holds the adoption; `resync.ts` and it share one fold (`restoreFromSnapshot`), so a
peer and a promoted host cannot disagree about what a snapshot means.

Order of operations on the new host: adopt state → bump `hostGeneration` → open channels → publish snapshot → resume
the turn clock with the remaining time from `turn.deadlineAt`.

## 5. Rules and edge cases

- The turn clock does not restart on migration; `deadlineAt` is preserved, so the active player keeps the time they had.
- If the active player was the old host, the turn is skipped rather than replayed (the new host has no input for it).
- The old host, when it reconnects, is a peer with no special rights (`US-ROOM-005` AC4).
- A second migration in the same match is allowed; `hostGeneration` keeps increasing.
- No event may be replayed from before the migration: the snapshot is the whole truth.

## 6. Implementation notes

- `apps/web/src/net/migration.ts` (`adoptHostChanged`), `packages/core/src/snapshot.ts` (`restoreFromSnapshot`). The page
keeps the live host in `hostPlayerId` and the role in `hosting`/`hostingRef`: the lobby plan is a photograph and never
changes, so it cannot answer "am I the host now?". The turn of a dead host is skipped by the existing authority
(`apps/web/src/net/host-clock.ts` skips an absent active slot), not replayed.
- The desync report compares `stateHash()` of the new host and each peer at the first snapshot after the migration.

## 7. Out of scope

- Election itself — [US-ROOM-005](../EPIC-02-rooms/US-ROOM-005-elect-a-new-host-when-the-host-leaves.md).
- Recording the match after a migration — [US-RANK-001](../EPIC-06-ranked/US-RANK-001-record-a-finished-match.md).

## 8. Test notes

`TC-NET-908`, `TC-NET-909` (web), `TC-NET-910` (manual, two devices), `TC-ROOM-184` (reconnect inside grace).

Red: `tests/web/migration-wiring.test.tsx` (TC-NET-909) — before `adoptHostChanged` existed the promoted peer
published nothing at all (the `broadcast` spy saw zero calls after `host_changed`), and the demoted host still applied its
own shot instead of sending an `input` frame (the `sendControlAll` spy saw zero calls).

## 9. Open questions

- **OQ-07** (accepted assumption) — inputs lost between the last snapshot and the drop are lost, not replayed.

<!-- delivery:2026-11-07 -->

## Delivery status — 2026-11-07

**done.** A host crash costs a second, not the match.

| AC | Evidence | State |
|----|----------|-------|
| AC1 | `apps/web/tests/migration.test.tsx::TC-NET-908` — the adopted state carries the snapshot's players and clock, and the next publish is `seq` 88 at the frame's generation; `apps/web/tests/migration-wiring.test.tsx::TC-NET-909` — the publish leaves on the mesh and the socket | met |
| AC2 | `TC-NET-909` — the promoted peer starts publishing, the demoted host stops and sends an `input`; `resyncFromSnapshot` discards a lower generation | met |
| AC3 | `TC-NET-908` — `lastSnapshot: null` restarts at `seq` 1 with the players it had | met |
| AC4 | `TC-NET-909` (the push the DO replays) plus `apps/worker/tests/room-election.test.ts::TC-ROOM-184` (a reconnect inside grace returns with its hp) | met |
| AC5 | `TC-NET-910` — manual, two devices, stopwatch from the socket close | **owed**: not run yet |
| AC6 | `TC-NET-908` — a snapshot from the generation just left is dropped; `packages/core/tests/snapshot.test.ts::TC-CORE-941` owns the core rule | met |

**What this pass changed.** `apps/web/src/net/migration.ts` (new) adopts `lastSnapshot`, restarts at `seq` 1 when there
is none, and always publishes one past the adopted `seq` — `acceptSnapshot` refuses anything not strictly newer.
`packages/core/src/snapshot.ts` gained `restoreFromSnapshot`, and `apps/web/src/net/resync.ts` now folds through it, so
a peer and a promoted host apply a snapshot the same way. `MatchPage` keeps the live host in `hostPlayerId` and the role
in `hosting`/`hostingRef`.

**Two defects this pass found.**
1. *Authority never moved.* The page read the host from the lobby plan (`plan.hostPlayerId`), which is a photograph: after
   an election the promoted peer still sent inputs to a dead host, and the demoted one kept simulating.
2. *The promotion's snapshot was ignored.* `host_changed` bumped the generation and rebuilt the mesh, but nobody read
   `lastSnapshot`, and nothing was published until the next turn tick — so every peer kept the dead host's numbers.

**Still open.** The two-device stopwatch run (`TC-NET-910`) is owed at UAT M2; a second migration in one match is
allowed by design (`hostGeneration` keeps climbing) and has no automated case.
