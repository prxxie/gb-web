---
id: US-BAL-006
title: Let the bot fire blind too
epic: EPIC-09-ballistics
status: done
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

**Red:** `packages/core/tests/senses.test.ts` and `packages/core/tests/bot.test.ts`.

First red run, by case: the terrain clip in `TC-BAL-139` (`expected […] to deeply equal […]`), the map-middle fallback in
`TC-BAL-145` (`expected 188.5999999999999 to be less than or equal to 152` — the shot measured against the true wind
instead of the calm one a `normal` bot reads), and the old 0.25-bar grid assertion in `TC-CORE-946`
(`expected false to be true`). Before `senses.ts` existed, `packages/core/tests/bot.test.ts` failed to import
`../src/senses.js` at all, which is red for `TC-BAL-140` in the only way it can be.

Shipped as `TC-BAL-139`–`TC-BAL-146` and `TC-BAL-148` (no `147`: the weapon-slot case lives in the migrated
`TC-CORE-902`), in `packages/core/tests/senses.test.ts` (9 cases) and `packages/core/tests/bot.test.ts` (16 cases).

## 9. Open questions

None.

## Delivery status — 2026-11-14

**done.** `packages/core/src/senses.ts` holds `Senses`/`TargetView`/`MobileView`/`BotMemory`, `sensesFor`, and
`windowForSeat`, which frames one seat's own screen; `sensesFor` reads that window, writes that seat's memory (one entry
per opponent, `REMEMBERED_TURNS = 3` of the seat's own turns) and clips the terrain to the window. `bot.ts` reads `Senses`
only and lost its `MatchState` parameter — `botShot`/`botItemUse`/`botTurn` take `(senses, rng, difficulty, options)`,
`botTurn` returns `BotInput` (`[]` = wait, AC4), and `botTurnPlan` is gone. `Difficulty`/`DIFFICULTY_RULES` (`easy` 1.5
phần + one wind band, `normal` 0.75, `hard` 0.3) carry the budget, drawn as a landing distance and converted back through
the solver's grid plus five refinement passes; `readWind` is the mis-read. `useBotOpponent` builds the seat's `Senses`
from `windowForSeat` — the window the bot's own camera would frame, never the one the human is drawing — keeps one
`BotMemory` per match, and looks again shortly when the window is still measuring. `packages/core/src/index.ts` exports
`senses.js`.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (139 files / 1178 cases; the only red is the pre-existing
`apps/web/tests/shell.test.tsx > TC-FND-131`, which fails identically on the clean tree — React Router's `RequestInit`
against this Node's `AbortSignal`), `pnpm build`, `pnpm budget`, and `TC-BAL-139`–`TC-BAL-148` in
`docs/05-quality/test-cases.md`.

Five deviations, recorded rather than papered over.

1. § 8's integration test — "a full bot match on the widest spawn gap ends in a bounded number of turns" — cannot pass
   under § 5. The spawn gap is 1,640 u (`TC-BAL-128`), one screen is 800 u, and a solo match ends only on elimination
   (`checkEnd`, no turn cap), while § 5 sends a bot that has never seen a hull to the map's middle: an idle human at the
   spawn and a blind bot can trade turns forever, by construction. `TC-BAL-148` proves both halves where the arithmetic
   allows them: at the widest gap, twelve states differing only outside the window produce the same shot bit for bit (and
   the same test shows a changed wind does move the shot, so the equality is not vacuous), and a match whose two hulls are
   inside one screen ends with a winner inside the 240-turn cap.
2. `TC-CORE-946` is migrated for the same reason: its "the match still finishes" half now runs with the two hulls inside
   one screen, and its `bar` is no longer asserted onto the 0.25 grid — the solver's bar is continuous, so the case asserts
   the legal range and the wire's three decimals instead. `TC-CORE-902`/`TC-CORE-927` keep their assertions and only
   changed call shape.
3. `Senses` is a superset of § 4: it also carries `terrain`, `mapId`, `turn`, `measuring` and `lastImpact`, which the bot
   needs and cannot reconstruct from the six fields printed. `seen` is spelled out as `TargetView[]` with
   `fromMemory`/`rememberedTurn`, and the last **seen** health is what it carries — not the live one.
4. § 4 says the page builds `Senses` "from the same window the player sees". Taken literally the bot would inherit the
   human's camera — its framing nudge (`scene.ts`), their pan and pinch, and the frame frozen on a shell ride — which is
   both a leak of out-of-window state and a way to make the replay diverge (`AC1`, `AC5`). The seat's window is therefore
   `windowForSeat(state, slot)`: the same `windowOnOneScreen` law the renderer uses, framed on the bot's own hull.
5. AC4's "never fires into a busy sky" is enforced by the client, not by `Senses`: the engine resolves a shot inside
   `applyInput` and never leaves a projectile in `state.projectiles`, so a `busy` flag could not fire in production. The
   bot waits out the flight through `shotWaitMs` (`apps/web/src/game/flight.ts`, tested as `TC-MATCH-960`) plus its own
   thinking time, and `Senses`/`botTurn` gate on the window measuring, which is state the engine does keep.

Review rounds (`cpt-review`, fresh context, twice — the first returned REQUEST CHANGES):

- Two Criticals, both in the app's turn loop: the bot read the *player's* camera window (the scene's framing nudge, the
  human's pan and pinch, and the frame frozen on a shell ride — a leak of out-of-window state and a way to make the replay
  diverge), and an empty `botTurn` result (`[]`, waiting) stalled the seat for the rest of its 20 s clock. The window is
  now `windowForSeat`, and a wait is retried after 250 ms, reset per turn.
- Mediums fixed: the memory span was counted in match turns rather than the seat's own; `TC-BAL-142` could not see the
  difference between one and two budgets; `TC-BAL-148` compared two states that differed in nothing it could read; `AC4`'s
  "busy sky" was dead (the engine keeps no projectile — the client's `shotWaitMs` is the lock); the impact memory was
  written even when the engine refused the shot, and its restore was taken after the write; `Senses.seq` was out-of-window
  state the caller overwrites anyway; the terrain edge kept a sample from outside the window.
- The loop now has its own cases — `apps/web/tests/bot-opponent.test.tsx` (6 cases): the thinking delay, one commit under
  `StrictMode`, nothing on the human's turn and nothing after the end, and the memory pair (a rejected shot leaves no
  landing, an accepted one records it), which fails if the restore is removed.
- Declined, with reasons: no wall-clock budget assertion in `TC-CORE-902` (`.agents/rules/05-testing.md` § 48 forbids a
  real clock in a test; `NFR-04` carries the phone measurement), and no `TUNABLES` row for the three difficulty budgets (a
  bot match is `ranked = 0` per `US-CORE-005` AC6, so moving `rulesetVersion` for a bot-only knob would break the
  versioning law; the numbers live in `DIFFICULTY_RULES`). `TC-BAL-143` pins the invariant that a seat's own window never
  measures, so the retry branch is defensive rather than untested.

`NFR-03` moved with it: `scripts/bundle-budget.json` now records `match` 394 and `total` 553 (measured 393.3 and
552.2) — the seat's `Senses`, the three budgets and the landing-distance solver, about 1.15 KiB gzip, with the old
noise config, `botTurnPlan` and the 2°/0.25-only grid removed in the same change. The note in that file says what
came out first and why the rest cannot.

6. AC3 says a hull outside the window is estimated "from the window's edge". The implementation uses the seat's own
   memory instead — the last place it saw the hull, with the budget doubled — which is what § 5 mandates for that same
   case; the window's edge is where the hull *left* the screen, so the two coincide only when it walked off sideways on
   one flat line, and the memory is the stronger reading of the two. `TC-BAL-142` pins both halves: the remembered aim
   stays inside twice the budget (all 60 seeds within 300 units of the remembered x) and moves away from the hull the
   seat can now see at 600.

`US-CORE-005` § 4's `BotConfig`/`botShot(state, …)`/`botTurnPlan` contract is superseded by this story's § 4.
