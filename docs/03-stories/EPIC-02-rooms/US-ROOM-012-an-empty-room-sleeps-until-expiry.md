---
id: US-ROOM-012
title: A room with nobody in it should sleep until its expiry
epic: EPIC-02-rooms
status: ready
priority: P2
size: S
depends_on: [US-ROOM-011]
open_questions: []
accepted_assumptions: []
refs: [08-ops/runbook.md]
---

# US-ROOM-012 — A room with nobody in it should sleep until its expiry

## 1. Story

**As the** operator paying per Durable Object request

**I want** an empty room to be woken once, at the instant it expires

**so that** the ten-minute idle tail costs a couple of requests instead of a hundred and twenty.

## 2. Context

`US-ROOM-011` stopped the spin: a quiet room went from ~590–790 requests a minute to 12, one per `MIN_SWEEP_DELAY_MS`. That
clamp is a safety net, not a schedule — it keeps waking every five seconds through the whole ten-minute idle window, which
is where ~120 of a room's ~130 requests now go (`docs/08-ops/runbook.md` § 8).

With no sockets and no traffic, a room has exactly **one** future event that it can predict: the idle expiry
(`lastActivityAt + roomIdleMs`). Nothing else can change without an inbound socket or HTTP call, and both of those wake
the object directly rather than through an alarm. `sweepAt` still answers `lastActivityAt + 60_000` for a lobby whose
members are merely disconnected, which is an instant that has already passed — the clamp then turns it into a five-second
poll.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a room whose sockets are all gone and whose grace windows have run out | the next wake is chosen | It is the idle expiry instant itself, not `now + MIN_SWEEP_DELAY_MS` (`TC-ROOM-719`) |
| AC2 | the same room | the expiry alarm fires | The room closes, deletes its storage and leaves no alarm — the sleep must not overshoot the close (`TC-ROOM-720`) |
| AC3 | a room with a member in its grace window | the next wake is chosen | It is the grace deadline, and the lobby's sixty-second sweep still applies once the roster empties (`TC-ROOM-721`) |

## 4. Contract

`sweepAt(room, openSockets, now)` answers *the next instant at which a sweep could change something*: the grace deadline
while anyone is in grace, the lobby's sixty-second mark once the roster is empty, the idle expiry otherwise — and never
before `now + MIN_SWEEP_DELAY_MS`.

## 5. Rules and edge cases

- An inbound frame, a socket upgrade or a REST call wakes the object on its own; a sleeping room is not a deaf room.
- The 24 h match cap is a separate alarm and still wins when it is sooner (`setAlarmIfSooner`).
- This must not weaken `US-ROOM-002` AC4: a seat that stops answering is still noticed, because the silence sweep is armed
  by a `ping` and by the disconnect path, not by this idle schedule.

## 6. Implementation notes

- `apps/worker/src/room/sweep.ts` — `sweepAt` gains the grace and expiry branches.
- `apps/worker/tests/room-alarm-budget.test.ts` — new cases beside `TC-ROOM-716..718`, which stay green.

## 7. Out of scope

- Hibernation tuning and `setWebSocketAutoResponse` for the client's `ping`: those change the cost while sockets are
  **open**, which is a different measurement.

## 8. Test notes

Same harness, same played clock: count the wakes across a room's whole life and assert it is a handful rather than one per
clamp interval. Red: `apps/worker/tests/room-alarm-budget.test.ts` — a quiet room currently wakes ~120 times, which the
`TC-ROOM-718` bound allows.

## 9. Open questions

None.
