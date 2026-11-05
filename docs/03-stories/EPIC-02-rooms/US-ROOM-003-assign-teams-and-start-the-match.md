---
id: US-ROOM-003
title: Assign teams and start the match only when they are balanced
epic: EPIC-02-rooms
status: ready
priority: P0
size: S
depends_on: [US-ROOM-002]
open_questions: []
accepted_assumptions: []
refs: [02-reference/api/signaling.md, 01-overview/workflow-state-machine.md, 02-reference/screens/lobby.md]
---

# US-ROOM-003 — Assign teams and start the match only when they are balanced

## 1. Story

**As the** host
**I want** to move players between two teams and start when they are equal
**so that** a 2v2 never begins with three players on one side.

## 2. Context

Teams are host-assigned (`OQ-16`) and the start rule is the lobby's only hard gate: equal, non-empty teams
([workflow-state-machine.md](../../01-overview/workflow-state-machine.md#1-room-lifecycle-roomstatestatus)). Both actions are DO messages,
never HTTP, because they must be ordered with roster changes.

| Topic | Reference |
|-------|-----------|
| `team_assign`, `start_match` | [api/signaling.md](../../02-reference/api/signaling.md) |
| Room status transitions and guards | [workflow-state-machine.md](../../01-overview/workflow-state-machine.md) |
| Lobby start control | [screens/lobby.md](../../02-reference/screens/lobby.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A host and at least two members | The host sends `team_assign {playerId, team}` | Every member receives the new `room_state` and `team` is `A` or `B` (`TC-ROOM-148`) |
| AC2 | A non-host member | `team_assign` is sent | `error` with `code: "not-host"` and the roster is unchanged (`TC-ROOM-066`) |
| AC3 | Four members, 2 on `A` and 2 on `B` | The host sends `start_match` | `match_started` is broadcast and `status` becomes `playing` |
| AC4 | Three members with 2 on `A` and 1 on `B`, or any member with `team: null` | `start_match` is sent | `error` `teams-not-balanced`, `status` stays `lobby`, and the UI keeps Start disabled (`TC-ROOM-148`) |
| AC5 | A room in `playing`, `ended` or `abandoned` | `team_assign` or `start_match` is sent | `error` `invalid-state`, no state change (`TC-ROOM-162`) |
| AC6 | Any message that would break the transition | It is sent | The DO rejects it with no partial side effect — no half-applied roster, no `hostGeneration` bump |

## 4. Contract

`team_assign` (host only): `{"t":"team_assign","assignments":[{"playerId":"<id>","team":"A"|"B"|null}, …]}` — the
whole roster in one frame, so the room can never be seen half-assigned.
`start_match` (host only): `{"t":"start_match"}` → every member receives `match_started` as specified in
[signaling.md](../../02-reference/api/signaling.md) (§ Room socket — DO → client):
`{"t":"match_started","startedAt":<epoch ms>,"seed":<uint32>,"hostPlayerId":…,"hostGeneration":…,"rulesetVersion":…,"assignments":[…],"room":…}`.

Guards: `status == "lobby"`, `members.length >= 2`, `members.length == maxPlayers` (every slot filled), teams equal in
size and non-empty. The UI mirrors exactly these guards; the DO is the authority.

## 5. Rules and edge cases

- Filling every slot is required: an 8-slot room starts with 8 players. The host chooses `maxPlayers` at creation
  ([US-ROOM-001](US-ROOM-001-create-a-room-with-a-shareable-code.md)), so this is a choice, not a surprise.
- `team: null` means "unassigned" and blocks the start.
- A member who leaves during `lobby` leaves a hole that must be refilled before starting.
- `turnOrder` is never transmitted: the order is the roster's `assignments` sorted by `slot`, and the turn engine
  advances by the mode's rules (`nextSlotForMode` in `packages/core/src/turn.ts`) reading the snapshot's `turn`. One
  source of order, so a peer cannot disagree with the host about whose turn it is. `StartOutcome.turnOrder`
  (`packages/core/src/room.ts:203`) is the last copy of the concept and is deleted with the dead `action=start` path.
- `seed` is a `uint32` from the DO's CSPRNG; the core simulation is deterministic on it (`NFR-22`), and every client
  derives weather and spawns from it rather than being told them separately.

## 6. Implementation notes

- Guard function `canStart` lives in `packages/core/src/room.ts:191` (`StartRejection` at `:189`) and is unit-tested
  without a socket; the DO only maps its verdict to the catalogue codes.
- `start_match` sets `matchStartedAt`, freezes team assignment for the remainder of the match, and starts the turn clock
  alarm.

## 7. Out of scope

- Turn order enforcement and the clock — [US-CORE-002](../EPIC-03-match-core/US-CORE-002-resolve-turns-and-the-clock.md).
- Rebalancing teams mid-match (not possible in v1).

## 8. Test notes

`TC-ROOM-148`, `TC-ROOM-066`, `TC-ROOM-162`. `apps/worker/tests/room-rules.test.ts` covers the guard matrix directly;
`tests/e2e/lobby.spec.ts::start_disabled_until_balanced` covers the UI. Red first:
`apps/worker/tests/room-rules.test.ts::unbalanced_teams_rejected`.

## 9. Open questions

None. Team assignment by the host is decided (`OQ-16`).

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** team assignment, the start guards and `match_started` ordering are implemented; `canStart`/`startMatch`/`setTeam` are covered by `packages/core/tests/room.test.ts`
