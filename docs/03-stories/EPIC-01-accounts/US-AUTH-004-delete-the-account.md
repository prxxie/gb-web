---
id: US-AUTH-004
title: Delete the account and purge personal data within 30 days
epic: EPIC-01-accounts
status: ready
priority: P2
size: S
depends_on: [US-AUTH-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/accounts.md, 01-overview/nonfunctional-requirements.md, 02-reference/screens/profile.md]
---

# US-AUTH-004 — Delete the account and purge personal data within 30 days

## 1. Story

**As a** registered player
**I want** to delete my account and know what disappears
**so that** leaving the game does not leave my data behind.

## 2. Context

Deletion spans two systems: Clerk deletes the identity and the email; the worker marks the mirror `deleted`, keeps the
rating history intact for other players' records, and a purge job removes the personal columns 30 days later
(`NFR-13`, `NFR-15`).

| Topic | Reference |
|-------|-----------|
| `DELETE /me` contract | [api/accounts.md](../../02-reference/api/accounts.md#delete-me) |
| PII and retention NFRs | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |
| Profile screen destructive action | [screens/profile.md](../../02-reference/screens/profile.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A registered player not in a live room | `DELETE /me` is called | `204`; the Clerk user is deleted first, then `account.status = 'deleted'` with `deleted_at` set, and the response carries no body |
| AC2 | A player inside a room in `playing` status | `DELETE /me` is called | `409` with `type` ending `/conflict` and a detail naming the room; nothing is deleted (`TC-AUTH-069`) |
| AC3 | A deleted account | Any Clerk-authenticated request is made with a still-valid JWT | `401 unauthenticated` — the `account.status` check runs before the handler |
| AC4 | 30 days after deletion | The purge job runs | `display_name`, `display_name_key` and `avatar_id` are replaced by an anonymised value, the email is gone with the Clerk user, and the `rating_history` rows remain with the anonymised account (`TC-AUTH-103`) |
| AC5 | The profile screen | Delete is chosen | A typed confirmation is required, then the player is signed out and redirected to `/` with a confirmation toast (`TC-AUTH-142`) |
| AC6 | An API response for another account | It is inspected | No `accountId`, `guestId`, `displayName` or email of the deleted account appears anywhere except the anonymised leaderboard entry (`TC-AUTH-075`) |

## 4. Contract

`DELETE /api/v1/me` (Clerk JWT) → `204` no body, or `409` problem body.

Purge job: a Cloudflare cron trigger on the worker (`*/1 * * * *`, batch of 100) selecting
`account.status = 'deleted' AND deleted_at < now - 30 days`, then:

| Table | Action |
|-------|--------|
| `account` | `status = 'purged'`, keep `account_id` |
| `profile` | `display_name = 'Deleted player'`, `display_name_key = 'deleted-' + account_id`, `avatar_id = 'avatar-deleted'` |
| `match_player`, `rating_history` | untouched — they reference `account_id`, which now has no personal data |

## 5. Rules and edge cases

- Order matters: the Clerk deletion is attempted first; if it fails, nothing in D1 changes and the endpoint returns
  `502` so the client can retry (no half-deleted state that keeps a login alive).
- A player in a lobby (not `playing`) may delete: the room receives `peer_left` first.
- Deletion is irreversible after the purge; before the purge a support request can restore by clearing `deleted_at` —
  documented in the runbook, not exposed in the UI.
- The confirmation text is translated and names the 30-day window.
- No email may be written to the log at any point of this flow.

## 6. Implementation notes

- `apps/worker/src/routes/me.ts` (`DELETE`), `apps/worker/src/jobs/purge.ts` wired to `scheduled` in the worker entry.
- `ClerkClient.users.deleteUser(clerkUserId)` with a 10 s timeout; treat `404` from Clerk as success (already gone).
- The purge job is idempotent and logs counts only, never names.

## 7. Out of scope

- Data export (`GET /me/export`) — not in v1; recorded as a gap in `OQ-26`'s answer when the privacy policy is written.
- Deleting individual matches.

## 8. Test notes

`TC-AUTH-103`, `TC-AUTH-069`, `TC-AUTH-142`, `TC-AUTH-075`. The purge is tested by inserting a row with
`deleted_at = now - 31 days` and invoking the scheduled handler directly. Red first:
`tests/worker/accounts.test.ts::delete_purges_after_30_days`.

## 9. Open questions

**OQ-26** (open) — the retention window and the privacy-policy wording are part of the Clerk/PII decision; 30 days is
the recorded assumption. If the client chooses a different window, `NFR-13`, `NFR-15` and this story's AC4 change
together.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** code complete (`DELETE /me`, 30-day scheduling, purge job seam). Remaining step: a signed-in session plus the purge cron, then `TC-AUTH-103/069/142/075`.
