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
| Per-player result | `Thắng` / `Thua` / `Bỏ cuộc` | `players[].result` | Abandon is shown for a player who left before the end |
| Rating before → after | integers | `ratingBefore`, `ratingAfter` | Only for ranked matches; guests and bot matches show `—` |
| Delta | signed integer | computed | `+12` in `primary`, `−12` in `danger` |
| Stats | damage / shots / hits | `players[]` | Shots = fires sent; hits = projectiles that damaged at least one player |
| Ranked badge | text | `match.ranked` | Absent → `Trận không xếp hạng` |
| Unrated reason | text | `match.rankedReason` | `guest`, `bot`, `abandoned`, `ruleset_mismatch` |

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Chơi lại | Returns to `/lobby/:code` if the room still exists, else creates a fresh room with the same `maxPlayers` | `GET /rooms/:code`, `POST /rooms` | member |
| Về trang chính | → `/` | — | member |
| Back button | Same as `Về trang chính`; `history.replaceState` prevents returning into a stale match | — | — |

## States

| State | Behaviour |
|-------|-----------|
| Recording | `Đang ghi kết quả…`; the result is already visible, only the delta area shimmers |
| Recorded | Full data |
| Recording failed | Banner `Không ghi được kết quả` + `Thử lại`; the match is **not** counted, players are told ratings did not change |
| Guest | Ratings column replaced by `Trận này không tính điểm` |
| Reloaded without `sessionStorage` | `GET /me/matches` for the newest record; if absent, a neutral `Trận đã kết thúc` + `Về trang chính` |
| Room gone | `Chơi lại` creates a new room instead of 404-ing |

## Rules

- Exactly one `POST /matches` per match id; the server answers `409 match-already-recorded` and the client then shows
  the stored record instead of retrying (`matches.md`).
- Abandoned matches (`room.abandoned`) record `result: 'abandon'` for those who left and no rating change for anyone.
- Bot and guest matches never touch the leaderboard; the results screen must say so, not stay silent.

## Copy keys

`results.winner.teamA`, `results.winner.teamB`, `results.winner.draw`, `results.ratings.unranked`,
`results.ratings.reasonGuest`, `results.ratings.reasonBot`, `results.ratings.reasonAbandoned`,
`results.ratings.reasonRuleset`, `results.stats.damage`, `results.stats.shots`, `results.stats.hits`,
`results.outcome`, `results.mode.*`, `results.condition.*`, `results.rematch`, `results.exit`, `results.recording`, `results.recordFailed`, `results.ended`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| All fields render for a ranked match, deltas match the server's values | `tests/e2e/results.spec.ts` (TC-RANK-153) |
| The mode and the win condition are named, in the player's language | `apps/web/tests/outcome.test.tsx` (TC-CORE-962) |
| Guest/bot matches show `unranked` and no delta | `tests/e2e/results.spec.ts` (TC-RANK-154) |
| `409` shows the stored record rather than retrying | `tests/e2e/results.spec.ts` (TC-RANK-155) |
| Reload without `sessionStorage` recovers from `GET /me/matches` | `tests/e2e/results.spec.ts` (TC-RANK-156) |
| Back navigation does not return into the finished match | `tests/e2e/results.spec.ts` (TC-RANK-157) |
