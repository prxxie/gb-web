---
id: US-CORE-005
title: Play against a bot that uses the real rules
epic: EPIC-03-match-core
status: done
priority: P1
size: M
depends_on: [US-CORE-003, US-CORE-004, US-CORE-007]
open_questions: []
accepted_assumptions: [OQ-19, OQ-37]
refs: [02-reference/gameplay/tunables.md, 02-reference/data/mobiles.md, 02-reference/data/room-state.md]
---

# US-CORE-005 — Play against a bot that uses the real rules

## 1. Story

As a player without a connection, I want to play a bot that aims, picks weapons and spends items, so offline practice
feels like the real match.

## 2. Context

Offline practice is part of the approved scope (`OQ-20`, spec FR-07). With the delay queue and three weapon slots, a
naive bot would ignore half the game, so the bot must choose a weapon and occasionally an item, and must pay delay like
everyone else.

| Topic | Reference |
|---|---|
| Mobile stats and weapons | [`02-reference/data/mobiles.md`](../../02-reference/data/mobiles.md) |
| Items | [`02-reference/data/items.md`](../../02-reference/data/items.md) |
| Turn queue | [`02-reference/gameplay/tunables.md`](../../02-reference/gameplay/tunables.md) § 3 |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | a bot turn with a clear line of fire | the bot acts | it fires within 3 s of wall-clock with angle and force inside the mobile's envelope (`TC-CORE-902`) |
| AC2 | the same seed | two bot matches are run | every bot decision is identical (`TC-CORE-902`) |
| AC3 | a bot with three weapons | it selects | the chosen `weaponSlot` is the one with the best simulated outcome among the three (`TC-CORE-902`) |
| AC4 | a bot holding a Power up item | its best raw shot would miss by more than the item can fix | it uses the item and pays its delay (`TC-CORE-927`) |
| AC5 | the human player disconnects during a bot match | the turn clock expires | the bot continues and the match still finishes (`TC-CORE-946`) |
| AC6 | a finished bot match | it ends | it is recorded as `ranked = 0` and never enters the leaderboard (`TC-RANK-116`) |

## 4. Contract

```ts
export interface BotConfig {
  angleNoiseDeg: number;   // aim error drawn per shot; 0 makes the bot perfect
  powerNoise: number;      // power error as a fraction of max power
  superShotChance: number; // reaches for slot 2 when the target is nearly finished
  itemUseChance: number;   // spends an item when the shot is out of reach
}
export function botShot(state: MatchState, slot: number, rng: Rng, config = DEFAULT_BOT): FireInput | null;
export function botItemUse(state: MatchState, slot: number, rng: Rng, config = DEFAULT_BOT): ItemInput | null;
export function botTurnPlan(state: MatchState, rng: Rng, config = DEFAULT_BOT): readonly (ItemInput | FireInput)[];
```

The RNG is **injected**, not seeded inside the config: the caller owns the seed so a replay (`NFR-28`)
reproduces the bot exactly, and a test can pass a fixed `createRng(seed)`. An item is its own input
(`applyItem` charges its delay), so the bot returns the item first and the shot second rather than
hanging an `item` field on a `FireInput` the engine would ignore.

## 5. Rules and edge cases

- The bot simulates the shot with the same core functions (no separate physics) and picks the closest landing.
- Difficulty comes from `accuracy` noise on the angle and force, never from cheating the delay queue.
- Seeded RNG lives in match state so a resumed match keeps decisions.

## 6. Implementation notes

- `packages/core/src/bot/{aim,policy}.ts`; consumes only `MatchState` and data tables.

## 7. Out of scope

Networked bots, bot-vs-bot spectating, difficulty selection UI (`OQ-20` keeps one level).

## 8. Test notes

`TC-CORE-902`, `TC-CORE-927`, `TC-PWA-064`, `TC-RANK-116`.
Red: none — the rule was already implemented and green; this pass added the cases the ACs cited and corrected the citations that pointed at another story's case (see the delivery note at the end of this file).

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** `packages/core/tests/bot.test.ts` — `TC-CORE-902` (a legal aim inside the envelope within 3 s, the same seed
reproducing every decision, the best of three weapon slots), `TC-CORE-927` (a bot spends a Power up rather than settle),
`TC-CORE-946` (a human whose 20 s clock runs out hands the turn over and the bot fires without that socket); the ranking
half is `packages/core/tests/rating.test.ts` `TC-RANK-116` ("refuses a bot, an abandoned match or a stale ruleset").

AC6 says a finished bot match is "recorded as `ranked = 0`", which cannot happen: a bot match ends inside the room and
never reaches `POST /matches` (`apps/worker/src/routes/matches.ts:295-298` says so in a comment and hard-codes
`hasBot: false`). What the test proves is that `isRanked` refuses a bot and that nothing submits the match — the wording
in the AC is stronger than the mechanism.

This pass added `TC-CORE-947` (a bot match is never ranked) beside the existing `TC-CORE-902`/`927`/`946`.
