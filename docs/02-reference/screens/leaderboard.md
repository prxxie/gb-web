# Screen — `/leaderboard`

Public ranking by Elo. No auth, cached for 30 s, cursor-paginated.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ ←   Bảng xếp hạng                             [VI|EN]     │
├───────────────────────────────────────────────────────────┤
│  #   Người chơi            Điểm     Trận                  │
│  1   (av) Minh             1540     82   ← own row tinted │
│  2   (av) Bao              1498     64                    │
│  3   (av) Linh             1461     51                    │
│  …                                                        │
│                              [Tải thêm]                   │
└───────────────────────────────────────────────────────────┘
```

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Rank | integer, 1-based, continues across pages | `GET /leaderboard.items[].rank` | Dense within the page, counted from the cursor's offset |
| Avatar | image from the fixed set | `avatarId` | `alt=""` (decorative, the name follows) |
| Name | text | `displayName` | Own row tinted + `aria-current="true"` when signed in |
| Rating | integer | `rating` | Format with a thin space for thousands in `vi`, comma in `en` |
| Rated matches | integer | `ratedMatches` | `< 10` shows a `Mới` badge (low sample) |

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Load more | Appends the next page | `GET /leaderboard?cursor=` | public |
| Own-row jump | Scrolls to and highlights the caller's row on first page load | — | — |
| Back | → `/` | — | — |

## States

| State | Behaviour |
|-------|-----------|
| Loading | 5 skeleton rows |
| Empty | `Chưa có ai được xếp hạng` + `Chơi trận xếp hạng đầu tiên` → `/` |
| Own row not in the fetched pages | A sticky footer row with the caller's own rank and rating, fetched via `GET /me` (`rank` computed from `COUNT(rating > mine)`) |
| Offline | Cached first page if present, otherwise banner `Cần kết nối mạng` |
| Error | Banner + retry, keeps the previous page |

## Notes

- The list is the only place a `displayName` of another account is rendered; it must be text-safe (no `innerHTML`) and
  must survive a name containing punctuation — React escapes by default, no exceptions (`06-security.md` §2).
- Pagination is keyset on `(rating DESC, rated_matches DESC, account_id ASC)`; an insert between pages cannot duplicate
  a row, only shift ranks.

## Copy keys

`leaderboard.title`, `leaderboard.rank`, `leaderboard.player`, `leaderboard.rating`, `leaderboard.matches`,
`leaderboard.loadMore`, `leaderboard.empty`, `leaderboard.newPlayer`, `leaderboard.yourRank`, `leaderboard.offline`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Ordering, `Mới` badge threshold, own-row highlight | `tests/e2e/leaderboard.spec.ts` (TC-RANK-144, TC-RANK-145) |
| Cursor pagination has no duplicates and no gaps after a concurrent rating change | `tests/worker/leaderboard.test.ts` (TC-RANK-104) |
| A name containing `<script>` renders as text | `tests/e2e/leaderboard.spec.ts` (TC-RANK-146) |
| Public access — no auth, no redirect | `tests/e2e/leaderboard.spec.ts` (TC-RANK-147) |
