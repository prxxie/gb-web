---
id: US-CORE-015
title: Re-roll the weather every round
epic: EPIC-03-match-core
status: done
priority: P0
size: S
depends_on: [US-CORE-002]
open_questions: []
accepted_assumptions: [OQ-41]
refs: [02-reference/gameplay/tunables.md, 02-reference/api/signaling.md, 02-reference/data/room-state.md]
---

# US-CORE-015 — Re-roll the weather every round

## 1. Story

**As a** player
**I want** the wind to change once per round and be drawn as a magnitude on a 12-sector dial
**so that** I can read it at a glance and correct a shot by a known amount instead of guessing.

## 2. Context

GunBound's wind is a magnitude plus a direction, and it changes between rounds — not every turn. v1 keeps that: the wind
is rolled when the queue wraps (every player has acted once), then held constant for the whole round, so it is a planning
constant a player can compute against. The dial has 12 ticks of 30°, which is the resolution the client asked for
(`OQ-41`).

| Topic | Reference |
|---|---|
| Roll rules, ranges and announcement | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 1.3 |
| `weather` in `RoomState` and in the snapshot | [`02-reference/data/room-state.md`](../../02-reference/data/room-state.md), [`02-reference/api/signaling.md`](../../02-reference/api/signaling.md) |
| Wind in the integrator | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 1.1 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a match that has just started (`turn.round = 0`) | `start_match` runs | `weather` is rolled once and broadcast: `magnitude` an integer `0…26`, `sector` an integer `0…11`, `directionDeg = sector × 30` (`TC-CORE-926`) |
| AC2 | a round in progress | three of four players have acted, then the fourth | the wind does **not** change; `weather.rolledAtRound` still equals `turn.round` (`TC-CORE-926`) |
| AC3 | the queue wraps to the next round | `turn.round` increments | exactly one new roll happens, `rolledAtRound` follows, and a `weather` message goes out on `control` before the first snapshot of the round (`TC-CORE-926`) |
| AC4 | the same match `seed` and round number | the roll is repeated in a replay | the same `magnitude` and `sector` are produced — no `Math.random()` in `core` (`NFR-28`, `TC-CORE-926`) |
| AC5 | `magnitude = 0` | the round starts | it is a legal roll: the dial shows a hollow arrow, the integrator applies no wind term at all (`TC-MATCH-923`) |
| AC6 | `magnitude = 26`, `sector = 0` | a `mbl-01` shot is fired at 45°, force 98 | the landing point moves ~129 units — one ruler division — and the sign follows the sector (`TC-CORE-023`) |
| AC7 | a `weather` message arrives out of order (older `rolledAtRound`) | it is received | it is dropped; the newer `rolledAtRound` always wins (`TC-CORE-926`) |
| AC8 | an 8-player snapshot taken mid-round | it is encoded | it carries `weather` and `turn.round` and still fits 800 B (`TC-CORE-041`, `TC-CORE-942`) |

## 4. Contract

```ts
export interface Wind { magnitude: number; directionDeg: number; sector: number } // 0–26 · ×30 · 0–11
export interface Weather { wind: Wind; rolledAtRound: number }

export function rollWeather(rng: Rng): Wind;                    // int(0,26) and int(0,11)
export function weatherFor(seed: number, round: number): Weather; // deterministic, no Math.random
```

`tunables.json` carries `windMagnitude: {min: 0, max: 26}`, `windSectors: 12`, `weatherRerollPerRound: true`.

## 5. Rules and edge cases

- One roll per round **per match**, performed by the host and confirmed by the DO's `match_started` state; a migration
  must not re-roll (the snapshot carries the current `weather`).
- `directionDeg` is always a multiple of 30 — the display never shows a free angle, so two players reading the same dial
  mean the same thing.
- The roll is part of the deterministic state: it draws from the match RNG **after** the round counter increments, so the
  sequence is stable and replayable.
- The 11 map gimmicks may override the plain roll (Force, Gust, Change Wind…); this story owns the plain roll, the
  gimmick interaction lives in `US-CORE-012`.

## 6. Implementation notes

- `packages/core/src/weather.ts` (`rollWeather`, `weatherFor`, `windVector`), unit-tested at the RNG boundary;
  `apps/worker/src/room.ts` re-broadcasts on the round edge; `apps/web/src/game/hud/WindDial.ts` renders it
  (`US-MATCH-003`).

## 7. Out of scope

- Rain, fog or other visual weather; per-turn wind; gimmick overrides.

## 8. Test notes

`TC-CORE-926` (roll, round boundary, replay determinism, `m = 0`), `TC-CORE-023` (drift and vertical term),
`TC-MATCH-923` (dial rendering), `TC-CORE-041` (snapshot budget with `weather`).
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

## 9. Open questions

- **OQ-41** (answered) — magnitude 0–26, 12 sectors of 30°, re-rolled once per round.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/weather.test.ts` — `TC-CORE-926` (a fresh match rolls once inside the documented ranges,
the wind is constant inside a round, the queue wrap re-rolls exactly once, the same seed replays the same sequence, and an
out-of-order `weather` frame never wins), `TC-CORE-023` (the 26-sector wind term moves a `mbl-01` 45°/98 shot by one
ruler division), `TC-MATCH-923` (magnitude 0 is a legal calm roll and adds no wind term), `TC-CORE-041` (the mask-less
800-byte budget the weather rides in).

AC7 cited `TC-NET-004`, which does not exist anywhere in the tree — the assertion it meant is the out-of-order
`weather` case inside `TC-CORE-926`. AC8 cited `TC-CORE-041`, which is the size budget: the snapshot carries `weather`
and `turn.round`, asserted by `TC-CORE-942`.

This pass added `TC-CORE-960` (a 26/0 wind moves the landing point about one ruler division); `TC-CORE-926` and `TC-CORE-928` cover the rest.
