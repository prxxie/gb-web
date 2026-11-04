---
id: US-CORE-005
title: Play against a bot that uses the real rules
epic: EPIC-03-match-core
status: ready
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
| AC4 | a bot holding a Power up item | its best raw shot would miss by more than the item can fix | it uses the item and pays its delay (`TC-CORE-906`) |
| AC5 | the human player disconnects during a bot match | the turn clock expires | the bot continues and the match still finishes (`TC-PWA-064`) |
| AC6 | a finished bot match | it ends | it is recorded as `ranked = 0` and never enters the leaderboard (`TC-RANK-116`) |

## 4. Contract

```ts
export interface BotConfig { accuracy: number; itemUseChance: number; rngSeed: number }
export function botAction(state: MatchState, slot: number, cfg: BotConfig): { weaponSlot: 0|1|2; angle: number;
  force: number; item?: string; move?: { direction: number; run: boolean } };
```

## 5. Rules and edge cases

- The bot simulates the shot with the same core functions (no separate physics) and picks the closest landing.
- Difficulty comes from `accuracy` noise on the angle and force, never from cheating the delay queue.
- Seeded RNG lives in match state so a resumed match keeps decisions.

## 6. Implementation notes

- `packages/core/src/bot/{aim,policy}.ts`; consumes only `MatchState` and data tables.

## 7. Out of scope

Networked bots, bot-vs-bot spectating, difficulty selection UI (`OQ-20` keeps one level).

## 8. Test notes

`TC-CORE-902`, `TC-CORE-906`, `TC-PWA-064`, `TC-RANK-116`.
`Red first: tests/core/bot.test.ts::seeded_bot_is_deterministic`.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the engine rule is implemented in `packages/core/src` and covered by `packages/core/tests/` (ballistics, combat, match, snapshot, data, room, rating, camera)
