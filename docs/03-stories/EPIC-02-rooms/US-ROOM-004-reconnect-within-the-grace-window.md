---
id: US-ROOM-004
title: Survive a dropped connection with a 20-second grace window
epic: EPIC-02-rooms
status: ready
priority: P1
size: M
depends_on: [US-ROOM-002]
open_questions: []
accepted_assumptions: [OQ-07]
refs: [02-reference/data/room-state.md, 01-overview/workflow-state-machine.md, 01-overview/nonfunctional-requirements.md]
---

# US-ROOM-004 — Survive a dropped connection with a 20-second grace window

## 1. Story

**As a** player on a train
**I want** my slot and my HP to wait for me when the network drops
**so that** one handover does not end a 6-minute match.

## 2. Context

`connectionState` is a three-state machine per member: `connected → grace (20 s) → disconnected`
([workflow-state-machine.md](../../01-overview/workflow-state-machine.md#3-connection-per-memberconnectionstate)). Nobody forfeits until a
whole team is disconnected, which is the difference between a bad network and a rage-quit.

| Topic | Reference |
|-------|-----------|
| `connectionState`, `lastSnapshot`, alarms | [data/room-state.md](../../02-reference/data/room-state.md) |
| Connection state machine | [workflow-state-machine.md](../../01-overview/workflow-state-machine.md) |
| NFR-07, NFR-08 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A member in `playing` | Their socket closes | `connectionState` becomes `grace`, peers get `room_state`, and a 20 s alarm is armed (`TC-ROOM-127`) |
| AC2 | A member in `grace` | They reconnect with a valid token for the same subject within 20 s | They get their slot, team and `hp` from `lastSnapshot`, and peers see `connected` again (`TC-ROOM-046`) |
| AC3 | A member in `grace` | The 20 s alarm fires | `connectionState` becomes `disconnected`; their turns are skipped from then on (`TC-ROOM-047`) |
| AC4 | One of four players killed during a 2v2 | The match continues | The other three keep playing and the match reaches a winner (`TC-ROOM-055`) |
| AC5 | A reconnecting player | They rejoin mid-match | Their rendered HP, active turn and wind equal the host's, observed in the same turn (`TC-ROOM-056`) |
| AC6 | Every member of one team `disconnected` | The turn clock next resolves | The match ends with `abandoned` for that team, and the result is `abandon` (`TC-ROOM-059`) |
| AC7 | A player on cellular | Their network is toggled off for 15 s and back | The turn skips while absent and play resumes on return without a reload (`TC-ROOM-181`) |

## 4. Contract

Member state fields (from `room-state.md`): `connectionState: "connected" | "grace" | "disconnected"`.

On reconnect the DO sends `room_state` followed immediately by a `host_changed`-shaped `snapshot_state` message
carrying `lastSnapshot` (the same payload the host would send), so a reconnecting peer never waits a full turn:

```json
{"t":"snapshot_state","seq":42,"turn":{"activeSlot":2,"number":17,"deadlineAt":"..."},
 "players":[{"slot":0,"hp":72,"x":400.5,"y":1000,"facing":1,"eliminated":false}],
 "projectiles":[],"wind":0.03}
```

## 5. Rules and edge cases

- The grace timer is per member and survives a DO restart via the alarm timestamp stored in `ctx.storage`.
- Reconnecting with a different subject creates a new member only if a slot is free; the old one stays `grace` until
  its timer fires.
- A player may reconnect as many times as they like; each drop restarts the 20 s window.
- `lastSnapshot` is the only source of truth for HP on reconnect — the DO never simulates.
- Forfeit is team-scoped: one disconnected member of a 2-player team does not end the match while the teammate is
  connected.
- Skipping turns must not desync the local clock: the host's snapshot carries `deadlineAt`.

## 6. Implementation notes

- One alarm multiplexer: `alarm()` looks at the earliest of sweep, grace and turn deadlines and re-arms for the next.
- `apps/web/src/net/reconnect.ts` retries the socket with backoff 0.5/1/2/4 s inside the 20 s window, then stops and
  shows the "disconnected" overlay.
- The overlay countdown reads the server's `deadlineAt`, not a local timer, so two devices show the same number.

## 7. Out of scope

- Migrating the host role — [US-ROOM-005](US-ROOM-005-elect-a-new-host-when-the-host-leaves.md).
- Restoring the peer-to-peer channels — EPIC-04.

## 8. Test notes

`TC-ROOM-127`, `TC-ROOM-046`, `TC-ROOM-047`, `TC-ROOM-055`, `TC-ROOM-056`, `TC-ROOM-059`, `TC-ROOM-181`.
`tests/e2e/reconnect.spec.ts` toggles the second context's network with `context.setOffline(true)`.

## 9. Open questions

- **OQ-07** (accepted assumption) — reconnection restores state from the host's last snapshot rather than replaying
  inputs; the 20 s window and the team-scoped forfeit are the recorded defaults. If rollback-style replay is later
  required, this story is superseded rather than edited.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the 20-second grace window, `markDisconnected` and the forfeit rule are implemented and unit-tested; the alarm-driven reconnect path needs a running Durable Object.
