# Codebase signals — file name → fact → brief section

What to read first when adopting an existing repository, and which brief section the fact belongs in. This is a
checklist, not a script: skip rows that do not apply, and follow anything unusual you find.

## Manifests and toolchain

| File | Fact to take | Brief section |
|------|--------------|---------------|
| `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `pom.xml` | Runtime, framework, dependency set, entrypoint, scripts | 8 Stack, 9 Constraints, 11 Environments |
| lockfile (`package-lock.json`, `uv.lock`, `poetry.lock`, `pnpm-lock.yaml`) | Whether versions are pinned at all | 9 Constraints |
| `.nvmrc` / `.python-version` / `rust-toolchain.toml` | Exact runtime version | 8 Stack |
| `Makefile` / `justfile` / `Taskfile.yml` | The commands the project actually uses | 11 Environments |
| `.eslintrc*`, `ruff.toml`, `tsconfig.json`, `.prettierrc` | Lint and typecheck commands, strictness | 9 Constraints |

## Behavior and contracts

| File | Fact to take | Brief section |
|------|--------------|---------------|
| Route files (`routes/`, `routers/`, `controllers/`, `urls.py`, `app/api/`) | Endpoints, methods, auth requirements | 5 Functional scope, 12 Integrations |
| `openapi.json` / `schema.graphql` / `.proto` / generated clients | The published contract, its version | 5 Functional scope, 12 Integrations |
| Schema/migrations (`migrations/`, `prisma/schema.prisma`, `alembic/versions/`) | Entities, relationships, what changed recently | 5 Functional scope, 7 Data |
| Background jobs, cron, queue consumers | Async behavior and its retry story | 5 Functional scope |
| CLI entrypoints (`cmd/`, `bin/`, `console_scripts`) | Commands, flags, exit codes | 5 Functional scope |
| UI routes/components (`app/`, `pages/`, `views/`) | Screens and the flows between them | 5 Functional scope |
| Integration clients (`clients/`, `services/`, `sdk/`) | Third parties, auth style, failure handling | 12 Integrations |
| Auth/permission code (`auth/`, `guards/`, `middleware/`, policy files) | Roles, who can do what | 6 Users and roles |
| `config.py`, `settings.py`, `.env.example` | Config keys, which are secrets | 9 Constraints, 11 Environments |

## Quality signals

| File | Fact to take | Brief section |
|------|--------------|---------------|
| Test dirs and their names | Levels present (unit/integration/e2e), coverage of the risky parts | 9 Constraints, 13 Quality |
| CI config (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`) | The real gate: what blocks a merge, what is deployed | 11 Environments |
| `Dockerfile`, `compose.yaml`, k8s/helm, Terraform | Deploy shape, services, what runs where | 11 Environments |
| Monitoring/alerts config, log setup | What the team already measures | 13 Quality |
| `CHANGELOG.md`, tags, `git log --oneline` | Maturity, release cadence, churn hotspots | 3 Goals, 14 Roadmap |

## Pre-existing docs

| Found | Verdict to record |
|-------|-------------------|
| `README.md` | Usually accurate for setup, stale for behavior — check both |
| `docs/`, `specs/`, wiki export | Evidence of intent; contradict it against the code, do not trust it |
| `AGENTS.md` / `CLAUDE.md` from another tool | Merge, do not replace: keep its project facts, add CPT's rules |
| ADRs or design notes | Decisions already made — link them, do not re-litigate them |
| Issue templates, `CONTRIBUTING.md` | Definition of Done the team already agrees on |

## What code cannot tell you

Always an interview question, never an inference:

- **Why** the product exists and who the users are (`1 Problem`, `2 Users`).
- **Success measures** and their targets (`3 Goals`).
- **Out of scope** for the next release — absence of code is not a scope decision (`4 Scope`).
- **Non-functional targets**: load, latency, availability, retention, compliance. Code shows current behavior, not the
  promised one (`10 Non-functional`).
- **Deadline, budget, team size** (`9 Constraints`).
- **Roadmap** beyond what is half-built (`14 Roadmap`).
- Anything a comment says `TODO`, `FIXME`, `HACK`, `temporary`, or `legacy` — that is a question about intent, not a
  requirement.
