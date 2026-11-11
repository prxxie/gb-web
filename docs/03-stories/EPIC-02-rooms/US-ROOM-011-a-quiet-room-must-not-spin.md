---
id: US-ROOM-011
title: A quiet room must not spin on its own alarm
epic: EPIC-02-rooms
status: done
priority: P0
size: S
depends_on: [US-ROOM-005]
open_questions: []
accepted_assumptions: []
refs: [08-ops/runbook.md]
---

# US-ROOM-011 — A quiet room must not spin on its own alarm

## 1. Story

**As the** operator paying for Durable Object requests

**I want** a room with nobody in it to wake only when something can actually change

**so that** an idle room costs a handful of requests instead of thousands, and the free tier is spent on players rather
than on an alarm that re-arms itself.

## 2. Context

Found while explaining why a single day of load testing exhausted the free tier: production showed **661 132** DO requests
in one hour for 165 rooms, and a controlled run of **one** room (two seats, 60 s) billed **6 451** requests.

Attribution, measured 2026-11-11:

- `wrangler tail` on the production worker: **zero** events for the whole run — the traffic never enters a Worker handler.
- Cloudflare GraphQL `durableObjectsInvocationsAdaptiveGroups` with `dimensions { objectId }`: four objects, 14 213 requests
  in total, dominated by the rooms that had been created.
- Per-minute series: a steady **~590–790 requests/minute** that starts when the sockets drop and **stops exactly when the
  room expires** ten minutes later. During that window the room has no sockets and receives no frames.

The cause is in `alarm()`. Cloudflare clears the alarm before invoking the handler, and `sweepAt` returns
`lastActivityAt + 60_000` for a lobby — an instant that is already in the past once the sweep is overdue. `setAlarm` accepts
a past instant, so each alarm re-arms at the same past instant and fires again immediately: a spin at the rate the platform
will schedule, ~10 wakes/second, for the whole idle window.

`US-ROOM-001`'s harness could not catch it because `FakeStorage` kept the fired alarm in place; workerd does not.

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | a lobby whose sockets have all dropped | the sweep is overdue by more than a minute | The next wake is at least `MIN_SWEEP_DELAY_MS` ahead of now, never the instant that already passed (`TC-ROOM-716`) |
| AC2 | the same quiet lobby | the ten-minute idle window runs out | The clamp does not postpone the expiry: the alarm closes the room and leaves no alarm behind (`TC-ROOM-717`) |
| AC3 | a room left alone for the whole idle window | its alarms are played in order | The room wakes at most once per `MIN_SWEEP_DELAY_MS` — bounded, not one wake per event-loop turn (`TC-ROOM-718`) |

## 4. Contract

```ts
/** The least time a sweep may wait. A clamp, not a schedule: the sweep's own decisions are unchanged. */
export const MIN_SWEEP_DELAY_MS = 5_000;

export function sweepAt(room: RoomState, openSockets: number, now: number): number | null;
```

`setAlarmIfSooner` keeps its "never later" policy — it is what protects the 24 h match cap — so the clamp belongs where
the instant is chosen, not where it is stored.

## 5. Rules and edge cases

- A room with an open socket still schedules nothing (`sweepAt` returns `null`); the spin only ever existed for rooms whose
  sockets were gone, which is also why a lobby with players in it looked healthy.
- The clamp is the same for both windows: a lobby's 60 s sweep and an ended room's idle window.
- An alarm that closes the room still deletes its storage and closes its sockets, and returns without re-arming.
- `MIN_SWEEP_DELAY_MS` is a floor on waiting, not a heartbeat: a room that receives real frames keeps scheduling as before.

## 6. Implementation notes

- `apps/worker/src/room/protocol.ts` — `MIN_SWEEP_DELAY_MS`, with the measurement in the docstring.
- `apps/worker/src/room/sweep.ts` — `sweepAt` takes `now` and returns `Math.max(due, now + MIN_SWEEP_DELAY_MS)`.
- `apps/worker/src/room-do.ts` — `scheduleSweep` passes `Date.now()`.
- `apps/worker/tests/support/room-harness.ts` — `alarm()` now clears the alarm before invoking the handler, as workerd
  does. Without that fidelity the harness would keep hiding this class of bug.
- `docs/08-ops/runbook.md` § 7/§ 8 — the measured cost per room and the plan numbers.

## 7. Out of scope

- Cutting the per-wake cost further (hibernation tuning, `setWebSocketAutoResponse` for the client's `ping`). The measured
  floor after this fix is what those would improve, and they need their own before/after numbers.
- The load test's habit of holding sockets that never ping: the silence sweep drops them at 45 s by design (`US-ROOM-002`
  AC4), which is what made the spin reachable in a soak.

## 8. Test notes

`apps/worker/tests/room-alarm-budget.test.ts` drives the real object through `RoomHarness` with fake timers: it plays the
room's own clock — each alarm wakes it and the next one is whatever it asked for — and asserts that no wake is ever at or
before the instant that fired it.

Red: `apps/worker/tests/room-alarm-budget.test.ts` before the fix —
`expected 1700000055000 to be greater than 1700000180000` (an alarm 125 s in the past)
and, in the played-clock case, `an alarm was re-armed at or before the instant it fired: expected 1700000055000 to be
greater than 1700000060000`.

## 9. Open questions

None.

<!-- delivery:2026-11-11 -->

## Delivery status — 2026-11-11

**done.** Unit-verified only at the time of writing: the three cases above pass, and the full suite is green. The
production re-measurement (one room, two seats, 60 s soak, `objectId` attribution) is the number that closes the claim
about cost, and it is recorded in `docs/08-ops/runbook.md` § 8 once it has been run against the deployed fix.
