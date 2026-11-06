---
id: US-CORE-004
title: Encode and apply snapshots
epic: EPIC-03-match-core
status: done
priority: P0
size: M
depends_on: [US-CORE-002, US-CORE-003]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md, 02-reference/data/room-state.md]
---

# US-CORE-004 — Encode and apply snapshots

## 1. Story

As a peer, I want the host's state to arrive compactly and be applied exactly, so that what I see matches what the host
simulated.

## 2. Context

The snapshot now carries more than positions: HP, shield, energy, the delay queue, the loadout, the active weapon and the
mode's extra state (Jewel). It must still fit `NFR-04` (≤800 B at eight players) and stay replace-only.

| Topic | Reference |
|---|---|
| Snapshot payload | [`02-reference/api/signaling.md`](../../02-reference/api/signaling.md) |
| Room state | [`02-reference/data/room-state.md`](../../02-reference/data/room-state.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | an eight-player Jewel state | it is encoded | the payload is ≤800 B and decodes to an identical object (`TC-CORE-041`, `TC-CORE-040`) |
| AC2 | two encodes of the same state | they are compared | bytes are identical (stable key order, rounded numbers) (`TC-CORE-940`) |
| AC3 | a peer receives `seq 41` after `seq 39` | it applies both | older state never overwrites newer and `seq 40` is not required (`TC-CORE-941`) |
| AC4 | a snapshot claiming `hostGeneration 2` while the room is at 3 | it is applied | it is rejected (`TC-CORE-941`) |
| AC5 | a decoded snapshot | it is applied | shields, energy, delay queue, weapon slot and mode state all match the host (`TC-CORE-942`) |
| AC6 | a payload over 8 KB | it is received | it is dropped with `snapshot-too-large` and the sender is warned (`TC-CORE-042`, `TC-ROOM-124`) |

## 4. Contract

```ts
export interface Snapshot {
  seq: number; hostGeneration: number; rulesetVersion: string; mode: ModeId;
  turn: { activeSlot: number; number: number; deadlineAt: number; queue: number[]; delays: number[] };
  players: Array<{ slot: number; hp: number; shield: number; energy: number; x: number; y: number;
                   facing: 1 | -1; eliminated: boolean; weaponSlot: 0 | 1 | 2; items: number[] }>;
  projectiles: Array<{ id: number; x: number; y: number; cls: string }>;
  modeState?: { jewels?: Array<{ x: number; y: number; carriedBy: number | null }>; score?: [number, number];
                activeTeam?: 'A' | 'B' };
  wind: { x: number; y: number };
}
export function encodeSnapshot(s: Snapshot): Uint8Array;
export function decodeSnapshot(b: Uint8Array): Snapshot;
export function applySnapshot(cur: MatchState, s: Snapshot): MatchState;
```

## 5. Rules and edge cases

- Positions quantised to 0.1, `hp`/`shield`/`energy` as integers, `queue`/`delays` as 16-bit, items as bit flags — that is
  what keeps eight players under 800 B (`TC-CORE-040`).
- `rulesetVersion` mismatch ⇒ the match is unranked, not broken (`TC-RANK-110`).
- Reject, never patch: an invalid snapshot is dropped whole.

## 6. Implementation notes

- `packages/core/src/net/snapshot.ts`; a hand-rolled encoder (no JSON) so the budget is checkable in a test.

## 7. Out of scope

Delta compression (`OQ-32`), rollback netcode (`OQ-32`).

## 8. Test notes

`TC-CORE-040`, `TC-CORE-041`, `TC-CORE-042`, `TC-CORE-940`, `TC-CORE-941`, `TC-CORE-942`, `TC-ROOM-124`.
Red: `packages/core/tests/snapshot.test.ts` — `TC-CORE-940` first failed on `expect(twice.turn.activeSlot)` because
`applySnapshot` patches only the mutable half of the state and the turn rides in the snapshot itself; the case now asserts
that split.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/snapshot.test.ts` — `TC-CORE-040` (round trip, scores/jewels/ruleset),
`TC-CORE-041` (≤ 800 bytes, mask only on a carve, under the 8 KB cap), `TC-CORE-042` (hard limit),
`TC-CORE-940` (two encodes byte-identical, second apply a no-op), `TC-CORE-941` (`seq 41` after `39`, stale `seq` and
older `hostGeneration` refused), `TC-CORE-942` (applied snapshot matches the host: shields, energy, delay queue, weapon
slot, scores, mode), plus `apps/worker/tests/room-host.test.ts` `TC-ROOM-124` for the 8 KB socket rejection.

The AC4 wording says a stale generation is "rejected **and counted**"; only the refusal exists — `acceptSnapshot` returns a
boolean and nothing increments a counter. Recorded as prose here rather than quietly reworded; the counter belongs with
`US-NET-003`'s observability.
