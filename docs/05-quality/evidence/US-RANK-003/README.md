# US-RANK-003 — show my match history

Two halves: the read (`GET /me/matches`, worker) and the row the profile screen prints (web).

## Automated, 2026-11-07

| Criterion | Case | Where | What it asserts |
|-----------|------|-------|-----------------|
| AC1 | `TC-RANK-141` | `apps/worker/tests/history.test.ts` | 30 recorded matches, `?limit=20` → 20 newest first, `next_cursor` set, `has_more: true` |
| AC2 | `TC-RANK-142` | same | the cursor's page holds the other 10 in order, `has_more: false`, no repeat and no gap across 20 + 10 |
| AC3 | `TC-RANK-143` | same | the item of a lost, rated match: `result: "loss"`, `playerCount: 4`, own damage, negative `ratingDelta`, `ranked: true` |
| AC3, AC4 | `TC-RANK-152` | `apps/web/tests/profile.test.tsx` | the rendered row: `Thắng`, `2v2`, the opponents' names, `240 dmg`, `+16`; an unranked row prints `—` and the reason, never `+0` |
| AC4 | `TC-RANK-148` | `apps/worker/tests/history.test.ts` | unranked: `ranked: false`, `rankedReason: "ruleset_mismatch"`, `ratingDelta: null` |
| AC5 | `TC-RANK-149` | same | the whole response text contains no other `accountId` and no other rating; `opponents[]` entries are exactly `{displayName, team}` |
| AC6 | `TC-RANK-150` | same | `?accountId=` is ignored — the caller still reads their own row |
| § 5 | `TC-RANK-151` | same | a cursor the server did not mint is `400 bad-request` |

Run: `pnpm vitest run apps/worker/tests/history.test.ts apps/web/tests/profile.test.tsx` (14 + 11 cases).

## What was broken

1. **The row printed `Invalid Date` and a raw enum.** `apps/web/src/lib/api.ts`'s `HistoryItem` described
   `endedAt`/`opponentTeam`/`ratingBefore`/`ratingAfter`; the server sends `playedAt`/`opponents`/`ratingDelta`. The
   interface, the render and the copy keys are now the wire's.
2. **`playerCount`, `ranked` and `rankedReason` were read from the database and then dropped** on the way out of
   `myMatches`, so the row could print neither `2v2` nor why a match did not move a rating.
3. **The cursor was unsigned base64.** `US-RANK-003` § 5 calls it opaque *and* signed; it is now HMAC-SHA-256 over the
   payload with `SESSION_TOKEN_SECRET`, and an unsigned or edited cursor is `400 bad-request`.

## No browser walk

`/profile` requires a Clerk session (`screens/profile.md`: a guest is sent to `/sign-in`), and the local dev
environment has no Clerk instance, so the screen cannot be reached in a browser here. The rendered row is covered by
the jsdom case `TC-RANK-152`; a device check of the two-language copy is part of the UAT M2 pass, together with the
other phone checks (`TC-MATCH-927`, `TC-MATCH-934`, `TC-MATCH-935`, `TC-MATCH-938`, `TC-PWA-001` install).
