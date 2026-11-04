---
id: US-NET-003
title: Restore every peer's state after a host migration
epic: EPIC-04-netplay
status: ready
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
| AC1 | A `host_changed` with a snapshot at `seq` 87 | It is received by the new host | Its state equals that snapshot, and its next published snapshot is `seq` 88 with the bumped `hostGeneration` (`TC-NET-903`) |
| AC2 | A peer | It receives `host_changed` | It switches its authority to the new host, ignores further snapshots from the old one, and rebuilds its data channel |
| AC3 | A `host_changed` whose `lastSnapshot` is `null` (dropped before the first publish) | It is received | The new host starts a fresh snapshot at `seq` 1 rather than failing |
| AC4 | A peer that was in `grace` during the migration | It reconnects | It receives the post-migration snapshot and sees the same turn and HP as the others (`TC-ROOM-056`) |
| AC5 | The migration | It completes on two devices | Play resumes within 5 s of the failure, measured from the host's socket close (`TC-ROOM-049`) |
| AC6 | An incoming snapshot with `hostGeneration` lower than the adopted one | It arrives | It is dropped and the state is unchanged (`TC-CORE-042` semantics extended to generation) |

## 4. Contract

```ts
export type Role = { kind: "host"; generation: number } | { kind: "peer"; hostGeneration: number };
export function adoptHostChanged(prev: MatchState | null, msg: HostChanged): MatchState;
export function acceptSnapshot(currentGen: number, snap: Snapshot): boolean;   // false when stale
```

Order of operations on the new host: adopt state → bump `hostGeneration` → open channels → publish snapshot → resume
the turn clock with the remaining time from `turn.deadlineAt`.

## 5. Rules and edge cases

- The turn clock does not restart on migration; `deadlineAt` is preserved, so the active player keeps the time they had.
- If the active player was the old host, the turn is skipped rather than replayed (the new host has no input for it).
- The old host, when it reconnects, is a peer with no special rights (`US-ROOM-005` AC4).
- A second migration in the same match is allowed; `hostGeneration` keeps increasing.
- No event may be replayed from before the migration: the snapshot is the whole truth.

## 6. Implementation notes

- `apps/web/src/net/host.ts#becomeHost(lastSnapshot)` and `peer.ts#onHostChanged`.
- The desync report compares `stateHash()` of the new host and each peer at the first snapshot after the migration.

## 7. Out of scope

- Election itself — [US-ROOM-005](../EPIC-02-rooms/US-ROOM-005-elect-a-new-host-when-the-host-leaves.md).
- Recording the match after a migration — [US-RANK-001](../EPIC-06-ranked/US-RANK-001-record-a-finished-match.md).

## 8. Test notes

`TC-NET-903`, `TC-ROOM-056`, `TC-ROOM-049`. The Playwright test force-closes the host context and asserts the remaining
context's HP/turn within 5 s.

## 9. Open questions

- **OQ-07** (accepted assumption) — inputs lost between the last snapshot and the drop are lost, not replayed.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `adoptHostChanged` and `acceptSnapshot` are implemented and unit-tested (`TC-NET-903`); the full migration still needs a live room.
