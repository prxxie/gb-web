# Screen — `/leaderboard`

Public ranking by Elo. No auth, cursor-paginated. An anonymous page is cached for 30 s; a page served to a session carries that reader's own rank and is never stored (`api/matches.md` § GET /leaderboard).

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
├───────────────────────────────────────────────────────────┤
│ Hạng của bạn                                  #42   1338  │ ← sticky, only while off-page
└───────────────────────────────────────────────────────────┘
```

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Rank | integer, 1-based, continues across pages | `GET /leaderboard.items[].rank` | Dense within the page, counted from the cursor's offset |
| Avatar | not rendered in v1 | `avatarId` | The field travels for the roster and profile screens; this table prints rank, name, rating and matches |
| Name | text | `displayName` | Own row tinted + `aria-current="true"` when signed in |
| Rating | integer | `rating` | Printed as the server sends it — a grouped number (`1.338` in `vi`) would be read as two columns |
| Rated matches | integer | `ratedMatches` | `< 10` shows a `Mới` badge (low sample) |

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Load more | Appends the next page | `GET /leaderboard?cursor=` | public |
| Own row | The caller's row is tinted and marked `aria-current="true"` when it is among the fetched pages; when it is
  not, a sticky footer carries `#rank` and the rating (no auto-scroll, nothing to scroll to) | `you` from the list
  response | public |
| Back | → `/` | — | — |

## States

| State | Behaviour |
|-------|-----------|
| Loading | The table is empty until the first page arrives; `Tải thêm` is disabled while a page is in flight (no skeleton rows in v1) |
| Empty | `leaderboard.empty` (`Chưa có ai trên bảng xếp hạng.`) + a link to `/` labelled `leaderboard.emptyCta` |
| Own row not in the fetched pages | A sticky footer row with the caller's own rank and rating, from the `you` field of the same list response — never from `GET /me`, which carries no rank; `you: null` (signed out, stale token, unrated) hides the footer |
| Offline | Banner `Cần kết nối mạng` with a retry — the ranking is not cached offline, so there is no stale page to show (`US-PWA-001` §5) |
| Error | `Không tải được bảng xếp hạng.` with a `Thử lại` button that refetches the first page; the previous page stays on screen when a later page failed |

## Notes

- The list is the only place a `displayName` of another account is rendered; it must be text-safe (no `innerHTML`) and
  must survive a name containing punctuation — React escapes by default, no exceptions (`06-security.md` §2).
- Pagination is `LIMIT/OFFSET` under an opaque cursor (`{v:1,o}`); ranks continue across pages. A rating change
  between two requests can repeat or skip one row, which is accepted for v1: the list is a 30-second snapshot, not a
  ledger, and `rank` is explicitly positional. Keyset paging over `(rating, rated_matches, account_id)` would remove it
  and is the follow-up if a repeated row is ever reported.
- A name is clipped in graphemes (`Intl.Segmenter`) at 16, so a ZWJ emoji sequence is never cut in half.

## Copy keys

`leaderboard.title`, `leaderboard.rank`, `leaderboard.player`, `leaderboard.rating`, `leaderboard.matches`,
`leaderboard.loadMore`, `leaderboard.empty`, `leaderboard.emptyCta`, `leaderboard.error`, `leaderboard.newPlayer`,
`leaderboard.yourRank`, `leaderboard.offline`, plus `common.retry` on the retry button.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Ordering, `Mới` badge threshold, own-row highlight | `tests/e2e/leaderboard.spec.ts` (TC-RANK-144, TC-RANK-145) |
| Cursor pagination keeps `rank` continuous across pages and rejects a forged cursor | `apps/worker/tests/leaderboard.test.ts` (TC-RANK-104) |
| A name containing `<script>` renders as text | `tests/e2e/leaderboard.spec.ts` (TC-RANK-146) |
| Public access — no auth, no redirect, no `/me` | `tests/e2e/leaderboard.spec.ts` (TC-RANK-147) |
| Offline shows the banner and its retry, with no stale page | `tests/e2e/pwa-offline.spec.ts` (TC-PWA-064) |
