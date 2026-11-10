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
