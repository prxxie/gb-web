---
id: US-NET-002
title: Send inputs to the host and stream state back at 10 Hz
epic: EPIC-04-netplay
status: ready
priority: P0
size: M
depends_on: [US-NET-001, US-CORE-004]
open_questions: []
accepted_assumptions: [OQ-24, OQ-32]
refs: [02-reference/api/signaling.md, 01-overview/architecture.md, 01-overview/nonfunctional-requirements.md]
---

# US-NET-002 — Send inputs to the host and stream state back at 10 Hz

## 1. Story

**As a** peer
**I want** my shot applied by the host and its result streamed back
**so that** the match feels immediate and everyone sees the same trajectory.

## 2. Context

The host runs the only simulation. Peers send `input` with a monotonic `seq` on `control` and render from `snapshot`
messages on `state`, interpolating between the two most recent ones. There is no client prediction and no rollback in
v1 (`OQ-32`).

| Topic | Reference |
|-------|-----------|
| Input and snapshot messages | [api/signaling.md](../../02-reference/api/signaling.md) |
| Snapshot encoding | [US-CORE-004](../EPIC-03-match-core/US-CORE-004-encode-and-apply-snapshots.md) |
| NFR-02 touch latency, NFR-04 budget | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A peer on its turn | It fires | `input {kind:"fire", angle, force, facing, seq}` is sent on `control` and the host applies it to the next simulation step |
| AC2 | The host simulating | A turn resolves | A `snapshot` is sent to every connected peer at 10 Hz while a projectile is in flight and at 2 Hz while idle (`TC-NET-902`) |
| AC3 | A snapshot received by a peer | It is applied | The peer's rendered HP, turn and wind match the host's within 100 ms of the message (`TC-NET-902`) |
| AC4 | An input with a `seq` lower than the last one applied for that turn | It arrives | It is dropped without an error |
| AC5 | The `state` channel congested (`bufferedAmount > 64 KB`) | The next snapshot is due | It is dropped, not queued, and the following snapshot supersedes it |
| AC6 | A peer that never receives a snapshot for 2 s | The watchdog fires | The peer shows the reconnect overlay and requests a `snapshot_state` from the DO (`TC-ROOM-047`) |
| AC7 | A match in progress | The network is inspected | No snapshot exceeds 800 B and the host's uplink stays under 8 KB/s per peer (`TC-NET-902`) |

## 4. Contract

`input` (peer → host, `control`, reliable): `{t:"input", turn:number, seq:number, kind:"fire"|"skip", angle?:number, force?:number, facing?:1|-1}`.
`snapshot` (host → peers, `state`, unreliable): the `Snapshot` from `US-CORE-004` as JSON, plus `{t:"snapshot"}`.
`host_heartbeat` (host → peers, `state`, 1 Hz): `{t:"host_heartbeat", seq, hostGeneration, turnNumber}`.

Host loop: `requestAnimationFrame` at 60 Hz for simulation, a 100 ms interval for publishing, and an immediate publish
after each turn resolution.

## 5. Rules and edge cases

- The host applies at most one `fire` per `(slot, turn.number)`; later `seq` wins (`TC-CORE-045`).
- Interpolation is render-only: the peer never extrapolates projectile position, it draws between the last two snapshots.
- Snapshots are published immediately on turn resolution so the hit is not delayed by up to 100 ms.
- A peer's input during someone else's turn is rejected with `error unsupported-message` and does not affect state.
- `state` messages carry no chat and no events; those ride `control`.

## 6. Implementation notes

- `apps/web/src/net/session.ts` holds `GameSession` (host or peer role) with `applyInput`, `publishSnapshot`, `onSnapshot`.
- One shared `performance.now()`-based clock per device; `deadlineAt` comes from the host, not the local clock.
- Log a desync report (`stateHash` per side) at match end when host and submitted result disagree — see `US-RANK-001`.

## 7. Out of scope

- Client-side prediction and rollback (`OQ-32`: not in v1).
- Voice, spectators, replays.

## 8. Test notes

`TC-NET-902` (rate, size, latency of applied state), `TC-ROOM-047` (watchdog), `TC-CORE-045` (alias rule).
Playwright runs two contexts on one machine; the rate assertion samples 100 messages.

## 9. Open questions

- **OQ-24** (accepted assumption) — 10 Hz + 800 B fits the free tier and the reference phones.
- **OQ-32** (accepted assumption) — no rollback: a peer sees its own shot when the host's snapshot arrives (~1 RTT).
  If the client demands local prediction, this story splits and `conventions.md` § 9 gains a prediction contract.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**in-progress.** the 10 Hz / 2 Hz sender with the 64 KB guard is implemented; needs two browsers to measure.
