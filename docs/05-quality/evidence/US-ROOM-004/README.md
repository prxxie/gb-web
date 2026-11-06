# US-ROOM-004 — grace window, reconnect and turn skipping, automated run

The story closed on 2026-11-06 on the automated suites below. One device check remains manual and is listed at the end;
it is the only part of AC7 a headless browser cannot take reliably.

## 2026-11-06 — what the story stands on

- `apps/worker/tests/room-election.test.ts` — AC1: a socket close reports `peer_left {reason:"grace"}` and arms the 20 s
  alarm (TC-ROOM-127); AC2: a reconnect 19 s into the window returns on the same slot and team with the `hp` from
  `lastSnapshot` (TC-ROOM-184); AC3: a window that runs out flips the seat to `disconnected` in the room, and peers hear
  `peer_left {reason:"disconnected"}` (TC-ROOM-185); the returning client is re-sent `snapshot_state` (TC-ROOM-061)
- `apps/worker/tests/room-forfeit.test.ts` — AC1 (TC-ROOM-127, the silent-socket variant) and AC6 (TC-ROOM-186, a team
  with nobody left forfeits and the record is written `abandoned`)
- `packages/core/tests/room.test.ts` `TC-ROOM-059` — AC4/AC6: only a whole team losing its connection forfeits, and the
  remaining members keep playing
- `packages/core/tests/combat.test.ts` `TC-CORE-027` — AC4: friendly fire kills a team mate and the match still reaches a
  winner
- `apps/web/tests/host-clock.test.tsx` `TC-ROOM-200` — AC3/AC7: the turn of a slot in `grace` or `disconnected` is skipped
  at the next tick instead of waiting out its clock; a guest never advances a remote turn but still advances its own
  expired one
- `apps/web/tests/resync.test.tsx` `TC-ROOM-201` — AC2/AC5: a replayed `snapshot_state` lands the host's hp, active slot
  and wind on the returning client, and a snapshot from a superseded `hostGeneration` is dropped
- `apps/web/tests/reconnect.test.tsx` `TC-ROOM-174`–`TC-ROOM-177` — AC7: the socket retries 0.5/1/2/4 s inside the window,
  gives up at its end, and the page never reloads to do it
- Run (2026-11-06): `pnpm test` 95 files / 797 cases green; `E2E_WEB_PORT=5274 npx playwright test` 49 cases green;
  `pnpm lint`, `pnpm typecheck`, `pnpm build` and `node .agents/scripts/verify-docs.mjs --fix` clean

## Manual check — AC7 on a real device (not yet performed)

Two phones in one room, both `playing`, on different networks (one on cellular).

1. Host shoots; while the guest's turn is live, toggle the guest's cellular off for 15 s.
2. Expect the guest's page to show the reconnecting overlay and the host to see the guest's turn skipped inside a couple
   of seconds — the match keeps moving.
3. Toggle the network back on. Expect the guest's overlay to clear without a reload, the HUD to show the host's current
   hp, active slot and wind, and the match to continue on the same slot.

Record the result here with the device pair and the date when it is run; it rides with the M2 UAT device pass
(`docs/05-quality/acceptance-signoff.md`).
