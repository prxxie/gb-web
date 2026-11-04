# Environment setup

From a clean machine to a running match on a phone. Commands are written in the order you run them; anything that is not
true yet carries a `(planned)` note.

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node | **24 LTS or newer** | `verify-docs.mjs` and the CPT hook need ≥ 24; the local machine currently has v22.22.2 |
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
| `VITE_API_BASE_URL` | yes (web) | `http://localhost:8787/api/v1` | API base for the SPA |
| `VITE_WS_BASE_URL` | yes (web) | `ws://localhost:8787` | Signaling WebSocket origin |
| `CLERK_JWKS_URL` | yes (worker) | `https://<instance>.clerk.accounts.dev/.well-known/jwks.json` | JWT verification keys |
| `CLERK_ISSUER` | yes (worker) | same instance URL | `iss` claim check |
| `SESSION_TOKEN_SECRET` | yes (worker, secret) | 32 random bytes, base64 | Signs the 60-min session token |
| `TURN_KEY_ID` | yes (worker, secret) | `abc123…` | Cloudflare TURN key id |
| `TURN_KEY_API_TOKEN` | yes (worker, secret) | `…` | Cloudflare TURN API token |
| `ENVIRONMENT` | no | `local` \| `preview` \| `production` | Log field + CORS/origin checks |
| `D1_BINDING` / `DB` | binding, not a var | `GBW_DB` | D1 database binding in `wrangler.jsonc` |

Web variables live in `apps/web/.env.local` (git-ignored); worker secrets are set with
`pnpm exec wrangler secret put SESSION_TOKEN_SECRET` and never committed. `.env.example` lists the names only — no values,
no real keys (`06-security.md` § 1).

## 4. First-time Cloudflare resources

```bash
pnpm exec wrangler d1 create gbw-db                 # paste the database_id into wrangler.jsonc
pnpm exec wrangler d1 migrations apply gbw-db --local
pnpm exec wrangler d1 migrations apply gbw-db --remote
```

`--local` is what tests and `wrangler dev` use; `--remote` only for preview/production.

## 5. Run locally

Two processes, two terminals:

```bash
pnpm dev:worker     # wrangler dev on :8787 (API + Durable Object + local D1)
pnpm dev            # vite on :5173 (SPA, proxies nothing — talks to VITE_API_BASE_URL)
```

Open `http://localhost:5173`. Two browser windows (one normal, one private) are enough to play a 1v1; the DO runs in the
local miniflare instance, so WebRTC works on `localhost` without TURN.

## 6. Run the checks

```bash
pnpm typecheck      # tsc -b across workspaces
pnpm lint           # eslint
pnpm test           # vitest: tests/core, tests/worker, tests/web
pnpm e2e            # playwright, two-browser specs
node .agents/scripts/verify-docs.mjs --fix
```

Single test:

```bash
pnpm vitest run tests/core/physics.test.ts
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
| `401 unauthenticated` on `/me` with a valid sign-in | `CLERK_JWKS_URL`/`CLERK_ISSUER` point at another Clerk instance than `VITE_CLERK_PUBLISHABLE_KEY` | Make both env sets reference the same instance |
| WebSocket closes `4401` immediately | Session token expired (60 min) or absent | `POST /sessions` again; the client refreshes 5 min before expiry |
| WebRTC connects locally but not between two phones on mobile data | No TURN credentials, or they expired | Check `GET /turn-credentials` returns `ttlSeconds: 3600` and `TURN_KEY_ID` is set |
| `429 rate-limited` while testing | Creating rooms in a loop (`NFR-25`) | Wait a minute or raise the limit for `ENVIRONMENT=local` only |
| Playwright cannot find a phone viewport | Device descriptors are not installed | `pnpm exec playwright install chromium`; viewport is set in `playwright.config.ts` (844 × 390) |

## Oracle

| Contract | Checked by |
|----------|-----------|
| These commands run in order on a clean checkout | CI job `.github/workflows/ci.yml` (install → typecheck → lint → test → docs) |
| `/api/v1/health` returns `200` from `wrangler dev` | `tests/worker/health.test.ts` (TC-FND-001) |
| `.env.example` names every required variable and no value | `tests/worker/env.test.ts` — parses `.env.example` and compares with the vars the code reads (TC-FND-002) |
