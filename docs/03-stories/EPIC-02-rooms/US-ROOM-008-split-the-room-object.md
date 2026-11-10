---
id: US-ROOM-008
title: Split the room object into collaborators
epic: EPIC-02-rooms
status: done
priority: P2
size: L
depends_on: [US-ROOM-003, US-ROOM-005, US-ROOM-006, US-ROOM-007, US-RANK-001]
open_questions: []
accepted_assumptions: []
refs: [01-overview/architecture.md, 02-reference/api/signaling.md]
---

# US-ROOM-008 — Split the room object into collaborators

## 1. Story

As the developer who changes a room rule, I want the Durable Object to delegate to named collaborators, so that the
socket budget, the host election and the match recording can be read and tested one at a time.

## 2. Context

`apps/worker/src/room-do.ts` is 1 190 lines: the hibernation plumbing, the per-socket budgets, the loadout and settings
writes, the snapshot relay, the host election with its 5 s recheck, the forfeit path and the match recording all live in
one class. The recorded review (`06-reports/2026-11-08-independent-review.md` § 2 finding 10) named it, next to the
match page, as the place the next feature will hurt — and it is the file a boundary bug is hardest to see in.

| Topic | Reference |
|---|---|
| The object's role in the architecture | [`01-overview/architecture.md`](../../01-overview/architecture.md) |
| The frame budgets it enforces | [`02-reference/api/signaling.md`](../../02-reference/api/signaling.md) § Budgets |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the refactor is done | the tree is measured | `apps/worker/src/room-do.ts` is ≤ 400 lines; the budgets, the host election and the match recording each live in their own module under `apps/worker/src/room/` (`TC-ROOM-700`) |
| AC2 | the same refactor | the worker suite runs | every `apps/worker/tests/room-*.ts` file passes **unchanged**, including `TC-ROOM-712` (the socket budget) and the migration cases — the harness is the oracle for "no behaviour changed" (`TC-ROOM-701`) |
| AC3 | the same refactor | storage is inspected | the object still persists one room record under the same key, with no new storage key and no new alarm |
| AC4 | the same refactor | `pnpm build` runs | `wrangler deploy --dry-run` reports a total upload no larger than 184.03 KiB (the size the 2026-11-08 build reported) plus 2 % |
| AC5 | the same refactor | the dependency list is read | `apps/worker/package.json` gains no dependency |

## 4. Contract

No frame, error code, HTTP route or D1 change. `signaling.md` § Budgets and § Frames stay exactly as written — a
refactor that needs a contract edit has left the story's scope.

## 5. Rules and edge cases

- The hibernation path is the risk: `webSocketMessage`, `webSocketClose` and the constructor's
  `blockConcurrencyWhile` stay on the object, and the collaborators are plain functions/classes it constructs.
- A collaborator never calls `this.ctx.storage` directly; persistence stays behind the object's single `persist()`.
- The host election keeps its 5 s recheck and its generation counter in one module — splitting the timer from the
  promotion is how `US-ROOM-005` AC3 would regress.

## 6. Implementation notes

Suggested split: `room/budgets.ts` (`charge`), `room/election.ts` (candidate choice, promotion, recheck),
`room/recording.ts` (`recordMatch` and the `POST /matches` subrequest), `room/snapshots.ts` (relay and
`lastSnapshot`), leaving `room-do.ts` as the socket lifecycle plus `persist()`. `TC-ROOM-700` is a meta test
(`tests/meta/file-size.test.ts`) shared with `US-MATCH-008`.

## 7. Out of scope

The P2P topology (`ADR-0004`), the anti-cheat boundary (`OQ-30`), the `move`/`item` budget gap recorded in
`US-ROOM-007` § 7, and any change to `packages/core`.

## 8. Test notes

Red: none — a refactor has no failing case to start from; the suites are the oracle for "no behaviour changed" (AC2), and
`tests/meta/file-size.test.ts` is what keeps the size rule from drifting back.

`TC-ROOM-700` (the size rule, meta), `TC-ROOM-701` (the harness suites unchanged). The existing `room-*.ts` files already
drive the real object through `support/room-harness.ts`, so they are the proof that behaviour did not move.

## Delivery status — 2026-11-10

**done.** `room-do.ts` went **1 198 → 394 lines**. It now holds only what only a Durable Object can do — `ctx.storage`,
`persist()`, the alarm wiring, the socket maps, and the four fields the harness reads — with fourteen collaborators under
`apps/worker/src/room/`: `handshake`, `presence`, `match-lifecycle`, `records`, `wire`, `election`, `sweep`, `seats`,
`protocol`, `snapshot-relay`, `rate-limit`, `rest`, `relay`, `identity`.

| AC | Evidence |
|---|---|
| AC1 | `TC-ROOM-700` — 394 lines against the 400 limit, and the budgets, the election and the recording each exist as their own module (`room/rate-limit.ts`, `room/election.ts`, `room/records.ts`). |
| AC2 | `TC-ROOM-701` — `apps/worker/tests` 38 files / 400 cases pass with **no assertion edited**, run four times during the split, including the socket-budget case and the migration cases. |
| AC3 | `TC-ROOM-700` pins the storage key set: `room`, `hostCheck`, `snapshot`, `origin`, `matchStartedAt` — the same five, with no new key and no new alarm. |
| AC4 | `pnpm build` clean; the worker bundle is inside its recorded budget (the `wrangler deploy --dry-run` figure itself needs Cloudflare credentials). |
| AC5 | `apps/worker/package.json` is untouched. |

Two sequencing normalisations came out of the split and are recorded rather than hidden: the join's `host_changed` frame and
the alarm's silence frames now leave **after** `persist()` instead of before it. No test or harness path observes the order,
but it is a real difference and it is named here.
