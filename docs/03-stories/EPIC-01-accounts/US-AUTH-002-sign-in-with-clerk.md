---
id: US-AUTH-002
title: Sign in with Google or an email link and get a profile
epic: EPIC-01-accounts
status: ready
priority: P1
size: M
depends_on: [US-FND-002, US-FND-003]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/accounts.md, 02-reference/data/accounts.md, 04-decisions/adr/ADR-0002-auth-clerk-jwt.md, 02-reference/screens/sign-in.md]
---

# US-AUTH-002 — Sign in with Google or an email link and get a profile

## 1. Story

**As a** competitive player
**I want** to sign in with Google or an email link
**so that** my rating, avatar and match history survive a new phone.

## 2. Context

Clerk owns identity and email; the worker verifies the Clerk JWT and mirrors a profile row keyed by `clerk_user_id`
([ADR-0002](../../04-decisions/adr/ADR-0002-auth-clerk-jwt.md)). The sign-in screen is the only route that loads the
Clerk bundle, and it must never block the guest path.

| Topic | Reference |
|-------|-----------|
| `POST /sessions` for a registered player, `GET /me` | [api/accounts.md](../../02-reference/api/accounts.md) |
| `account` and `profile` columns | [data/accounts.md](../../02-reference/data/accounts.md) |
| Sign-in screen fields and states | [screens/sign-in.md](../../02-reference/screens/sign-in.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A valid Clerk session | `POST /api/v1/sessions` with the Clerk JWT | `201`, `subject.kind = "registered"`, and the session token's `sub` is the internal `account_id` — not the Clerk `sub` |
| AC2 | A first-ever sign-in | The same call completes | Exactly one `account` row and one `profile` row exist for that `clerk_user_id`, with `rating = 1200`, `rated_matches = 0` and a generated `display_name` |
| AC3 | A JWT signed by an unknown key, expired, or with `azp` outside the allowlist | `POST /sessions` is called | `401 unauthenticated`; nothing is written |
| AC4 | Clerk's JWKS endpoint is unreachable | A request with a cached key arrives | It succeeds from the cache; with no cache it returns `503` with `retryAfterSeconds`, never `500` |
| AC5 | The sign-in screen | An unauthenticated user opens `/sign-in` then taps the escape control | They return to `/` as a guest without an error (`TC-AUTH-137`) |
| AC6 | `returnTo=https://evil.example` | The sign-in completes | The redirect is ignored and the player lands on `/` (`TC-AUTH-138`) |
| AC7 | An unauthenticated request | Any Clerk-protected endpoint is called | `401` with the standard problem body; no redirect from the API |

## 4. Contract

`POST /api/v1/sessions` with `Authorization: Bearer <clerk jwt>`, body `{"kind":"registered"}` → `201` with
`subject: {kind: "registered", accountId, displayName, rating, avatarId}`.

`GET /api/v1/me` (Clerk JWT) → `200`:

| Field | Type | Notes |
|-------|------|-------|
| `accountId` | string | Internal UUID |
| `displayName` | string | 2–16 chars |
| `avatarId` | string | From the fixed set |
| `rating` | integer | Read-only here |
| `ratedMatches` | integer | — |
| `stats` | object | `{matches, wins, losses, damageDealt}` |
| `createdAt` | string | ISO-8601 |

Verification in `apps/worker/src/auth/clerk.ts`: `jose.jwtVerify` against `https://<clerk-domain>/.well-known/jwks.json`,
cached in module scope for 10 minutes; claims checked: `exp`, `nbf`, `azp` ∈ allowlist, `sub` present.

## 5. Rules and edge cases

- The Clerk `sub` never leaves the worker: every API response uses the internal `account_id`.
- The email address is never copied into D1, logs or error details (rule 06, `NFR-13`).
- `GET /me` is idempotent: it creates the rows on first call rather than failing on a missing profile.
- A user who deletes the Clerk account keeps the D1 rows for 30 days, then they are purged — `deletionScheduledFor` in
  the response tells the client.
- The worker trusts only tokens whose `iss` matches the configured Clerk instance.

## 6. Implementation notes

- `jose` for JWT verification; no Clerk SDK on the worker (smaller bundle, no Node-only APIs).
- The web client uses `@clerk/clerk-react` and calls `getToken()` per request; the match route never imports Clerk —
  it uses the session token from `/sessions` (`TC-PWA-139`).
- Cache the JWKS in the worker isolate and refresh on `kid` miss once, then fail closed.

## 7. Out of scope

- Profile editing ([US-AUTH-003](US-AUTH-003-edit-display-name-and-avatar.md)) and deletion ([US-AUTH-004](US-AUTH-004-delete-the-account.md)).
- Rating changes (RANK epic), password management (Clerk-hosted), SSO.

## 8. Test notes

`TC-AUTH-137`, `TC-AUTH-138`; worker tests use a locally generated RSA key pair plus a stubbed JWKS endpoint.
`TC-AUTH-074` (owned by [US-AUTH-001](US-AUTH-001-continue-as-a-guest.md)) also covers the registered branch of
`/sessions`. Red first: `tests/worker/sessions.test.ts::registered_session_creates_profile`.

## 9. Open questions

**OQ-26 — Clerk account, plan and PII handling** (open). This story cannot be finished on the recorded assumption:
it needs a named Clerk application owner, the plan (Hobby's 50,000 monthly retained users vs Pro), the configured
sign-in providers, and a privacy policy reachable before sign-in. When OQ-26 is answered, this story becomes `ready`
and the assumption text is replaced by the decided facts.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** code complete (`jose` JWKS verification, account/profile creation on first sign-in). Remaining step: a Clerk application with a publishable key, then `TC-AUTH-137/138` in a browser.
