# Screen — `/` main menu

The entry point: play now, join a friend, look at the board, or sign in. Reachable signed out.

## Layout (landscape, 844 × 390 reference)

```
┌───────────────────────────────────────────────────────────┐
│ GBW                  [Phòng công khai] [VI|EN] [Đăng nhập] │  top bar
├───────────────────────────────┬───────────────────────────┤
│  CHƠI NGAY                    │  VÀO PHÒNG                │
│  [Chơi với máy  60×60]        │  [Mã phòng: _ _ _ _ _ _]  │
│  [Tạo phòng     60×60]        │  [Vào            60×60]   │
│                               │                           │
│  Bảng xếp hạng · Đăng nhập     │  (guest: "Chơi không cần  │
│                               │   tài khoản" hint)         │
└───────────────────────────────┴───────────────────────────┘
```

At 844 × 390 the three action cards sit side by side under the header. The bot, create-room and join-room actions must
all be visible without vertical scrolling; the compact presentation only changes layout, never the controls or their
validation.

## Fields and controls

| Control | Type | Validation | Source | Action |
|---------|------|-----------|--------|--------|
| `Chơi với máy` | primary button | — | local | Starts a bot match in the match scene (no room, no network) |
| `Tạo phòng` | primary button | Requires a session token; minted on tap for a guest | `POST /sessions` → `POST /rooms` | Navigates to `/lobby/:code` as host |
| Max players selector | segmented control `2 · 4 · 6 · 8` | one of the four | local | Value sent as `maxPlayers` |
| Room code input | 6-char text input, `inputMode="text"`, uppercase, `autocapitalize="characters"` | `^[A-HJ-NP-Z2-9]{6}$`; invalid chars are not accepted as typed | local | Enables `Vào` |
| `Vào` | primary button | Code complete | `GET /rooms/:code` then `/lobby/:code` | Joins; `404`/`410`/`409` render as inline banner |
| `Bảng xếp hạng` | text link | — | — | → `/leaderboard` |
| `Công cụ tính toán` | text link, beside `Bảng xếp hạng` | — | local | → `/practice`, the flat-ground solver (`CR-2026-11-14-practice-solver-screen`) |
| `Phòng công khai` | secondary button | — | `GET /rooms` when opened | Opens the snapshot browser; no room socket is opened until a room is selected (`US-ROOM-013`) |
| `Đăng nhập` / `Hồ sơ` | mutually exclusive text links | — | `GET /me` when signed in | Guest → `/sign-in`; account → `/profile` |
| Language switch | `VI`/`EN` toggle | — | `localStorage.gbw.locale` | Re-renders all copy in place (`NFR-18`) |
| Public/private selector | segmented or checkbox control | one value | local | Sent as `isPrivate` on create; public (`false`) is the default |

Stable field ids and names are `main-mobile`/`mobile`, `main-capacity`/`maxPlayers`, `main-mode`/`mode` and
`main-room-code`/`roomCode`. Every control has an accessible name from its visible label or localised `aria-label`.

## Public room browser

`Phòng công khai` opens a modal/dialog over the menu. The list is not mounted and no request is made until the dialog
opens. It remains a static snapshot: opening it, selecting a filter or pressing refresh makes exactly one bounded
request. Changing nothing makes no request.

| Element | Behaviour |
|---|---|
| Filters | `Tất cả` omits `status`; `Đang chờ` sends `waiting`; `Đang chơi` sends `playing` |
| Room row | Code, mode, map, `seated / maxPlayers`, status; no player names or identity |
| Waiting row | Selectable; enters the existing join flow and may return a stale `404`/`409`/`410` inline |
| Playing row | Read-only; no join or spectator action in v1 |
| Refresh | Loads the active filter again; does not poll or subscribe |
| Loading | The trigger/filter reports `aria-busy`; the previous page remains visible where possible |
| Empty | Says no public rooms match the filter |
| Error | Shows the translated error and a retry control; no blank panel and no crash |
| Pagination | `Xem thêm` appends the next cursor; the cursor is never exposed as editable text |

At 844 × 390 the dialog must not change the three primary menu actions or cause vertical page scrolling. Closing it
returns focus to `Phòng công khai`.

## States

| State | Behaviour |
|-------|-----------|
| Signed out | `Đăng nhập` shown; profile link hidden; creating a room works as a guest |
| Signed in | Avatar + display name + rating in the top bar; `Đăng nhập` replaced by the avatar |
| Creating | Buttons disabled, spinner inside the tapped button, `aria-busy` |
| Error creating a room | Banner `Không tạo được phòng` + `request_id` + `Thử lại` |
| Offline | `Tạo phòng`/`Vào` disabled with hint `Cần kết nối mạng`; `Chơi với máy` stays enabled (`NFR-21`) |
| Public rooms: loading | Dialog opens, previous rows stay visible, filter/trigger is busy |
| Public rooms: empty | `Không có phòng phù hợp` and the active filter remains visible |
| Public rooms: error | Inline error plus `Thử lại`; closing the dialog returns focus |
| Public rooms: stale row | Inline join error; the active filter refreshes once |
| All slots busy | n/a — creating a room is per-call, not a global queue |

## Copy keys

`main.playBot`, `main.createRoom`, `main.joinRoom`, `main.roomCode`, `main.join`, `main.leaderboard`, `main.practice`,
`main.signIn`, `main.profile`, `main.maxPlayers`, `main.error.createFailed`, `main.error.joinFailed`,
`main.offline.hint`, `main.guestHint`, `main.rooms`, `main.rooms.title`, `main.rooms.all`, `main.rooms.waiting`,
`main.rooms.playing`, `main.rooms.empty`, `main.rooms.error`, `main.rooms.refresh`, `main.rooms.retry`, `main.rooms.more`,
`main.rooms.private`, `main.rooms.public`.

## Permissions

Everyone. No account, no room membership, no rating lookup beyond the optional `GET /me`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Code input accepts only the alphabet and enables `Vào` at 6 chars | `tests/e2e/main.spec.ts` (TC-ROOM-133) |
| Create → lobby as host; join → lobby as peer | `tests/e2e/main.spec.ts` (TC-ROOM-134) |
| Guest path works with no account and no sign-in prompt | `tests/e2e/main.spec.ts` (TC-AUTH-135) |
| 404/410 on join shows the banner, not a crash | `tests/e2e/main.spec.ts` (TC-ROOM-136) |
| Offline disables network actions but keeps bot play | `tests/e2e/pwa-offline.spec.ts` (TC-PWA-064) |
| All three primary actions fit a 844 × 390 landscape viewport | `tests/e2e/main.spec.ts` (TC-ROOM-719) |
| A guest sees `Đăng nhập` and no `Hồ sơ` link | `tests/e2e/main.spec.ts` (TC-ROOM-720) |
| Every menu field has a stable id, name and accessible label | `tests/e2e/main.spec.ts` (TC-ROOM-721) |
| Public browser loads only on open/filter/refresh and preserves the menu layout | `tests/e2e/public-rooms.spec.ts` (TC-ROOM-725) |
| A stale room selection shows the authoritative join error and refreshes | `tests/e2e/public-rooms.spec.ts` (TC-ROOM-726) |
| Public/private creation control sends `isPrivate` and private rooms stay out of the list | `tests/e2e/public-rooms.spec.ts` (TC-ROOM-728) |
