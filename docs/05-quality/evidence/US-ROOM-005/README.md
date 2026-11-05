# US-ROOM-005 — host election, local run

- Ran: 2026-11-05, two sockets in a `playing` room; the host socket was closed with `ws.close()`
- Transcript (`../US-ROOM-002/two-client.txt`): the remaining peer receives `host_changed` with `hostGeneration: 2`,
  `hostPlayerId` = the peer, and `lastSnapshot.seq: 1`; a reconnect then sees `host: true` and the replayed snapshot
- Proves AC1 for the single-candidate case and AC2 for the broadcast shape
- Not proven: AC3 (retry then `abandoned`), AC4 (old host returns as peer and is refused `snapshot_push`), AC5 (lobby
  promotion badge), AC6 (two phones, force quit), AC7 (two promotions in a row)
- The oracle this story relies on, `tests/worker/room-election.test.ts` (named in `docs/02-reference/api/signaling.md`),
  does not exist — election has no automated test today
