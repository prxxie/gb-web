# Environment setup

From a clean machine to a running match on a phone. Commands are written in the order you run them; anything that is not
true yet carries a `(planned)` note.

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node | **22.12 or newer** (`engines.node`) | What the workspace itself requires; CI runs 24, so a newer runtime is allowed and an older one fails at install. Verified on v22.22.2 |
| pnpm | 10.x (`corepack enable && corepack prepare pnpm@10 --activate`) | Workspace manager for `apps/*` and `packages/*` |
| Wrangler | 4.x (`pnpm dlx wrangler --version` or the workspace dev-dependency) | Worker, D1, DO, Pages previews |
| Playwright browsers | `pnpm exec playwright install chromium` | e2e; WebKit is added when iOS Safari is tested locally |
| A Cloudflare account | free plan | D1, DO, Pages, TURN credentials |
| A Clerk account | Hobby plan | Sign-in; see `OQ-26`/`ADR-0002` for the decision |

No Docker, no database server, no local TLS certificates are required.

## 2. Get the code

```bash
git clone <repo-url> gb-web    # (planned — the repository has no remote yet)
cd gb-web
pnpm install
```

If the repo still has no remote, `git init` first and commit the scaffold as described in
[`.agents/rules/04-git.md`](../../.agents/rules/04-git.md) § 4.

## 3. Environment variables

| Name | Required | Example | Purpose |
|------|----------|---------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | yes (web) | `pk_test_…` | Clerk browser SDK; public by design |
| `VITE_API_BASE` | no (web) | `/api/v1` (default) | API base for the SPA; a full origin is needed only when the SPA and the Worker are on different hosts |
| `CLERK_ISSUER` | yes (worker) | `https://<instance>.clerk.accounts.dev` | `iss` claim check; the JWKS URL is fetched from it, so there is no separate `CLERK_JWKS_URL` |
| `SESSION_TOKEN_SECRET` | yes (worker, secret) | 32 random bytes, base64 | Signs the 60-min session token |
| `TURN_KEY_ID` | yes (worker, secret) | `abc123…` | Cloudflare TURN key id |
| `TURN_KEY_API_TOKEN` | yes (worker, secret) | `…` | Cloudflare TURN API token |
| `VERSION` | no (worker) | `dev` | Reported by `/health`; matches the release tag in production |
| `ENVIRONMENT` | no (worker, `wrangler.jsonc` var) | `development` \| `production` | Log verbosity and the loopback-origin allowance (`NFR-11`); only `development` widens CORS |
| `ALLOWED_ORIGINS` | yes (worker, `wrangler.jsonc` var) | `http://localhost:5173` | Comma-separated CORS allowlist in production (`NFR-11`) |
| `GBW_DB`, `ROOMS` | bindings, not vars | `GBW_DB`, `ROOMS` | D1 and Durable Object bindings in `apps/worker/wrangler.jsonc` |

The signaling WebSocket URL is not configured: both `apps/web/src/routes/LobbyPage.tsx:35` and
`MatchPage.tsx:255` derive it from `window.location.origin` with `http`→`ws`, which keeps one origin per deployment.

Web variables live in `apps/web/.env.local` (git-ignored); worker secrets are set with
`pnpm exec wrangler secret put SESSION_TOKEN_SECRET` and never committed. `apps/web/.env.example` and
`apps/worker/.dev.vars.example` list the names only — no values, no real keys (`06-security.md` § 1).

For local development copy the worker example once and give the secret a throwaway value:

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # already set to a throwaway value
```

Without it every session call fails with `500 internal` and the log line
`Imported HMAC key length (0) must be a non-zero value`; the Worker now refuses to start a session instead of
producing an invalid key. In `ENVIRONMENT=development` the Worker also accepts `http://localhost:*` and
`http://127.0.0.1:*` origins in addition to `ALLOWED_ORIGINS`, so the Vite dev server works on any port; production
stays an explicit list (`NFR-11`).

## 4. First-time Cloudflare resources

