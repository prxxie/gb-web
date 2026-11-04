---
name: cpt-adopt
description: Adopt CPT in a repository that already has code and little or no docs — read the codebase (and any pre-existing docs or AGENTS.md) and reverse-engineer a draft brief, a draft architecture, and the PROJECT section of AGENTS.md, with every fact tagged as inferred from a file, so an existing product can enter the docs-first workflow without a from-scratch interview. Use when the project already ships code, when the user says "this repo has no docs", "document what we have", "adopt CPT here", or when install.sh reported that an AGENTS.md already existed.
---

# cpt-adopt

Turn the code that exists into the docs CPT needs, without inventing intent the code cannot show.

The output is deliberately **draft**: the code is the source of truth for *what is built*, the user is the only source of
truth for *why*, *for whom*, and *what comes next*. This skill records the first and asks about the second.

## Inputs

- The repository itself, read-only: manifests, entrypoints, routes, schema and migrations, tests, CI config, Docker and
  deploy files, `.env.example`, scripts, `README.md` and any other docs. `git log --oneline` for how it evolved.
- Pre-existing docs anywhere in the repo (a `docs/` tree, a wiki export, `specs/`, an `AGENTS.md` written by another
  tool). They are evidence of intent — and they may be stale. Say which when they are.
- `docs/01-overview/conventions.md` if CPT is already installed here.

## Outputs

- `docs/00-source/adopt-report.md` — what the code says, what it cannot say, and what disagrees.
- `docs/00-source/brief.md` from `.agents/templates/brief.md`, `status: draft`, filled only with facts the code shows.
- `docs/04-decisions/open-questions.md` — one question per thing only a human can answer.
- Then hand off: `cpt-interview` (asks only about the intent gaps) → `cpt-docs`, whose step 3 runs `cpt-pack` against
  the stack the code actually shows. Adopting a repository without installing its packs leaves `cpt-ship` and
  `cpt-review` with no layer conventions to load.

## Procedure

**Delegate the sweep where the tool allows it** — a fast, read-only explorer subagent can do steps 1–2 and return facts
with their file:line locations; running the commands (step 3) and every judgment (steps 4–7) stay with you. Without
one, do steps 1–2 yourself.

1. **Inventory before reading.** List the manifests and entrypoints, the routes or commands, the schema and
   migrations, the tests, the CI and deploy files, and every doc file that already exists. `references/codebase-signals.md`
   maps file names to the facts they carry and the brief section each fact belongs in.
2. **Follow the entrypoints, not the folder tree.** Start from what runs (`main`, `app`, `index`, `cmd/`, a CLI
   entrypoint, a `Makefile` target) and read outward one layer at a time. Skim tests before implementations: tests
   state intended behavior in the fewest words.
3. **Confirm the commands by running them.** A `package.json` script, a `Makefile` target, or a CI job is a claim. Run
   what is safe and cheap (lint, typecheck, the test suite) and record the real result. Anything you did not run is
   written `_not verified_` — never copied into AGENTS.md as if it worked.
4. **Extract facts per brief section (1–14), each tagged `[inferred]` with its location.** Use the template's tags
   only: `- JWT auth with 15-minute access tokens [inferred] — src/auth/jwt.py:42`. No location, no fact.
5. **Separate the three kinds of gap.** *Intent* (why, for whom, success measures, roadmap, out of scope) — interview.
   *Absent evidence* (a feature the code lacks entirely) — not a gap, it is simply not built. *Contradiction* (docs
   describe what the code does not do, or two parts of the code disagree) — record a conflict, never pick silently.
6. **Grade the docs tier from the evidence**: a single service and a handful of routes is `lite`; several bounded
   contexts, roles, and NFRs is `standard`; contracts, test cases, and delivery reporting is `full`. State the count
   that justifies the grade (files, endpoints, tables, roles).
7. **Write the report and the draft brief, then stop.** Hand off: "Run `cpt-interview` — it will ask only about the N
   intent gaps and M conflicts. Then `cpt-docs` writes the doc set from the brief."

## adopt-report.md structure

```markdown
# Adopt report — YYYY-MM-DD

## What this code is
<5 lines: what it does as observable from the code, how it is deployed, how mature it is, the graded tier and why.>

## Evidence read
| Area | Files | Facts taken |
|------|-------|-------------|

## Commands (run)
| Command | Source | Result | Verified |
|---------|--------|--------|----------|
| <cmd> | package.json#scripts.test | 41 passed, 0 failed | yes |
| <cmd> | .gitlab-ci.yml#test | — | no (needs CI runner) |

## Conflicts
| # | Topic | Code says | Existing doc says | Where |
|---|-------|-----------|-------------------|-------|

## Intent gaps (interview)
| # | Brief section | Question | Why the code cannot answer it |
|---|---------------|----------|-------------------------------|

## Assumptions taken to date
| # | Assumption | Basis | Would change what if wrong |
|---|------------|-------|----------------------------|
```

## Rules

- **Never invent intent.** The code shows a `/v2/` prefix; it does not show why. That is a question, not a goal.
- **Never modify code, tests, or config.** This skill produces docs. A defect you notice while reading is recorded in
  the report, not fixed here — offer it as a story.
- **Cite a location for every inferred fact** (`path:line`, `path#symbol`, `path#target`). A fact without a location is
  a guess and must be dropped or asked about.
- **Prefer tests over prose, prose over guesswork.** When an existing README and the tests disagree, the tests usually
  win and the README becomes a conflict.
- **Mark stale docs, do not delete them.** Move nothing; list each pre-existing doc in the report with a verdict —
  accurate / stale / superseded.
- **Do not re-derive what CPT rules already fix.** Formatting, git, testing, and security conventions come from
  `.agents/rules/`; adopt only records what is specific to this project.
- Read `.agents/rules/02-docs-navigation.md` before writing any file into `docs/`.
