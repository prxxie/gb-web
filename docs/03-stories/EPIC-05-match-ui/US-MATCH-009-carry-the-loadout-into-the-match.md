---
id: US-MATCH-009
title: fix — carry the picked loadout into the match
epic: EPIC-05-match-ui
status: done
priority: P1
size: S
depends_on: [US-ROOM-007, US-MATCH-005]
open_questions: []
accepted_assumptions: []
refs: [02-reference/data/items.md, 02-reference/screens/lobby.md, 02-reference/screens/match.md]
---

# US-MATCH-009 — fix: carry the picked loadout into the match

## 1. Story

As a player who picked up to eleven items in the lobby, I want those items to be in the tray when the match starts, so
that the loadout I chose is a decision I actually play with.

## 2. Context

`US-ROOM-007` AC2 makes `match_started` carry the loadouts, and the room does exactly that
(`apps/worker/src/room-do.ts` → `assignments[].loadout`). The engine is ready for it too: `Seat.loadout` is documented
in `packages/core/src/match.ts` and `seatsToPlayers` turns it into `PlayerState.items`.

The two places that build a match dropped it:

- `apps/web/src/routes/LobbyPage.tsx` built the seats from `message.room.members` — the public member list, which has no
  loadout — instead of from `message.assignments`, which does.
- `apps/web/src/lib/plan.ts` → `botMatchPlan()` never set a loadout at all, so a practice match had nothing either.

The visible result: the six-slot tray and the item wheel built in `US-MATCH-005`/`US-MATCH-006` opened on an empty state
in **every** match, and no item rule could be exercised without a room. This is a gap no shipped story claimed to cover —
`US-ROOM-007` AC2 is about the *message*, and it was true.

| Topic | Reference |
|---|---|
| The eleven items, their delay cost and effects | [`02-reference/data/items.md`](../../02-reference/data/items.md) |
| The lobby's loadout picker and the room frame | [`02-reference/screens/lobby.md`](../../02-reference/screens/lobby.md) |
| The in-match tray and the wheel | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |

## 3. Acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC1 | A room where two players picked different loadouts | The host starts the match | Each seat carries **its own** pick, as a `Record<itemId, qty>`, joined to the member only for `displayName` |
| AC2 | Any match started from a plan | `createMatch` runs | Every player's `items` equals their seat's `loadout`, and no id the table does not know survives |
| AC3 | A practice match | It starts | Both seats carry the same starter kit, inside `LOADOUT_CAP`, so the tray is never empty and the bot can spend items too |

## 4. Contract

- The wire is unchanged: `match_started.assignments[].loadout` already carries `LoadoutEntry[]` (`{ id, qty }`), and
  `Seat.loadout` is the quantity map `seatsToPlayers` reads. The fix is a mapping, not a protocol change.
- `PRACTICE_LOADOUT` (`apps/web/src/lib/plan.ts`) is a display-side default for a match that has no room: the items whose
  effect changes a shot — a heal, a wind flip, a damage buff, a terrain carve and a mobility item.

## 5. Rules and edge cases

- A seat with no assignment (an old room, a member the room did not assign) falls back to the member's own fields and an
  empty loadout, rather than dropping the seat.
- `displayName` lives only on the member, so the seat is joined by `playerId`; a name must not be lost to the new source.
- Quantities are floored and non-positive ones dropped by `seatsToPlayers` — the lobby cap (`LOADOUT_CAP`, eleven) is
  enforced by the room, not here.
- A practice kit is symmetric on purpose: the bot spends items from the same table, so the practice is not a one-sided
  tutorial.

## 6. Implementation notes

- `apps/web/src/routes/LobbyPage.tsx` — seats built from `message.assignments`, joined to `room.members` by `playerId`.
- `apps/web/src/lib/plan.ts` — `PRACTICE_LOADOUT` and both practice seats.
- No change to `apps/web/src/routes/MatchPage.tsx`: it already reads `localPlayer.items`, which is the point.

## 7. Out of scope

- The lobby's picker UI and the eleven-item cap (`US-ROOM-007`).
- Item effects themselves (`US-CORE-011`, `US-MATCH-005` AC5).

## 8. Test notes

Red: `apps/web/tests/match-loadout.test.tsx` — `TC-MATCH-954` and `TC-ROOM-714` were written against the shipped code:
`createMatch` over a practice plan gave every player `items: {}`, and the plan the lobby wrote had no `loadout` on any
seat, so both cases failed for the reason the story exists.

- `apps/web/tests/match-loadout.test.tsx` — `TC-MATCH-954` (practice kit is legal and arrives as `PlayerState.items`) and
  `TC-ROOM-714` (`match_started.assignments[].loadout` becomes the seat's loadout, names still joined, and the match that
  starts from the written plan has the items).

## 9. Open questions

None. `OQ-05` already settles that guests are unranked, not unequipped.

## Delivery status — 2026-11-09

| AC | Evidence |
|---|---|
| AC1 | `TC-ROOM-714` — two assignments with different loadouts land as `{ "itm-dual": 2 }` and `{ "itm-power-up": 1, "itm-teleport": 3 }`, with the display names still joined from the members |
| AC2 | `TC-MATCH-954` — `createMatch` over the practice plan yields `player.items === seat.loadout` for both seats; the same case asserts every id is one the table knows |
| AC3 | `TC-MATCH-954` — both practice seats carry `PRACTICE_LOADOUT`, its total is inside `LOADOUT_CAP`, and it is non-empty |