```bash
pnpm exec wrangler d1 create gbw-db                 # paste the database_id into wrangler.jsonc
pnpm --filter @gbw/worker exec wrangler d1 migrations apply GBW_DB --local
pnpm --filter @gbw/worker exec wrangler d1 migrations apply GBW_DB --remote
```

`--local` is what tests and `wrangler dev` use; `--remote` only for preview/production.

## 5. Run locally

Two processes, two terminals:

```bash
pnpm dev:worker     # wrangler dev on :8787 (API + Durable Object + local D1)
pnpm dev            # vite on :5173 (SPA, proxies /api to :8787)
```

If port 5173 is taken, pass another one — the browser suite reads the same value:
`pnpm dev --port 5199 --strictPort` and `E2E_BASE_URL=http://127.0.0.1:5199 E2E_WEB_PORT=5199 npx playwright test`.

Open `http://localhost:5173`. Two browser windows (one normal, one private) are enough to play a 1v1; the DO runs in the
local miniflare instance, so WebRTC works on `localhost` without TURN.

## 6. Run the checks

```bash
pnpm typecheck      # tsc -b across workspaces
pnpm lint           # eslint
pnpm test           # vitest: packages/core/tests, apps/worker/tests, apps/web/tests
pnpm e2e            # playwright, two-browser specs
node .agents/scripts/verify-docs.mjs --fix
```

Single test:

```bash
pnpm vitest run packages/core/tests/physics.test.ts
pnpm exec playwright test tests/e2e/lobby.spec.ts
```

All six commands are `(planned — verify after US-FND-001)`; they become runnable when the foundation story creates the
workspace `package.json` scripts.

## 7. Test on a real phone

1. Find the LAN address (`ipconfig getifaddr en0` / `hostname -I`).
2. `pnpm exec wrangler dev --host 0.0.0.0`, `pnpm dev --host` in the second terminal.
3. Open `http://<lan-ip>:5173` on the phone — camera/mic permissions are irrelevant, but Safari needs the page served
   over HTTPS **for WebRTC on non-localhost origins**; use `pnpm dlx localtunnel` or a Pages preview deploy instead if
   the phone refuses the data channel.
4. Landscape check: the game must stay playable with the notch on either side (`viewport-fit=cover`).

## 8. Common problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| `verify-docs.mjs` exits with a Node version error | Node < 24 | Upgrade Node; the check is not advisory |
| `D1_ERROR: no such table` | Migrations not applied to the local database | `pnpm exec wrangler d1 migrations apply gbw-db --local` |
| `401 unauthenticated` on `/me` with a valid sign-in | `CLERK_ISSUER` names another Clerk instance than `VITE_CLERK_PUBLISHABLE_KEY` (the JWKS URL is fetched from the issuer, so there is no separate key to compare) | Make both reference the same instance |
| WebSocket closes `4401` immediately | Session token expired (60 min) or absent | `POST /sessions` again; the client refreshes 5 min before expiry |
| WebRTC connects locally but not between two phones on mobile data | No TURN credentials, or they expired | Check `GET /turn-credentials` returns `ttlSeconds: 3600` and `TURN_KEY_ID` is set |
| `429 rate-limited` while testing | Creating rooms in a loop (`NFR-25`) | Wait a minute or raise the limit for `ENVIRONMENT=local` only |
| Playwright cannot find a phone viewport | Device descriptors are not installed | `pnpm exec playwright install chromium`; viewport is set in `playwright.config.ts` (844 × 390) |

## Oracle

| Contract | Checked by |
|----------|-----------|
| These commands run in order on a clean checkout | CI job `.github/workflows/ci.yml` (install → typecheck → lint → test → docs) |
| `/api/v1/health` returns `200` from `wrangler dev` | `apps/worker/tests/health.test.ts` (TC-FND-001) |
| `.env.example` names every required variable and no value | `apps/worker/tests/env.test.ts` — parses `.env.example` and compares with the vars the code reads (TC-FND-002) |
