---
id: US-BAL-009
title: Split a shot on the reference milestones
epic: EPIC-09-ballistics
status: ready
priority: P2
size: M
depends_on: [US-BAL-004, US-CORE-009]
open_questions: []
accepted_assumptions: []
refs: [02-reference/data/items.md]
---

# US-BAL-009 — Split a shot on the reference milestones

## 1. Story

**As a** player with a double shot in hand

**I want** to decide when the second shell leaves, on the timings the game is known for

**so that** a dual shot is a skill I practise rather than a button that fires twice.

## 2. Context

`US-CORE-009` gives `itm-dual` two shots fired back to back from the same weapon, and the queue delay is a turn-order cost,
not a timing. The reference carries a table of split milestones (0.467 / 0.660 / 0.910 / 1.160 / 1.450 / 1.840 s, and the
time bomb and connection beyond them) that players learned by ear. This story can ship last: nothing else depends on it.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a dual shot is armed | the player picks a milestone | the second shell leaves the muzzle at that milestone (±60 ms) after the first |
| AC2 | the milestones | the HUD is read | the current milestone is shown with its label and the remaining time to it; the list is reachable with the keyboard and announced once |
| AC3 | a milestone longer than the first shell's flight | it is picked | it is refused with a reason, since the sky would be empty and the split meaningless |
| AC4 | no milestone picked | a dual shot is fired | the behaviour is unchanged from `US-CORE-009`: second shot immediately |
| AC5 | a milestone shot | it is replayed | both shells land where the record says, bit for bit |

## 4. Contract

```ts
export interface SplitMilestone { readonly id: string; readonly atMs: number; readonly label: string; }
export const SPLIT_MILESTONES: readonly SplitMilestone[]; // 467 … 2520
export function splitDelayFor(id: string | null): number;  // 0 when null
```

## 5. Rules and edge cases

- The milestone is a delay on the *second* shell only; the turn does not end between them, and the shot hand-over
  (`US-MATCH-012`) treats the pair as one turn's sky.
- Picking a milestone costs the same queue delay as the item already does; no new cost.
- A milestone chosen with a single-shot item is ignored, not an error.
- The last milestone that fits inside the first shell's flight is enabled, later ones are visibly disabled with the reason.

## 6. Implementation notes

- The table lives in `packages/core/src/data/` next to the items; the HUD renders it from data, never from literals.
- The scene's `spawnShell` already accepts a start time; the delay is a second call, not a new animation path.

## 7. Out of scope

- The time bomb and connection effects beyond their timing (they need their own item and damage rules).
- Any change to what a dual shot does on impact.

## 8. Test notes

Unit: the delay mapping, the refusal above the flight, the no-milestone default. Integration: a dual shot with each
milestone produces two shells at the recorded gap. Planned cases `TC-BAL-159`–`TC-BAL-166`.

## 9. Open questions

None.
