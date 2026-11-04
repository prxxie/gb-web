# Screen — `/profile`

Own profile, rating and match history. Registered players only; a guest landing here is sent to `/sign-in`.

## Layout (two columns, landscape)

```
┌───────────────────────────────────────────────────────────┐
│ ←   Hồ sơ                                    [VI|EN]      │
├──────────────────────────────┬────────────────────────────┤
│  (avatar)  Tên người chơi    │  Lịch sử trận              │
│            [Sửa tên]         │  ┌──────────────────────┐  │
│            Điểm: 1284        │  │ 04/11  Thắng  +12    │  │
│            Trận: 37         │  │        Đội A · 2v2   │  │
│  [Chọn avatar ▾]             │  ├──────────────────────┤  │
│                              │  │ 03/11  Thua   −9     │  │
│  [Đăng xuất]  [Xoá tài khoản]│  └──────────────────────┘  │
│                              │  [Tải thêm]                │
└──────────────────────────────┴────────────────────────────┘
```

## Fields

| Field | Type | Validation | Source | Notes |
|-------|------|-----------|--------|-------|
| Avatar | picker over the fixed set | must be in the allowlist | `GET /me.avatarId` | `PATCH /me { avatarId }` |
| Display name | text input, 2–16 chars | trimmed length; uniqueness is server-side (`409 display-name-taken`) | `GET /me.displayName` | `PATCH /me { displayName }` |
| Rating | read-only number | — | `GET /me.rating` | Server-computed only |
| Match count | read-only number | — | `GET /me.ratedMatches` | — |
| Stats | read-only `thắng / thua / bỏ cuộc` | — | `GET /me.stats` | — |
| History list | rows from `GET /me/matches` | — | API | 20 per page, cursor `Tải thêm` |

History row fields: date, result (`Thắng`/`Thua`/`Bỏ cuộc`), rating delta (`+12`, `−9`, `—` when unranked), opponents'
names, team size, damage/shots. No account ids are rendered.

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Save name | Inline save with optimistic revert on failure | `PATCH /me` | own account |
| Pick avatar | Immediate save | `PATCH /me` | own account |
| Load more | Appends the next page | `GET /me/matches?cursor=` | own account |
| Sign out | Clears Clerk session + local session token → `/` | Clerk | own session |
| Delete account | Confirmation dialog naming what is deleted; requires typing the display name | `DELETE /me` → Clerk delete | own account |

## States

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton for header + 3 history rows |
| Empty history | `Chưa có trận nào` + `Chơi ngay` → `/` |
| Name taken | Field error `Tên đã có người dùng`, value restored to the previous name |
| Name rejected (profanity/reserved) | Field error `Tên không hợp lệ` (`OQ-29`) |
| Delete in progress | Dialog locked, spinner; on success a toast then `/` |
| Offline | Header renders from cache; save/delete/load-more disabled with `Cần kết nối mạng` |

## Copy keys

`profile.title`, `profile.displayName`, `profile.save`, `profile.avatar`, `profile.rating`, `profile.matches`,
`profile.stats.wins`, `profile.stats.losses`, `profile.stats.abandons`, `profile.history.title`,
`profile.history.empty`, `profile.history.loadMore`, `profile.history.unranked`, `profile.signOut`,
`profile.delete`, `profile.delete.confirm`, `profile.error.nameTaken`, `profile.error.nameInvalid`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| Name validation, `409` handling, optimistic revert | `tests/e2e/profile.spec.ts` (TC-AUTH-140) |
| History pagination appends without duplicates | `tests/e2e/profile.spec.ts` (TC-RANK-141) |
| Delete flow: typed confirmation, `204`, redirect, no further API access | `tests/e2e/profile.spec.ts` (TC-AUTH-142) |
| Guest is redirected to `/sign-in` | `tests/e2e/profile.spec.ts` (TC-AUTH-143) |
| No account id rendered in the DOM | `tests/e2e/profile.spec.ts` (TC-AUTH-075) |
