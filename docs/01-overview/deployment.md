# Deployment

Two long-lived environments and one per pull request. There is **no staging**: preview deploys plus the M1/M2 gates carry
that role `[user: interview R4 environments]`.

## 1. Environments

| Environment | Web | API + DO | D1 | Clerk | TURN | Purpose |
|-------------|-----|----------|----|-------|------|---------|
| `local` | `vite` on :5173 | `wrangler dev` on :8787 (miniflare) | local SQLite | Clerk test instance | not used | Development and all automated tests |
| `preview` | Pages preview URL per PR | Worker `preview` version (`wrangler versions upload`) | `gbw-db-preview` | Clerk test instance | test key | QA on real phones, UAT (`M2`) |
| `production` | `https://gbw.<domain>` (Pages custom domain) | Worker `production` deployment | `gbw-db` | Clerk production | production | Players |

Production requires the domain to be HTTPS-only with HSTS; iOS refuses secure-context APIs otherwise (`NFR-09`,
`environment-setup.md` § 7).

## 2. What gets deployed

| Artefact | Command | Produces |
|----------|---------|----------|
| Web | `pnpm build` → `apps/web/dist` | Static SPA + PWA manifest + service worker |
| Worker | `pnpm exec wrangler deploy --env production` | API and the `Room` DO class (migration tag `v1`, `v2`, …) |
| D1 schema | `pnpm exec wrangler d1 migrations apply gbw-db --remote` | Applied before the Worker that needs it |
| Tunables | shipped inside `packages/core` | Changing them bumps `rulesetVersion` (`NFR-23`) |

Order matters: **D1 migrations → Worker → Pages**. A Worker that expects a column the database does not have fails every
request; a Pages deploy that references an endpoint the Worker does not serve yet fails only that route.

## 3. Per-environment configuration

| Setting | preview | production |
|---------|---------|------------|
| `ENVIRONMENT` | `preview` | `production` |
| `VITE_API_BASE` | preview Worker URL | `https://api.gbw.<domain>/api/v1` |
| `VITE_CLERK_PUBLISHABLE_KEY` | test instance key | production instance key |
| Clerk instance | test | production |
| `SESSION_TOKEN_SECRET` | preview secret | production secret (rotated quarterly) |
| TURN key | test | production |
| Rate limits | 100 rooms/min (relaxed) | 10/min per IP, 30/h per account (`NFR-25`) |
| Log retention | 3 days | 3 days (`NFR-24`) |

Secrets live in GitHub Actions secrets and `wrangler secret put`; `wrangler.jsonc` holds only non-secret vars and
bindings.

## 4. Pipeline (GitHub Actions)

```mermaid
flowchart LR
    PR["pull request"] --> CI["ci.yml:<br/>install · typecheck · lint · test · verify-docs"]
    CI -->|green| Prev["deploy-preview.yml:<br/>Pages preview + wrangler versions upload"]
    Prev --> Rev["cpt-review + two-phone smoke"]
    Rev -->|approved| Merge["merge to main"]
    Merge --> Prod["deploy-production.yml:<br/>d1 migrate → wrangler deploy → Pages prod"]
    Prod --> Smoke["smoke checks § 5"]
    Smoke -->|fail| RB["rollback § 6"]
```

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | every push, every PR | `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, the docs verification listed in `AGENTS.md` § PROJECT, `npx @redocly/cli lint docs/02-reference/api/openapi.yaml` |
| `deploy-preview.yml` | PR opened/updated, same-repo branches only | Build with preview env, `wrangler d1 migrations apply --remote --env preview`, `wrangler versions upload --env preview`, Pages deploy `--branch pr-<n>` |
| `deploy-production.yml` | push to `main`, manual approval | Migrate, deploy Worker, deploy Pages, run smoke, post the release record (`cpt-release`) |

CI needs: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_CLERK_PUBLISHABLE_KEY`, and the worker secrets mirrored
for the deploy step. A PR from a fork does not get secrets and therefore does not deploy.

## 5. Smoke checks after every production deploy

| Check | Command | Pass |
|-------|---------|------|
| API alive | `curl -fsS https://api.gbw.<domain>/api/v1/health` | `200`, `{"status":"ok","version":"<git sha>"}` |
| Static app | `curl -fsSI https://gbw.<domain>/` | `200`, `content-type: text/html`, service worker reachable |
| Sign-in route loads Clerk | Playwright `tests/e2e/prod-smoke.spec.ts` against production | Sign-in card renders for both locales |
| Room round trip | Same spec: two contexts create/join a room | Roster shows 2 members within 5 s |
| Migration state | `wrangler d1 migrations list gbw-db --remote` | No pending migration |
| Rollback target known | `wrangler deployments list --env production` | Previous version id recorded in the release note |

Record the results in the release record (`docs/07-release/REL-…`); a release with a missing smoke line is not
signed off.

## 6. Rollback

| Situation | Action | Time |
|-----------|--------|------|
| Bad Worker deploy | `pnpm exec wrangler rollback --env production --message "rollback REL-x"` | < 2 min |
| Bad web build | Pages dashboard → previous deployment → *Rollback* (or `git revert` + redeploy) | < 5 min |
| Bad D1 migration | Forward-fix migration only. Migrations are additive; a destructive change needs a two-step deploy (add column → backfill → drop in a later release) | next deploy |
| DO class change that breaks live rooms | Deploy with a **new** migration tag and keep the old class bound for 24 h so existing rooms drain | planned |
| Security incident | Revoke the TURN key and rotate `SESSION_TOKEN_SECRET` (all sessions drop), then `cpt-ops` incident record | < 15 min |

A rollback keeps the database as it is: every migration in this project is backwards-compatible for at least one
release.

## 7. Who may deploy

| Action | Who |
|--------|-----|
| Merge to `main` | Any developer with an APPROVE from `cpt-review` |
| Approve the production workflow | The tech lead (GitHub environment protection rule) |
| Apply a production migration manually | Tech lead only, announced in the team channel beforehand |
| Rotate secrets | Tech lead; record in `08-ops/runbook.md` § secrets |
| `wrangler rollback` | Whoever is on call, then notify the team |

## Oracle

| Contract | Checked by |
|----------|-----------|
| Pipeline order (migrate → worker → pages) | `.github/workflows/deploy-production.yml` review + `tests/e2e/prod-smoke.spec.ts` (TC-FND-901) |
| Smoke checks all pass on production | Release record `docs/07-release/REL-…` evidence line |
| Rollback returns the previous version serving 200 | `tests/e2e/prod-smoke.spec.ts` re-run after `wrangler rollback` (TC-FND-902) |
| No secret in `wrangler.jsonc` or the web build | `tests/meta/bundle-secrets.test.ts` builds the SPA into a temp dir and greps every asset for the secret names and for the values in an untracked `apps/worker/.dev.vars` (TC-FND-012) |
