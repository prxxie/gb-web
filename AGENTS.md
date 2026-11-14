# AGENTS.md

Entry point for every AI coding agent working in this repository. Read it fully before producing output.

**Precedence (high → low):** security → the user's instructions → hard rules below → `.agents/rules/` → defaults.
Overriding a hard rule needs the explicit procedure in [rule 01 §6](.agents/rules/01-workflow.md); security (rule 06)
is never overridden this way — ask instead.

---

## 1. How this project is built

This project follows the **CPT workflow**: an idea or spec becomes a set of AI-friendly docs, the docs become a
backlog of user stories, and stories ship one at a time. The docs are the source of truth for *what* to build;
`.agents/rules/` is the working agreement for *how*.

| Phase | Skill | Produces |
|-------|-------|----------|
| 1. Adopt existing code (only if the repo already has code) | `cpt-adopt` | Draft brief reverse-engineered from the code, adopt report, intent questions |
| 2. Ingest existing material (optional) | `cpt-ingest` | Draft facts and gaps from `docs/00-source/` |
| 3. Interview | `cpt-interview` | `docs/00-source/brief.md`, open questions |
| 4. Choose the stack packs | `cpt-pack` | `cpt-stack-<name>` skills for the decided stack, recorded in AGENTS.md and conventions.md |
| 5. Generate docs | `cpt-docs` | `docs/01-overview/`, `docs/02-reference/`, ADRs, the PROJECT section below |
| 6. Plan | `cpt-plan` | Epics and stories in `docs/03-stories/`, delivery plan |
| 7. Ship a story | `cpt-ship <STORY-ID>` | Code, tests, updated story status |
| 8. Review | `cpt-review` | Review verdict against story, rules, and Definition of Done |
| 9. Gate (full tier) | `cpt-signoff` | Gate evidence and signatures in `docs/05-quality/acceptance-signoff.md` |
| 10. Release | `cpt-release` | Release record in `docs/07-release/`, deployed environment, rollback plan |
| 11. Operate | `cpt-ops` | Runbook and SLOs in `docs/08-ops/`, incident and postmortem records |
| Any time | `cpt-decide` | Open questions and ADRs in `docs/04-decisions/` |
| Any time | `cpt-change` | Change request applied across docs and stories |
| Any time | `cpt-visual` | Architecture and decision diagrams in `docs/02-reference/diagrams/` |
| Any time (full tier) | `cpt-report` | Status or sprint report in `docs/06-reports/` |

**Not sure where to start?** Code but no `docs/00-source/brief.md`: run `cpt-adopt`. No code yet: if
`docs/00-source/` holds specs, run `cpt-ingest` first, then `cpt-interview`. Otherwise read `docs/README.md`.

## 2. Hard rules

1. **Docs before code.** Do not implement behavior that no story or doc describes. If it is missing, raise an open
   question (`cpt-decide`) or a change request (`cpt-change`) — do not guess.
2. **Never invent facts.** Requirements, APIs, config keys, env vars, and library behavior you have not seen in the
   docs, the code, or official documentation must be verified or explicitly marked as an assumption.
3. **One story at a time.** Work through `cpt-ship`. A story must meet the Definition of Ready before work starts and
   the Definition of Done before it is marked `done` — see `.agents/rules/03-definition-of-ready-and-done.md`.
4. **Keep docs in sync.** If a change alters behavior, contracts, or data, update the affected docs in the same change.
5. **Verify the doc set** after editing anything under `docs/`: `node .agents/scripts/verify-docs.mjs --fix`
   (regenerates counts and index tables, then checks every contract). Never edit generated blocks by hand.
6. **Surgical changes.** Touch only what the task requires. No new dependencies without explicit approval.
7. **No secrets** in code, docs, or commits.
8. **Reply in Vietnamese.** Every answer to the user, and every progress note, summary, or question you write in chat,
   is in Vietnamese (tiếng Việt). Code, identifiers, commit messages, and files under `docs/`, `.agents/`, and the code
   itself stay in English as specified elsewhere. The user must explicitly ask to switch languages before you change this.

**These rules are defaults with one exception: the user may override them explicitly.** The override procedure (what
counts as explicit, what must be recorded, and the two rules with no override) is
[rule 01 §6](.agents/rules/01-workflow.md). Never override security (rule 06) this way; ask instead.

## 3. Where things live

