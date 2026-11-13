---
id: US-BAL-006
title: Let the bot fire blind too
epic: EPIC-09-ballistics
status: ready
priority: P1
size: M
depends_on: [US-BAL-002, US-CORE-005]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md]
---

# US-BAL-006 — Let the bot fire blind too

## 1. Story

**As a** player firing into a screen I cannot see past

**I want** the bot to be under the same blindfold, with a miss rate that follows the difficulty

**so that** a match is decided by my calculation and not by a machine reading the state file.

## 2. Context

`US-CORE-005` gave the bot `botTurn(state, rng)`, which reads the whole `MatchState` — every opponent position, the full
terrain, the exact wind vector. That was fair while both duelists were on screen. Under `US-BAL-002` the player cannot see
past one màn, and a bot that solves the state exactly would out-shoot a human who is missing the same information, which is
neither hard nor fair — it is a cheat with extra steps.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | two match states that differ **only** outside the bot's window | `botTurn` is called | it returns the same input, bit for bit — the bot cannot use what a player could not see |
| AC2 | a target inside the window | the bot fires | it aims within the difficulty's error budget: `easy ±1.5 phần`, `normal ±0.75`, `hard ±0.30` of landing distance, drawn from the match seed |
| AC3 | a target outside the window | the bot fires | it estimates from the window's edge plus its memory of the last seen position, and the error budget is multiplied by 2 |
| AC4 | the previous shot's shell is still in the air, or the window is measuring | the bot's turn comes | it waits, exactly like a human client does, and never fires into a busy sky |
| AC5 | the same seed and the same difficulty | a match is replayed | the bot's shots are identical |

## 4. Contract

```ts
/** What a seat may know: built from the camera window, never from the raw state. */
export interface Senses {
  readonly window: CameraWindow;
  readonly self: MobileView;
  readonly wind: Wind;
  /** Opponents whose hull intersects the window; positions are the last seen, not the current. */
  readonly seen: readonly TargetView[];
  readonly seenAt: ReadonlyMap<number, number>;
}

export function sensesFor(state: MatchState, slot: number, window: CameraWindow, memory: BotMemory): Senses;
export function botTurn(senses: Senses, rng: Rng, difficulty: Difficulty): BotInput;
```

`bot.ts` loses its `MatchState` parameter; the page builds `Senses` from the same window the player sees.

## 5. Rules and edge cases

- Memory is per-seat, capped (one remembered position per opponent, timestamped), and cleared when the opponent's hull is
  seen again.
- A remembered position older than three of the bot's turns is treated as unknown, so it cannot camp on a stale reading.
- The difficulty's error budget applies to the **landing distance**, converted back to angle and bar through the solver, so a
  hard bot is not simply a bot with a smaller random angle.
- `easy` also mis-reads the wind by one band; `hard` reads it exactly.
- A bot with no seen target fires at the last impact site it remembers, or at the map's middle if it has none.

## 6. Implementation notes

- `packages/core/src/bot.ts` is the only file that changes its signature; `useBotOpponent` builds `Senses` from the camera
  window the scene is drawing.
- The information-equivalence test (AC1) is the important one: build two states, mutate everything outside the window, assert
  equal inputs. It is cheap and it catches any future leak.
- The error budget uses the same `rng` stream as everything else, so replays stay deterministic.

## 7. Out of scope

- Bot personalities, chat behaviour, or team strategy.
- A difficulty selector UI beyond what already exists.

## 8. Test notes

Unit: information equivalence for position, terrain and wind outside the window; the three error budgets over 100 seeds;
memory expiry; determinism. Integration: a full bot match on the widest spawn gap ends in a bounded number of turns.
Planned cases `TC-BAL-137`–`TC-BAL-146`.

## 9. Open questions

None.
