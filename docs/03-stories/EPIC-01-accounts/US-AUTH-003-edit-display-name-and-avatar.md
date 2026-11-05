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
| AC6 | A name containing `<script>` or a newline | It is saved | Stored as text and rendered escaped everywhere; newlines and control characters are rejected |
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

## 6. Implementation notes

- `apps/worker/src/routes/me.ts`; validation with `zod`; the normaliser is shared with the migration that backfills
  `display_name_key`.
- `UNIQUE(display_name_key)` violation is mapped to `409 display-name-taken` — never surface the SQL error.
- Avatar images are AI-generated (`OQ-12`) and shipped in the web bundle under `assets/avatars/`.

## 7. Out of scope

- Uploading an avatar image (rule 06 treats uploads as a stop-and-flag surface; not in v1).
- Name change history or moderation tooling (`OQ-29` records the gap).

## 8. Test notes

`TC-AUTH-101`, `TC-AUTH-102`, `TC-AUTH-140`. The normalisation cases are a table-driven unit test
(`apps/worker/tests/display-name.test.ts`). Red first: `apps/worker/tests/accounts.test.ts::duplicate_key_conflicts`.

## 9. Open questions

- **OQ-26** (open) — the profile row exists only once Clerk is configured; see [US-AUTH-002](US-AUTH-002-sign-in-with-clerk.md) § 9.
- **OQ-29** (accepted assumption) — no reporting or name filter in v1; players can pick any allowed character mix,
  and abuse is handled manually by support. If the client requires a blocklist or a report flow, this story grows by a
  name filter plus an admin action.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** code complete (`PATCH /me`, `display_name_key`, avatar set). Remaining step: a signed-in session, then `TC-AUTH-101/102/140`.
