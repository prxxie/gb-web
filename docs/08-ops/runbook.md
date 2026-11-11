# Runbook

What to do when GBW misbehaves. Every row ends in a command or a named escalation — "investigate" is not an action.
Alert strings in the `Symptom` column are the literal text of the alert.

## 1. Service map

| Service | Where | Health check | Logs / metrics |
|---------|-------|--------------|----------------|
| Web (Pages) | `https://gbw-pages.pages.dev` | `curl -fsSI https://gbw-pages.pages.dev/` → `200`, `text/html` | Pages dashboard → Deployments; CF analytics |
| API (Worker) | `https://gbw-api.gbw-demo.workers.dev/api/v1` | `curl -fsS https://gbw-api.gbw-demo.workers.dev/api/v1/health` | `wrangler tail --env production`; Workers metrics (requests, errors, p95) |
| Rooms (Durable Object) | same Worker, class `Room` | `wrangler tail` filtered on `room.` events; `Room` metric in the dashboard | DO dashboard (requests, duration, storage) |
| D1 | `gbw` (production), `gbw-preview` | `wrangler d1 execute gbw --remote --command "select 1"` | D1 dashboard (reads/writes/day, size) |
| Clerk | dashboard | Sign-in card renders on `/sign-in` | Clerk dashboard → Sessions, Errors |
| TURN | Cloudflare dashboard | `GET /turn-credentials` with a valid token → `200` | TURN analytics (GB egress) |

These are the live hostnames today: the account has no zone, so the app and the API sit on their provider subdomains
rather than a shared domain (`deployment.md` § 1). A domain would replace the first two rows and nothing else.

## 2. Routine operations

| Task | Command / step |
|------|----------------|
| Deploy | push to `main` → approve `deploy-production.yml` (see `deployment.md`) |
| Tail the live worker | `pnpm exec wrangler tail gbw-api --format json` — **not** `--env production`, which asks the API for `gbw-api-production`, a worker that does not exist (the production environment keeps the plain name) |
| Roll back the Worker | `pnpm exec wrangler rollback --env production --message "rollback <REL>"` |
| Roll back Pages | Pages → Deployments → previous → *Rollback* |
| Apply migrations | `pnpm exec wrangler d1 migrations apply gbw-db --remote` |
| Inspect a room | `wrangler d1 execute` is wrong here — use `wrangler tail` and grep `room_code`; room state is in the DO, not D1 |
| Rotate the session secret | `wrangler secret put SESSION_TOKEN_SECRET --env production`, then expect every socket to reconnect once |
| Rotate the TURN key | Cloudflare dashboard → new key id/token → `wrangler secret put TURN_KEY_ID` and `TURN_KEY_API_TOKEN` |
| Delete a user on request | `DELETE /me` as the user; if they cannot sign in, Clerk dashboard *Delete user* then `wrangler d1 execute "delete from account where clerk_user_id = '…'"` |
| Purge expired `account.status='deleted'` rows | daily cron (story) runs `delete from account where status='deleted' and created_at < datetime('now','-30 day')` |

## 3. Backup and restore

| Item | Backup | Restore | Last tested |
|------|--------|---------|-------------|
| D1 `gbw-db` | `wrangler d1 export gbw-db --remote --output backup-$(date +%F).sql`, weekly + before any migration | `wrangler d1 execute gbw-db --remote --file backup-<date>.sql` into an empty database, then repoint the binding | not yet — first test at M2 (`OQ-34`) |
| DO room state | none (ephemeral by design); live matches cannot be restored | A lost room is restarted by its members creating a new room | n/a |
| Tunables / config | in git (`packages/core/src/tuning.ts`, `wrangler.jsonc`) | redeploy | continuous |
| Secrets | no backup: rotate instead | `wrangler secret put` | continuous |

## 4. Failure modes

| Symptom (alert text) | Diagnosis | Action |
|----------------------|-----------|--------|
| `api_5xx_rate > 1%` | Worker throwing — check `wrangler tail` for `problem+json` with `type` ending `internal` | Roll back if it started with the last deploy; otherwise read the top `detail`, fix forward, file an incident |
| `api_p95 > 800ms` | D1 daily limit or a missing index | `wrangler d1 execute … "select 1"` to confirm; if limits are hit, set the leaderboard cache to 60 s and announce degraded ranked play |
| `db_daily_writes > 80%` | Too many match submissions or a retry loop | Check `POST /matches` rate in the dashboard; a retry loop means the `409` idempotency path is broken |
| `do_errors > 0` | Durable Object exception | `wrangler tail` → stack in the log line; roll back the Worker if new; open a DO state bug |
| `room_stuck_no_snapshot` (no snapshot for 30 s during `playing`) | Host browser slept or lost network | Nothing to do server-side: grace (20 s) then host election; verify the election fired in `tail` |
| `ws_close_4401_spike` | Session token secret rotated, or clock skew | Confirm the rotation time; clients self-heal on reconnect; if skew, check the device clock note in FAQ |
| `cwv_lcp > 4s` on a cold load | Service worker cache cold + 5 MB bundle | Check the bundle report; defer audio, keep Phaser preload behind the main menu |
| `turn_credentials_429` | TURN API rate limit | Reduce credential refresh (they last 1 h); if the key is shared, issue the project's own key |
| `clerk_outage` (sign-in 5xx from Clerk) | Upstream | Post a status line; guests keep playing; ranked play is unavailable — say so in the lobby banner |
| `pages_deploy_failed` | Build error | Re-run after fixing; Pages keeps serving the previous build, so no user impact |
| `d1_size > 400MB` | History growth | Purge `rating_history` older than 24 months (retention policy `NFR-15`) |
| `abandon_rate > 30%` | Matches ending without a winner | Read `match_record.result` distribution; if the cause is disconnects, check `ws_close_*` codes before changing anything |

