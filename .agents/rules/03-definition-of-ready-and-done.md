---
paths:
  - "docs/03-stories/**"
---

# Rule 03 — Definition of Ready and Done

## 1. Definition of Ready

A story may move to `in-progress` only when every check below holds **for the project's tier** — `lite`: R1–R3; `standard` and `full`: all of them (the matrix is in `cpt-interview/references/tiers.md`). `cpt-ship` checks them first and stops if any fail.

| # | Check |
|---|-------|
| R1 | Frontmatter is valid (`verify-docs.mjs` passes for the story) |
| R2 | `status` is `ready` — not `draft`, `blocked`, or `closed` |
| R3 | Every story in `depends_on` is `done` |
| R4 | `open_questions` is empty. Questions still open but whose recorded **Assumption** the user agreed to build on are listed in `accepted_assumptions` instead |
| R5 | Acceptance criteria are decidable: each has a concrete given/when/then or an observable result, and a stranger holding only the story and the repository can say pass or fail without asking anyone |
| R6 | Every doc the story links to exists, and the contracts it needs (API, data, UI, CLI) are specified there |
| R7 | Size is `S`, `M` or `L` — an `XL` story is split first |

If a check fails, report which one and what would unblock it. Do not start implementation "partially".

R5 decides whether D1 can be graded at all: a criterion a reviewer has to interpret is rewritten before the story is
`ready`, because review can only check the code against what the criterion says — it cannot recover a criterion that
says the wrong thing.

## 2. Definition of Done

A story may be marked `done` only when every check below holds **for the project's tier** — `lite`: D1–D3; `standard` and `full`: all of them. `cpt-review` checks them.

| # | Check |
|---|-------|
| D1 | Every acceptance criterion is met and traced to a test (or, for untestable criteria, a recorded manual check) — a criterion about what a user *sees* is traced to the browser pass in the review or to the manual check that replaced it |
| D2 | New and changed behavior has automated tests; the full test suite passes |
| D3 | Build, lint, and typecheck commands from `AGENTS.md` § PROJECT pass |
| D4 | No rule in `.agents/rules/` is violated; no secrets, debug output, or commented-out code added |
| D5 | Docs that describe changed behavior or contracts are updated in the same change |
| D6 | `cpt-review` verdict is APPROVE or APPROVE WITH NITS; then story frontmatter `status: done`; any open question discovered during work is recorded |
| D7 | `verify-docs.mjs --fix` passes (generated blocks regenerated, no errors) |
| D8 | The change is ready to commit: code and docs together, no scratch files, and committed per `04-git.md` where the project commits — a review of a working tree grades this as "ready to commit", because `cpt-ship` commits after the review (§ 8) |

## 3. Status transitions

```
draft ──► ready ──► in-progress ──► done ──► (released: listed in a deployed `REL-…`)
  │         │            ▲  │         │
  └────►  blocked ◄──────┘  └─────────┘ reopen (not yet merged)
                                  any ──► closed (removed from scope; keeps its file and id)
```

- `draft → ready`: acceptance criteria written and R1–R7 satisfiable.
- `done → in-progress` (**reopen**): a review finds a Critical or Medium issue, or a failed DoD item, before the
  change is merged to the default branch. Fix on the same branch, re-verify, review again.
- After merge, a defect in a `done` story is **not** a reopen: create a new story (`fix:` in the title, `depends_on`
  the original) so shipped history stays accurate.
- `→ blocked`: an open question could change acceptance criteria. List it in `open_questions`.
- `blocked → ready`: all listed questions answered (`cpt-decide` does this when recording answers).
- `→ closed`: only through `cpt-change`, with the decision and date recorded at the top of the story.
- `done → released` is not a status: a story is released when a `docs/07-release/REL-…` record with `status: deployed`
  lists it and names the commit. Story history stays stable when a release is rolled back — the release failed, the
  story did not.

## 4. Release readiness (RR1–RR8)

Checked by `cpt-release` before anything is deployed. A check without evidence is a failed check.

| Id | Before a release |
|----|------------------|
| RR1 | Every story in scope is `done` and its DoD was verified against the commit being released |
| RR2 | The released commit is the one that was built and tested: sha, exact commands, result lines recorded |
| RR3 | `01-overview/environment-setup.md` and `01-overview/deployment.md` describe the steps actually run — a stranger can follow them from a clean checkout |
| RR4 | Migrations have forward, backfill, and reverse documented; irreversible steps are ⚠️ with the backup that makes them recoverable |
| RR5 | The rollback procedure is written and rehearsed on a non-production environment (or a recorded reason why not) |
| RR6 | Environment configuration diffed — the env var table is current and the record holds names, never values |
| RR7 | Post-deploy checks are listed: a smoke path per critical flow, the SLO/error-budget signal, and the watch window |
| RR8 | The version follows the change set (major for a ⚠️ breaking contract, minor for new capability, patch for fixes) and `previous` names the last deployed release |

## 5. Stage gates (full tier)

A gate is a phase approval with a name and a date, recorded in `docs/05-quality/acceptance-signoff.md`. `cpt-signoff`
collects the evidence; nobody signs on the team's own authority.

| Gate | Phase | Exit criterion |
|------|-------|----------------|
| G1 | Requirements baseline | Brief `confirmed`; in-scope stories `ready` with decidable ACs; open questions answered or accepted; the delivery plan names the milestone |
| G2 | Design baseline | Architecture and `02-reference/` complete for in-scope layers; every contract table names its oracle; NFRs measurable; ADRs for contestable choices |
| G3 | Acceptance / UAT | Scope stories `done`; every `TC-…` executed with a result; open defects dispositioned by severity; UAT run by the accepting role |
| G4 | Release gate | RR1–RR8 green; rollback rehearsed; runbook and SLO written; a `REL-…` record exists with `status: planned` |

- A signature needs evidence that resolves; a gate with no evidence stays `pending` — that is not a waiver.
- A waiver names who accepted the risk, the compensating control, and the follow-up story. **Security (rule 06) is never
  waived.**
- A change request that alters scope, contracts, or data re-opens G1/G2; a rolled-back release re-opens G4.
- Full tier only: outside it, a gate never blocks work the tier does not require.
