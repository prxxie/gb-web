# Screen — `/` main menu

The entry point: play now, join a friend, look at the board, or sign in. Reachable signed out.

## Layout (landscape, 844 × 390 reference)

```
┌───────────────────────────────────────────────────────────┐
│ GBW                                [VI|EN]   [Hồ sơ]      │  top bar
├───────────────────────────────┬───────────────────────────┤
│  CHƠI NGAY                    │  VÀO PHÒNG                │
│  [Chơi với máy  60×60]        │  [Mã phòng: _ _ _ _ _ _]  │
│  [Tạo phòng     60×60]        │  [Vào            60×60]   │
│                               │                           │
│  Bảng xếp hạng · Đăng nhập     │  (guest: "Chơi không cần  │
│                               │   tài khoản" hint)         │
└───────────────────────────────┴───────────────────────────┘
```

## Fields and controls

| Control | Type | Validation | Source | Action |
|---------|------|-----------|--------|--------|
| `Chơi với máy` | primary button | — | local | Starts a bot match in the match scene (no room, no network) |
| `Tạo phòng` | primary button | Requires a session token; minted on tap for a guest | `POST /sessions` → `POST /rooms` | Navigates to `/lobby/:code` as host |
| Max players selector | segmented control `2 · 4 · 6 · 8` | one of the four | local | Value sent as `maxPlayers` |
| Room code input | 6-char text input, `inputMode="text"`, uppercase, `autocapitalize="characters"` | `^[A-HJ-NP-Z2-9]{6}$`; invalid chars are not accepted as typed | local | Enables `Vào` |
| `Vào` | primary button | Code complete | `GET /rooms/:code` then `/lobby/:code` | Joins; `404`/`410`/`409` render as inline banner |
| `Bảng xếp hạng` | text link | — | — | → `/leaderboard` |
| `Đăng nhập` / `Hồ sơ` | text link / avatar | — | `GET /me` when signed in | → `/sign-in` or `/profile` |
| Language switch | `VI`/`EN` toggle | — | `localStorage.gbw.locale` | Re-renders all copy in place (`NFR-18`) |

## States

| State | Behaviour |
|-------|-----------|
| Signed out | `Đăng nhập` shown; profile link hidden; creating a room works as a guest |
| Signed in | Avatar + display name + rating in the top bar; `Đăng nhập` replaced by the avatar |
| Creating | Buttons disabled, spinner inside the tapped button, `aria-busy` |
| Error creating a room | Banner `Không tạo được phòng` + `request_id` + `Thử lại` |
| Offline | `Tạo phòng`/`Vào` disabled with hint `Cần kết nối mạng`; `Chơi với máy` stays enabled (`NFR-21`) |
| All slots busy | n/a — creating a room is per-call, not a global queue |

## Copy keys

`main.playBot`, `main.createRoom`, `main.joinRoom`, `main.roomCode`, `main.join`, `main.leaderboard`,
`main.signIn`, `main.profile`, `main.maxPlayers`, `main.error.createFailed`, `main.error.joinFailed`,
`main.offline.hint`, `main.guestHint`.

## Permissions

Everyone. No account, no room membership, no rating lookup beyond the optional `GET /me`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Code input accepts only the alphabet and enables `Vào` at 6 chars | `tests/e2e/main.spec.ts` (TC-ROOM-133) |
| Create → lobby as host; join → lobby as peer | `tests/e2e/main.spec.ts` (TC-ROOM-134) |
| Guest path works with no account and no sign-in prompt | `tests/e2e/main.spec.ts` (TC-AUTH-135) |
| 404/410 on join shows the banner, not a crash | `tests/e2e/main.spec.ts` (TC-ROOM-136) |
| Offline disables network actions but keeps bot play | `tests/e2e/offline.spec.ts` (TC-PWA-064) |