## 5. Escalation

| Severity | Definition | Who | Response |
|----------|------------|-----|----------|
| SEV-1 | Nobody can play, or data loss / security exposure | Tech lead + client contact (`OQ-35` — names pending) | Immediate; incident record opened within 15 min |
| SEV-2 | One flow degraded (ranked play, sign-in) | On-call developer | Same day |
| SEV-3 | Cosmetic or single-user issue | Backlog | Next sprint |

Client-facing communication is in Vietnamese, per the contract (`OQ-14`). An incident record
(`docs/08-ops/incidents/INC-…`) is opened for SEV-1/SEV-2 and closed with a postmortem within 3 working days
(`cpt-ops`).

## 6. Useful one-liners

```bash
# live errors only
pnpm exec wrangler tail --env production --format pretty --status error

# follow one room
pnpm exec wrangler tail --env production --search "room_code=K7M2QX"

# daily write headroom
pnpm exec wrangler d1 info gbw-db

# who is on the ladder
pnpm exec wrangler d1 execute gbw-db --remote --command \
  "select count(*) from profile where rated_matches >= 10"
```

<!-- rehearsal: second preview deploy so a rollback has somewhere to go -->

## 7. Traps that cost an afternoon

| Trap | What it looks like | What it is |
|------|--------------------|------------|
| Durable Objects free-tier quota | `POST /api/v1/rooms` answers `500 internal` with `Exceeded allowed volume of requests in Durable Objects free tier` in the tail, and **every** room fails, not a fraction | A plan limit, not a regression. The free tier's DO request budget is spent by load runs; it resets daily. A fifty-room run with a long soak spends it in minutes, so `US-OPS-003` AC2 (400 sockets for ten minutes) needs Workers Paid. |
| A quiet room billed ~600 requests a minute | `durableObjectsInvocationsAdaptiveGroups` shows a per-minute plateau that starts when the sockets drop and stops at the room's expiry, `wrangler tail` shows nothing, and no client is connected | `sweepAt` handed back an instant that had already passed, so the alarm re-armed itself and fired again immediately (`US-ROOM-011`). Fixed by clamping to `MIN_SWEEP_DELAY_MS`; the harness now clears the alarm before invoking the handler, the way workerd does. |
| A client-supplied `cf-connecting-ip` | `403` with a Cloudflare HTML body, and the worker's log shows nothing at all | Cloudflare's edge rejects that header before the request reaches the worker. Only `wrangler dev` trusts it, which is why the load test has a `--local` flag. |
| A `workflow_run` workflow reads the **default branch's** copy of itself | A workflow fix pushed on a pull-request branch has no effect on that pull request's own run | By design. The stamping fix for `VERSION` only took effect on preview after it merged to `main`. |
| `wrangler rollback` without a version id | It flips between the last two deployments, so a second call undoes the first | Pass the version id: `wrangler rollback <version-id> --env preview`. |

## 8. What a room costs

Measured on production 2026-11-11 with Cloudflare GraphQL, `durableObjectsInvocationsAdaptiveGroups` with
`dimensions { objectId }`, because that is the only place a Durable Object's requests can be attributed:

| Situation | Durable Object requests |
|---|---|
| One room, two seats, 60 s (before `US-ROOM-011`) | **6 451** |
| One room, two seats, 250 s (before `US-ROOM-011`) | **5 226** |
| 165 rooms × 5 minutes of load test, one hour (before) | **661 132** |
| The same room held open by a real browser, frames counted locally | 16 room frames/minute (8 `ping` + 8 `pong`) |

Almost none of that was game traffic. A room with no sockets and no frames sat at ~590–790 requests/minute — the alarm
spinning after `US-ROOM-011` — while the frames a real client sends are two orders of magnitude fewer.

After `US-ROOM-011` was deployed, the same one-room two-seat 60 s run was repeated (`ad84975`, room
`2c5467896693d0`):

| | Before | After |
|---|---|---|
| Whole life of a 60 s two-seat room | 6 451 requests | **120 requests** |
| Empty-room rate, sustained | ~590–790/minute | **12/minute** (one wake per `MIN_SWEEP_DELAY_MS`) |

What the free plan therefore buys, on the *fixed* numbers:

- **100 000 DO requests/day** and **13 000 GB-s/day** (128 MB per object ⇒ ~28 DO-hours of wall time).
- A room costs ~120–150 requests for its whole life, almost all of it the ten-minute idle tail, so the free plan carries
  roughly **600–800 rooms a day** — a demo, not a launch.
- The duration limit is not the binding one; requests are, by more than an order of magnitude.
- Load tests belong on Workers Paid or on `wrangler dev`: five runs in one day is what spent the free tier before the fix,
  and `US-OPS-003` AC2 (400 sockets for ten minutes) does not fit in the free budget at all.
- Next lever, not yet taken (`US-ROOM-012`): a room with nobody connected has exactly one future event — its idle expiry —
  so the sweep could be scheduled straight at that instant instead of every five seconds. That would take a room from
  ~120 requests to a handful, and the free plan to thousands of rooms a day.

