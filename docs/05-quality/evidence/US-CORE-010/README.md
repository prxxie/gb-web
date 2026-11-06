# Evidence — `US-CORE-010` (the four modes)

`US-CORE-010` ended with one open criterion, AC6: "the result screen names the mode and the win condition used".
The screen now does, and this note records how to reproduce both halves.

## Automated

| Criterion | Case | What it proves |
|-----------|------|----------------|
| AC1 solo ends when a team is wiped | `TC-CORE-961` (`packages/core/tests/modes.test.ts`) | the match ends and the surviving team wins |
| AC2 score mode and the turn cap | `TC-CORE-915` (`packages/core/tests/modes.test.ts`) | the 12-turn cap is reached and the higher damage total wins |
| AC3 tag mode | `TC-CORE-916` (`packages/core/tests/modes.test.ts`) | `activeTeam` flips to the opposing team |
| AC4, AC5 jewel mode | `TC-CORE-917` (`packages/core/tests/modes.test.ts`) | a jewel is carried, then transferred on a kill; all jewels on one team wins immediately |
| AC6 the screen names the mode and the condition | `TC-CORE-962` (`apps/web/tests/outcome.test.tsx`, `apps/web/tests/results-outcome.test.tsx`) | the condition is read back with the engine's own rules, and `ResultsPage` prints `Chế độ Điểm số — thắng bằng: …` in `vi` and `en` |
| AC7 a mode outside the four is refused | `TC-ROOM-205` (`apps/worker/tests/rooms.test.ts`), `TC-CORE-016` | 422 naming `mode`; a `room_settings` frame with `mode: royale` is refused `bad-request` |

## Manual — the browser walk behind AC6

`npm run dev` (or the running Vite dev server) with the worker on `:8787`, then on a landscape phone or an emulated
844 × 390 viewport:

1. Play a bot match to its end, or seed a payload and open the screen:
   `sessionStorage.setItem("gbw.result", JSON.stringify({ …, "mode": "score", "winnerTeam": "A", "winCondition": "score-cap", … }))`
   then navigate to `/results/AAAAAA`.
2. Expect the banner `Đội A thắng` and, under it,
   `Chế độ Điểm số — thắng bằng: nhiều sát thương hơn khi hết số lượt`.
3. Expect `document.documentElement.scrollWidth` to equal the viewport width (no sideways scroll).

Screenshot: `ac6-result-screen-844x390.png` (844 × 390, 2026-11-06).

## What is still owed

A *real* match reaching the result screen is not automated: `TC-RANK-153` in `tests/e2e/smoke.spec.ts` opens
`/results/ABCD23` cold and asserts the redirect back to `/` — the opposite claim — and `tests/e2e/results.spec.ts`,
which `docs/02-reference/screens/results.md` used to cite, does not exist. `US-RANK-005` records that gap.
