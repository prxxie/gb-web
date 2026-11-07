# Screen — `/results/:code`

What just happened, and the only place a rating change is explained. Reached from `/match/:code` on `match_end`;
reloadable for 10 minutes from the `match_recorded` payload kept in `sessionStorage`.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│                         ĐỘI A THẮNG                       │
│                       (trophy, 64 px)                     │
├───────────────────────────────┬───────────────────────────┤
│ ĐỘI A                         │ ĐỘI B                     │
│ (av) Bao   1284 → 1296  +12   │ (av) Linh 1310 → 1298 −12 │
│  Sát thương 340 · 8 phát · 5  │  Sát thương 210 · 7 · 3   │
├───────────────────────────────┴───────────────────────────┤
│ [Chơi lại]      [Về trang chính]        (guest: "Trận này  │
│                                          không tính điểm")│
└───────────────────────────────────────────────────────────┘
```

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Winner | `ĐỘI A` / `ĐỘI B` / `HÒA` | `match_recorded.winnerTeam` (echoed from the host's `match_end`) | `HÒA` is only possible if both teams are eliminated in the same resolution |
| Mode and win condition | `Chế độ Điểm số — thắng bằng: …` | result payload `mode` + `winCondition` | Names the mode and the rule that ended the match (`US-CORE-010` AC6); `winCondition` is read back from the finished state by `apps/web/src/lib/outcome.ts` |
| Per-player result | `Thắng` / `Thua` / `Bỏ cuộc` | `match_recorded.players[].result` (falling back to `players[].result` in the payload) | The room says `win` for the side that stayed; the stored row says `abandon` for every seat of an abandoned match (`matches.md` § `abandoned`) |
| Rating before → after | integers | `match_recorded.ratings[].before` / `.after` | Only for ranked matches; guests and bot matches show `—` |
| Delta | signed integer | `match_recorded.ratings[].delta`, printed as sent | `+12` / `−12`; the screen never computes it |
| Stats | damage / shots / hits | `players[]` | Shots = fires sent; hits = projectiles that damaged at least one player |
| Unrated reason | text, one muted line under the banner | `match_recorded.rankedReason` only | `guest`, `bot`, `abandoned`, `ruleset_mismatch`; absent when the match was rated **or** when nothing said why — the screen never derives it |

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Chơi lại | Returns to `/lobby/:code` if the room still exists, else creates a fresh room with the same `maxPlayers` | `GET /rooms/:code`, `POST /rooms` | member |
| Về trang chính | → `/` | — | member |
| Back button | Never re-enters `/match/:code`: the handover uses `navigate(…, { replace: true })`, so Back lands on whatever was there before the match | — | — |

## States

| State | Behaviour |
|-------|-----------|
| Recording | `Đang ghi kết quả…` under the banner while `Thử lại` is in flight; the statistics stay visible and the delta cells print `…` until the answer arrives. The first wait happens on `/match/:code`, which only hands over once the room answered or 5 s passed |
| Recorded | Full data, deltas as the record sent them |
| Recording failed | One muted line `Không ghi được kết quả`; `Thử lại` appears only for the host of an online match that ended with a winner (a guest cannot submit, and `POST /matches` refuses `winnerTeam: null`) |
| Guest | Ratings column stays `—` and the unrated reason line says the match was not rated |
| Reloaded without `sessionStorage` | `GET /me/matches` for the newest record, labelled `Trận gần nhất trong lịch sử của bạn` because the history has no room code (it carries none, so the label stays even when the row is this match); if absent, a neutral `Trận đã kết thúc` + `Về trang chính` |
| Room gone | `Chơi lại` creates a new room instead of 404-ing |
| Retried, answered `409`, history unreadable | The match exists, so the failure line and the retry both go; the delta column prints `—` |

## Rules

- Exactly one `POST /matches` per match id; the server answers `409 match-already-recorded` and the client then shows
  the stored record instead of retrying (`matches.md`).
- An abandoned match records `result: 'abandon'` for **every** seat, the side that stayed included, and no rating change
  for anyone (`matches.md` § `abandoned`). The screen prints `Bỏ cuộc` for all of them.
- Bot and guest matches never touch the leaderboard; the results screen must say so, not stay silent.

## Copy keys

`results.winner.teamA`, `results.winner.teamB`, `results.winner.draw`,
`results.ratings.reasonGuest`, `results.ratings.reasonBot`, `results.ratings.reasonAbandoned`,
`results.ratings.reasonRuleset`, `results.stats.damage`, `results.stats.shots`, `results.stats.hits`,
`results.rating`, `results.result`, `results.result.win`, `results.result.loss`, `results.result.abandon`,
`results.outcome`,
`results.mode.*`, `results.condition.*`, `results.rematch`, `results.exit`, `results.recording`,
`results.recordFailed`, `results.ended`, `results.recovered`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| All fields render for a ranked match, deltas match the server's values | `tests/e2e/results.spec.ts` (TC-RANK-153), `apps/web/tests/results-screen.test.tsx` |
| The mode and the win condition are named, in the player's language | `apps/web/tests/outcome.test.tsx` (TC-CORE-962), `apps/web/tests/results-outcome.test.tsx` |
| The viewer's own row is marked, guest or not | `apps/web/tests/results-screen.test.tsx` (seat-based, `localSlot`), `tests/e2e/results.spec.ts` (TC-RANK-153) |
| Guest/bot matches state the reason and print no delta | `tests/e2e/results.spec.ts` (TC-RANK-154), `apps/web/tests/results-screen.test.tsx` |
| A bot match renders without waiting for the room and never calls `POST /matches` | `apps/web/tests/results-screen.test.tsx`, `apps/web/tests/match-end.test.tsx` |
| The room's `match_recorded` supplies the deltas the screen prints | `apps/web/tests/match-record.test.tsx` |
| `Chơi lại` reopens the lobby, or creates a room with the same shape when the code is closed | `tests/e2e/results.spec.ts` (TC-RANK-155), `apps/web/tests/results-screen.test.tsx` |
| `409` shows the stored record rather than retrying | `tests/e2e/results.spec.ts` (TC-RANK-157), `apps/web/tests/results-screen.test.tsx` |
| A lost record offers a retry only to a host who could submit it, and reuses the room's match id | `apps/web/tests/results-screen.test.tsx` |
| An unrated match names the record's own reason, including `ruleset_mismatch` | `apps/web/tests/results-screen.test.tsx`, `apps/web/tests/match-record.test.tsx` |
| Reload without `sessionStorage` recovers from `GET /me/matches` and labels it as the newest record, or says the match is over | `apps/web/tests/results-screen.test.tsx` |
| A record with no `rankedReason` prints no reason rather than a guessed one | `apps/web/tests/results-screen.test.tsx` |
| A `409` whose history lookup fails stops offering a retry and shows `—` | `apps/web/tests/results-screen.test.tsx`, `tests/e2e/results.spec.ts` TC-RANK-157 |
| Back navigation does not return into the finished match | `apps/web/tests/match-record.test.tsx` (TC-RANK-156: the handover replaces its entry) |
