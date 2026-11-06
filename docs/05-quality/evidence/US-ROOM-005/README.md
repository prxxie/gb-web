# US-ROOM-005 — host election, automated run

Superseded on 2026-11-06 by the automated suites; the 2026-11-05 socket transcript below is kept as history.

## 2026-11-06 — what the story now stands on

- `apps/worker/tests/room-election.test.ts` — AC1/AC2/AC7: election by `joinedAt`, `hostGeneration` + 1, the
  `host_changed` payload (`hostPlayerId`, `hostGeneration`, `lastSnapshot`, `room`) and a second promotion down the
  roster (TC-ROOM-048); AC3: one retry, then `abandoned` (TC-ROOM-191); AC4: the replaced host returns as a plain
  player and its `snapshot_push` is refused with `not-host` (TC-ROOM-194); the survivor receives the promoted host's
  snapshot (TC-ROOM-061)
- `tests/e2e/migration.spec.ts` — AC5 (TC-ROOM-149) and AC6 (TC-ROOM-182), both green in the 2026-11-06 run
- Run: `pnpm test` 93 files / 781 cases green; `E2E_WEB_PORT=5273 npx playwright test` 49 cases green

## 2026-11-05 — local two-socket transcript (historical)

- Ran: two sockets in a `playing` room; the host socket was closed with `ws.close()`
- Transcript (`../US-ROOM-002/two-client.txt`): the remaining peer receives `host_changed` with `hostGeneration: 2`,
  `hostPlayerId` = the peer, and `lastSnapshot.seq: 1`; a reconnect then sees `host: true` and the replayed snapshot
- At the time, the oracle `tests/worker/room-election.test.ts` named by `docs/02-reference/api/signaling.md` did not
  exist; `apps/worker/tests/room-election.test.ts` does now and covers AC3, AC4 and AC7
