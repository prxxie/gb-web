---
id: US-ROOM-004
title: Survive a dropped connection with a 20-second grace window
epic: EPIC-02-rooms
status: done
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
| AC1 | A member in `playing` | Their socket closes | `connectionState` becomes `grace`, peers get `room_state`, and a 20 s alarm is armed (`TC-ROOM-127`, `TC-ROOM-202`) |
| AC2 | A member in `grace` | They reconnect with a valid token for the same subject within 20 s | They get their slot, team and `hp` from `lastSnapshot`, and peers see `connected` again (`TC-ROOM-184`, `TC-ROOM-201`, `TC-ROOM-203`) |
| AC3 | A member in `grace` | The 20 s alarm fires | `connectionState` becomes `disconnected`; their turns are skipped from then on (`TC-ROOM-185`, `TC-ROOM-200`) |
| AC4 | One of four players killed during a 2v2 | The match continues | The other three keep playing and the match reaches a winner (`TC-ROOM-059`, `TC-CORE-027`) |
| AC5 | A reconnecting player | They rejoin mid-match | Their rendered HP, active turn and wind equal the host's, observed in the same turn (`TC-ROOM-201`, `TC-ROOM-184`) |
| AC6 | Every member of one team `disconnected` | The turn clock next resolves | The match ends with `abandoned` for that team, and the result is `abandon` (`TC-ROOM-186`) |
| AC7 | A player on cellular | Their network is toggled off for 15 s and back | The turn skips while absent and play resumes on return without a reload (`TC-ROOM-200`, `TC-ROOM-174`, `TC-ROOM-175`, `TC-ROOM-176`, `TC-ROOM-177`) |

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
- `apps/web/src/net/host-clock.ts` `decideTurn` owns who advances the turn: a client always advances its own expired
  turn, the host additionally advances any expired turn and skips a slot the `room_state` reports as `grace` or
  `disconnected` (`apps/web/src/routes/MatchPage.tsx` applies the decision on a 500 ms tick and pushes the snapshot).
- `apps/web/src/net/resync.ts` `resyncFromSnapshot` is the one place a host snapshot lands in the local state, shared by
  the 10 Hz relay and the rejoin replay; it drops a snapshot whose `hostGeneration` is below the newest one seen.
- The overlay countdown reads the server's `deadlineAt`, not a local timer, so two devices show the same number.

## 7. Out of scope

- Migrating the host role — [US-ROOM-005](US-ROOM-005-elect-a-new-host-when-the-host-leaves.md).
- Restoring the peer-to-peer channels — EPIC-04.

## 8. Test notes

`TC-ROOM-127`, `TC-ROOM-184`, `TC-ROOM-185`, `TC-ROOM-202`, `TC-ROOM-203`, `TC-ROOM-186`, `TC-ROOM-059`, `TC-CORE-027`, `TC-ROOM-200`,
`TC-ROOM-201`, `TC-ROOM-174`–`TC-ROOM-177`.

Red: `apps/web/tests/host-clock.test.tsx` — the `TC-ROOM-200` cases were written against the turn-clock effect that only
advanced the local slot's expired turn, so a hosted match froze on a peer's deadline and an absent player held the match
for the whole 20 s grace window.

A 15 s network toggle on a real device stays a manual check (`docs/05-quality/evidence/US-ROOM-004/README.md`): the
browser cannot take a socket down and back up inside the grace window deterministically, and both halves of AC7 — the
skipped turn and the reload-free reconnect — are covered by the automated cases above.

## 9. Open questions

- **OQ-07** (accepted assumption) — reconnection restores state from the host's last snapshot rather than replaying
  inputs; the 20 s window and the team-scoped forfeit are the recorded defaults. If rollback-style replay is later
  required, this story is superseded rather than edited.

<!-- delivery:2026-11-06 -->

## Delivery status — 2026-11-06

**done.** The Durable Object half was already live: grace on close (`room-do.ts`), the 20 s alarm through one alarm
multiplexer, `TC-ROOM-127`/`184`/`185`/`186` and the team-scoped forfeit. What closed the story on the client was two
missing pieces: the `snapshot_state` replay was ignored by the match screen, and the turn clock only advanced the local
slot, so a guest's deadline froze a hosted match and never skipped an absent player. Both now live in
`apps/web/src/net/resync.ts` and `apps/web/src/net/host-clock.ts` with `TC-ROOM-200`/`TC-ROOM-201`.

Verified 2026-11-06: `pnpm test` 95 files / 797 cases, `npx playwright test` 49 cases, `pnpm lint`, `pnpm typecheck`,
`pnpm build`, `node .agents/scripts/verify-docs.mjs` all clean.
