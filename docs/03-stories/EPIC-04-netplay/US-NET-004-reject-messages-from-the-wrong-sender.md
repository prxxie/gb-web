---
id: US-NET-004
title: Reject realtime messages the sender does not own
epic: EPIC-04-netplay
status: ready
priority: P1
size: S
depends_on: [US-NET-002]
open_questions: []
accepted_assumptions: [OQ-30]
refs: [01-overview/roles-and-permissions.md, 02-reference/api/signaling.md, 01-overview/nonfunctional-requirements.md]
---

# US-NET-004 — Reject realtime messages the sender does not own

## 1. Story

**As the** product owner
**I want** a peer to be unable to write state it does not own
**so that** one modified browser cannot rewrite HP, teams or results for everyone else.

## 2. Context

Authority is held by the host, and hosting is granted by the DO, not claimed by the client. The DO validates the
envelope, the sender's role and the room's status before relaying anything; peers validate incoming snapshots against
the current `hostGeneration`.

| Topic | Reference |
|-------|-----------|
| Who may send what | [roles-and-permissions.md](../../01-overview/roles-and-permissions.md) |
| Envelope, `not-host`, close codes | [api/signaling.md](../../02-reference/api/signaling.md) |
| NFR-11 server-side authZ | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A member with `role: "player"` | It sends `snapshot_push` | `error` with `code: "not-host"`, the DO's `lastSnapshot` is unchanged (`TC-NET-044`) |
| AC2 | A member | It sends `input` for a slot that is not its own, or while not active | `error unsupported-message`, no relay, no state change (`TC-NET-067`) |
| AC3 | A member | It sends any message before `auth`, or after `4409` (room full) | The socket is closed with the documented code and no member exists |
| AC4 | A peer | It receives a snapshot whose sender is not the current host | The snapshot is dropped and counted in a `rejected_snapshot` counter |
| AC5 | A client that edits its own `playerId` in a message | The message is sent | The DO uses the authenticated identity from `auth`, never the envelope's claim, so the message is attributed to the real sender |
| AC6 | Any rejected message | It is logged | One structured line with `request_id`/`room_code`, `code`, `player_id` and no payload content (`NFR-24`) |

## 4. Contract

Validation table (DO, before relay):

| Message | Allowed sender | Allowed status | Rejection code |
|---------|----------------|----------------|----------------|
| `signal` | any connected member | `lobby`, `playing` | `peer-not-connected` |
| `team_assign` | host | `lobby` | `not-host`, `invalid-state` |
| `start_match` | host | `lobby` + guards | `not-host`, `invalid-state`, `room-not-full`, `not-enough-players`, `teams-not-balanced` |
| `input` | the active slot | `playing` | `unsupported-message` |
| `chat` | any connected member | `playing`, `lobby` | `rate-limited` |
| `snapshot_push` | host | `playing` | `not-host`, `invalid-state`, `snapshot-too-large` |
| `match_end` | host | `playing` | `not-host`, `invalid-state` |

Every code in this table comes from the [error catalogue](../../02-reference/api/README.md#error-catalogue); a code
invented here and absent there is a defect in this story, not in the catalogue.

Identity: `playerId` is bound at `auth` to the socket; every later message is attributed to that identity regardless of
any `playerId` field in the payload.

## 5. Rules and edge cases

- A rejection never closes the socket unless the envelope is unparseable twice in a row.
- The DO does not attempt to validate physics — a tampered host is a plausibility problem at result submission (`OQ-30`).
- Rate limits: `chat` 2/s per member, `signal` 20/s per member; exceeding them yields `rate-limited` and a 1 s mute.
- Errors are sent to the offending socket only; peers see nothing.
- The web client treats `not-host` as a signal to drop its host role locally and re-read `room_state`.

## 6. Implementation notes

- `apps/worker/src/room/validate.ts`: a pure `validateMessage(room, member, msg): Rejection | null`.
- Table-driven tests: one row per rule in the table above.

## 7. Out of scope

- Anti-cheat of the simulation itself (`OQ-30`, `US-RANK-001`).
- Server-side simulation (rejected in ADR-0004).

## 8. Test notes

`TC-NET-044`, `TC-NET-067`, plus the table as `apps/worker/tests/room-validate.test.ts`. Red first:
`apps/worker/tests/room.test.ts::peer_cannot_push_snapshot`.

## 9. Open questions

- **OQ-30** (accepted assumption) — a host that tampers with its own simulation is only caught by result plausibility
  checks; real prevention needs server-side simulation, which the 10 ms CPU limit forbids.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** `validateMessage` is implemented; the rejection paths run inside the Durable Object.
