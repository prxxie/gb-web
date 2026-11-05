# API — accounts and sessions

Identity is Clerk's; this API mirrors what the game needs ([ADR-0002](../../04-decisions/adr/ADR-0002-auth-clerk-jwt.md)).
D1 columns are in [data/accounts.md](../data/accounts.md).

## POST /sessions

Mints the 60-minute session token used by the WebSocket and TURN calls. Two modes in one endpoint:

| Mode | Credential | Result |
|------|-----------|--------|
| Registered | `Authorization: Bearer <clerk_jwt>` | Session token bound to `accountId` |
| Guest | none, or `Authorization: Bearer <guest_jwt>` returned earlier | Session token bound to `guestId` |

Request body (optional in both modes):

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `displayName` | string | no | Guest display name, 2–16 chars; default `Khách` / `Guest` by locale |
| `guestId` | string (uuid) | no | Reuse an existing guest identity from `localStorage`; minted when absent |

```json
{ "guestId": "0b0d…", "displayName": "Bao" }
```

Response `201`:

| Field | Type | Meaning |
|-------|------|---------|
| `sessionToken` | string | HMAC-signed JWT, 60 min, claims `{ sub, kind, exp }` |
| `expiresAt` | string | ISO-8601 expiry |
| `subject.kind` | enum | `account` \| `guest` |
| `subject.id` | string | `accountId` or `guestId` |
| `displayName` | string | Effective name for the lobby |
| `rating` | integer \| null | Present only for `account` |
| `wsUrl` | string | Base `wss://` URL (the room code is appended) |

Rules: a registered caller's first request creates the `account` + `profile` rows in one transaction; a guest gets no
server-side record at all. Errors: `401 unauthenticated` (invalid Clerk JWT), `422 validation`, `429 rate-limited`
(30/min per IP).

## GET /me

Auth: Clerk JWT. Response `200`:

| Field | Type | Meaning |
|-------|------|---------|
| `accountId` | string | — |
| `displayName` | string | — |
| `avatarId` | string | From the fixed avatar set |
| `rating` | integer | Elo |
| `ratedMatches` | integer | Count used for K-decay |
| `stats.wins` / `.losses` / `.abandons` | integer | Aggregate over `match_player` |
| `createdAt` | string | — |
| `deletionScheduledFor` | string \| null | Set when deletion was requested |

Never returns `clerk_user_id`, an email, or another account's id. Errors: `401 unauthenticated`.

## PATCH /me

Auth: Clerk JWT. Request body (at least one field):

| Field | Type | Rule | Error |
|-------|------|------|-------|
| `displayName` | string | 2–16 chars after trim; normalised `display_name_key` must be free; no reserved names; vi/en profanity check | `422 validation`, `409 display-name-taken` |
| `avatarId` | string | Must exist in the avatar allowlist | `422 validation` |

Response `200`: the `GET /me` representation. `rating`, `ratedMatches` and `stats` are **not** writable — a body
containing them is ignored, and the response proves it (TC-AUTH-102). Optimistic concurrency is not needed: the last write of
one's own name wins (`conventions.md`).

## DELETE /me

Auth: Clerk JWT. Deletes the Clerk user, sets `account.status = 'deleted'`, and schedules the D1 purge for
`now + 30 days` (`NFR-13`). Response `204` with no body.

Rules: a player with a match in progress gets `409 room-closed`-style refusal — concretely `409` with
`type: .../forbidden` and detail "finish or leave the match first". Rating history rows are anonymised rather than
deleted during the 30-day window so other players' deltas stay reconstructable.

## GET /me/matches

See [matches.md](matches.md#get-mematches).

## Privacy surface

`GET /me` is the export: it contains everything D1 holds about the caller. Clerk holds the email and is exported through
Clerk's own user data export (`OQ-26`). No endpoint returns another player's account id — the leaderboard exposes a
public handle (`displayName` + `accountId` only inside match history of one's own matches).

## Oracle

| Contract | Checked by |
|----------|-----------|
| Guest and registered modes, token claims and TTL | `apps/worker/tests/sessions.test.ts` (TC-AUTH-074) |
| First call creates exactly one account + profile | `apps/worker/tests/auth.test.ts` (TC-AUTH-074) |
| `PATCH /me` rejects `rating`, `409` on duplicate names | `apps/worker/tests/profile.test.ts` (TC-AUTH-101, TC-AUTH-102) |
| `DELETE /me` removes Clerk user and schedules the purge; refuses mid-match | `apps/worker/tests/deletion.test.ts` (TC-AUTH-103) |
| No identity leak in responses | `apps/worker/tests/schema-whitelist.test.ts` (TC-AUTH-075) |