```
AGENTS.md            ← you are here
.agents/
├─ skills/           CPT skills (cpt-*) and stack packs (cpt-stack-*), one folder per skill with SKILL.md
├─ cpt.json          Where the scaffold lives and which CPT version installed it (used for packs)
├─ rules/            Working agreement — read the one relevant to your task
├─ templates/        Templates the skills fill in
└─ scripts/          verify-docs.mjs
docs/                ← WHAT to build (layout depends on tier; see docs/README.md)
├─ 00-source/        Original input: brief, specs, change requests. Read-only except brief.md and the ingest/adopt reports
├─ 01-overview/      Project overview, architecture, glossary, NFRs, conventions
├─ 02-reference/     Lookup material: API, data model, screens, CLI (standard and full tiers)
├─ 03-stories/       Backlog: EPIC-<nn>-<slug>/US-<CODE>-<nnn>-<slug>.md
├─ 04-decisions/     open-questions.md and adr/
├─ 05-quality/       Test cases and gate sign-off (full tier)
├─ 06-reports/       Status and sprint reports (full tier)
├─ 07-release/       Release records REL-… and their index
└─ 08-ops/           Runbook, SLOs, incident records
```

| Rule | Read when |
|------|-----------|
| [01-workflow.md](.agents/rules/01-workflow.md) | Starting any task |
| [02-docs-navigation.md](.agents/rules/02-docs-navigation.md) | Reading or editing `docs/` |
| [03-definition-of-ready-and-done.md](.agents/rules/03-definition-of-ready-and-done.md) | Picking up or finishing a story |
| [04-git.md](.agents/rules/04-git.md) | Branching, committing, opening a PR |
| [05-testing.md](.agents/rules/05-testing.md) | Writing or changing code |
| [06-security.md](.agents/rules/06-security.md) | Handling input, auth, data, secrets, dependencies |

## 4. PROJECT

> Filled in by `cpt-docs` after the interview. Until then, discover facts from config files before relying on them.
> Do not invent commands.

<!-- cpt:project:start -->
- **Name**: Game Bắn Súng Đạn Đạo Theo Lượt (GBW) — turn-based artillery PWA
- **Docs tier**: full (client contract; gates M1 week 4, M2 week 9, M3 week 13)
- **Project type**: web-app (PWA frontend + thin API/WebSocket backend)
- **Stack**: Phaser 4.2 (canvas) inside React 19 + Vite 8 + TypeScript 5; Cloudflare Workers + Durable Objects + D1; Clerk (auth); Cloudflare TURN; Cloudflare Pages; pnpm workspaces
- **Stack packs**: `react-vite`, `api`, `browser-verify` (skills `cpt-stack-<name>`; `docs/01-overview/conventions.md` overrides them)
- **Build**: `pnpm build` (`tsc -b` + `vite build` for web, `wrangler deploy --dry-run` for the worker; `Total Upload` 194.38 KiB / 51.61 KiB gzip for the worker, verified 2026-11-14)
- **Test**: `pnpm test` (`vitest run` over `packages/core/tests`, `apps/worker/tests`, `apps/web/tests`, `tests/meta`; 143 files / 1214 cases, verified 2026-11-14 on Node 22.22.2); single test: `pnpm vitest run packages/core/tests/match.test.ts`; e2e: `pnpm e2e` (`playwright test`, 27 specs / 94 cases — 93 pass; `TC-ROOM-153` fails on `main` too, its spec still expects the twenty-machine roster; `E2E_WEB_PORT` picks a free Vite port and `E2E_SERVERS_EXTERNAL=1` uses servers you started yourself)
- **Budget**: `pnpm budget` (gzip weight of every web chunk against `scripts/bundle-budget.json`; a ratchet behind `NFR-03`, run it after `pnpm build`)
- **Lint / typecheck**: `pnpm lint && pnpm typecheck` (verified 2026-11-08: eslint exit 0, `tsc -b` exit 0)
- **Run locally**: terminal 1 `pnpm dev:worker` (wrangler dev, :8787); terminal 2 `pnpm dev` (vite, :5173 — add `--port <n>` when 5173 is taken)
- **Layout**: `apps/web` (routes, Phaser scenes, i18n), `apps/worker` (API routes, `room-do.ts` Durable Object, `migrations/`), `packages/core` (physics, turns, snapshot, `tunables.json`), `packages/core/tests`, `apps/worker/tests`, `apps/web/tests`, `tests/e2e`, `tests/meta`, `docs/`
- **Conventions**: `docs/01-overview/conventions.md` — pnpm + TypeScript strict; `packages/core` imports no Phaser/DOM/network; wire frame `t` values `snake_case`, all other wire and in-code fields `camelCase`; i18n vi (default) + en, no literal strings; landscape only; values from `tunables.json` only. Node **22.12+** required (verified on 22.22.2; `package.json` `engines` is the authority).
<!-- cpt:project:end -->
