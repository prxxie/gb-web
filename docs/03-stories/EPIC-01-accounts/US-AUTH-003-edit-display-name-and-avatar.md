---
id: US-AUTH-003
title: Edit the display name and pick an avatar
epic: EPIC-01-accounts
status: ready
priority: P2
size: S
depends_on: [US-AUTH-002]
open_questions: []
accepted_assumptions: [OQ-29]
refs: [02-reference/api/accounts.md, 02-reference/data/accounts.md, 02-reference/screens/profile.md]
---

# US-AUTH-003 — Edit the display name and pick an avatar

## 1. Story

**As a** registered player
**I want** to choose the name and avatar other players see
**so that** the lobby and the leaderboard are not a list of random handles.

## 2. Context

`profile.display_name` is unique through `display_name_key` (case- and diacritic-insensitive), 2–16 characters, and
the avatar comes from a fixed set shipped with the app. Both are written only through `PATCH /me`.

| Topic | Reference |
|-------|-----------|
| `PATCH /me` contract | [api/accounts.md](../../02-reference/api/accounts.md#patch-me) |
| `profile` columns and the uniqueness key | [data/accounts.md](../../02-reference/data/accounts.md) |
| Profile screen fields and states | [screens/profile.md](../../02-reference/screens/profile.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A registered player with the name `Bao` | `PATCH /me {"displayName":"Bao"}` | `200`, `display_name_key` unchanged, no other profile field touched |
| AC2 | The name `bao` already taken by another account | A player saves `Baỏ` (same key after normalisation) | `409 display-name-taken` and the field keeps the previous value (`TC-AUTH-101`) |
| AC3 | A name of 1 or 17 characters, or an unknown `avatarId` | It is saved | `422 validation_failed` naming the field (`TC-AUTH-102`) |
| AC4 | The profile screen | The name field is edited and saved | The new value is shown optimistically, and on `409` it reverts with an inline field error (`TC-AUTH-140`) |
| AC5 | The avatar picker | An avatar is chosen | It is saved without reloading the page and appears in the lobby roster after the next `room_state` |
| AC6 | A name containing markup (`<b>`, `&`) or a control character (newline, tab) | It is saved | `422 validation_failed` naming `displayName`, nothing written; a stored name that does contain markup renders as text, never as markup (`TC-AUTH-145`) |
| AC7 | Two players in a lobby | One changes their name | The other's roster updates within 1 s without a rejoin |

## 4. Contract

`PATCH /api/v1/me` (Clerk JWT) request — at least one field:

| Field | Type | Validation |
|-------|------|-----------|
| `displayName` | string | Trimmed, 2–16 code points, letters/digits/space/`-`/`_`, no leading or trailing space |
| `avatarId` | string | Must be one of `avatar-01`…`avatar-12` |

Response `200` = the `GET /me` body. Normalisation for `display_name_key`: NFD, strip combining marks, lower-case,
collapse internal whitespace to a single space.

## 5. Rules and edge cases

- The rating is not writable here, and `PATCH /me` must reject an unknown field rather than ignore it.
- A name change keeps the old key free immediately (a single `UPDATE`); no reservation table.
- Empty body → `422`, not `200`.
- Uniqueness is case- and diacritic-insensitive so `Bảo` and `bao` cannot coexist.
- The DO reads the name from the member record captured at join time; a rename reaches peers through the next
  `room_state`, not through a targeted message.
- The client has one way to make that `room_state` happen: it re-sends `auth` on the socket it already holds. In the
  lobby the DO rewrites the member record from that frame, persists, and answers with `room_state` (and broadcasts
  `peer_joined` to the others), so a rename needs no new frame type and no rejoin. The `PATCH /me` answer is also
  written into the stored session, so the next join authenticates with the new name.
- That same frame carries `avatarId`, and `authenticate()` writes it into the member record beside `displayName`
  (`apps/worker/src/room-do.ts`, lobby only). The roster renders `member.avatarId` as a 28 px disc carrying the pick's
  number (`avatar-09` → `09`, `default` → `–`) because the images have not shipped (`OQ-12`); the shape is documented
  in `docs/02-reference/screens/lobby.md` § Member row, so the disc is replaced by an image without changing the
  contract.

## 6. Implementation notes

- `apps/worker/src/routes/accounts.ts` (`patchMe`); validation with the hand-rolled `Field`/`readJson` helpers in
  `apps/worker/src/lib/validation.ts`, not `zod`; the normaliser is shared with the migration that backfills
  `display_name_key`.
- `UNIQUE(display_name_key)` violation is mapped to `409 display-name-taken` — never surface the SQL error.
- Avatar images are AI-generated (`OQ-12`) and have not shipped: no `assets/avatars/` exists, so the picker lists the
  ids `avatar-01`…`avatar-12` as text (`apps/web/src/routes/ProfilePage.tsx` `AVATAR_IDS`). The loadout parts
  (`av-head-01`…) are a different vocabulary and `PATCH /me` answers one with `422`.

## 7. Out of scope

- Uploading an avatar image (rule 06 treats uploads as a stop-and-flag surface; not in v1).
- Name change history or moderation tooling (`OQ-29` records the gap).

## 8. Test notes

`TC-AUTH-101`, `TC-AUTH-102`, `TC-AUTH-140`, `TC-AUTH-144`, `TC-AUTH-145`, `TC-AUTH-146`, `TC-AUTH-147`,
`TC-AUTH-148`, `TC-AUTH-149`.
The normalisation cases are a table-driven unit test
(`apps/worker/tests/display-name.test.ts`). - **Red:** `apps/web/tests/profile.test.tsx` and `apps/web/tests/lobby-rename.test.tsx` — the profile screen had no
  inline error branch and no avatar persistence, and the lobby never re-sent `auth`, so AC4, AC5 and AC7 failed.

## 9. Open questions

- **OQ-26** (open) — the profile row exists only once Clerk is configured; see [US-AUTH-002](US-AUTH-002-sign-in-with-clerk.md) § 9.
- **OQ-29** (accepted assumption) — no reporting or name filter in v1; players can pick any allowed character mix,
  and abuse is handled manually by support. If the client requires a blocklist or a report flow, this story grows by a
  name filter plus an admin action.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `PATCH /me`, `display_name_key`, avatar set, the profile screen (optimistic save, `409`/`422` field
errors, avatar picker over `avatar-01`…`avatar-12`), the stored-session update and the lobby `auth` re-send are all
covered by tests (`apps/web/tests/profile.test.tsx`, `apps/web/tests/lobby-rename.test.tsx`,
`apps/worker/tests/profile.test.ts`, `apps/worker/tests/display-name.test.ts`). Remaining: a signed-in session for the
`TC-AUTH-140/143` e2e rows, and AC5's roster clause, which needs the `room-do.ts` change recorded in §5.
