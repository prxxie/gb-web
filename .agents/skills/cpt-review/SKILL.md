---
name: cpt-review
description: Review a change (working tree, branch, or PR) against its user story, the project docs, the rules in .agents/rules, and the Definition of Done, and return findings ranked Critical / Medium / Nit with a verdict. Use when the user asks to review changes, before opening a PR, or as the self-review step of cpt-ship.
---

# cpt-review

Review is read-only. Do not edit files unless the user asks you to apply fixes.

## 1. Scope

- Target: the argument (PR, branch, commit range, path) or, by default, uncommitted changes plus commits on the
  current branch not on the default branch.
- Story: from the branch name, commit messages, or the argument. No story → review against rules and docs only, and
  note that traceability could not be checked.

## 2. Read

The full diff · the story · the docs the story links to · `.agents/rules/` · `AGENTS.md` § PROJECT · the review
checklist of every stack pack (`cpt-stack-*`) whose layer the diff touches — its items are added to § 3. A layer with no
pack is graded against `conventions.md`; a pack a story needed and did not get is a Medium finding for `cpt-pack`.
Read [references/ui-verification.md](references/ui-verification.md) when the diff changes what a user sees. Read enough of
the surrounding code to judge each change in context.

Take the tier from `AGENTS.md` § PROJECT (`Docs tier`) and grade only what it requires: `lite` = R1–R3 and D1–D3,
`standard` and `full` = all of them (`.agents/skills/cpt-interview/references/tiers.md`).

## 3. Check

| Area | Questions |
|------|-----------|
| **Correctness vs story** | Is every acceptance criterion implemented? Anything implemented that the story does not ask for? Contract matches the docs exactly (names, types, status codes, errors)? |
| **Tests** | Does each AC have a test that would fail without the change? Unhappy paths covered? Tests deterministic? Were tests weakened or skipped? |
| **Security** (rule 06) | Input validation, authz on server side, object-level ownership, injection, secrets, sensitive data in logs, new dependencies |
| **Rendered surface** | When the change is visible to a user: does the screen load and is the new control reachable (labelled, keyboard, narrow width)? Console free of new errors, no failed request, and a screenshot or the project's evidence directory — see `references/ui-verification.md` |
| **Robustness** | Error handling without swallowing, null/empty/limit cases, concurrency and transactions, idempotency where needed |
| **Docs** (D5) | Contracts and behavior changes reflected in `docs/`? Story status and indexes updated? `verify-docs.mjs` passes? |
| **Scope and style** | Unrelated changes, reformatting, dead code introduced, conventions from `conventions.md` / AGENTS.md followed |

Run the test suite and `verify-docs.mjs` if they have not been run on this exact state — report results as executed.

### How to grade an area

Grade each area of the table on its own, then combine. An impression formed after skimming hides the one area that
fails. For each area ask these in order and stop at the first that fails:

1. **Is it there?** The thing the area asks about exists in the diff — a test per AC, a validation, a contract line, the
   doc update.
2. **Does it hold?** It would fail without the change, and it matches the docs exactly — name the command or line that
   proves it.
3. **Does it fit?** It follows the surrounding code and `conventions.md`, not a pattern invented for this change.

What the area does not grade is at most a Nit: formatting, comment style, commit wording, and anything `.agents/rules/`
does not require. A wall of nits never adds up to a Critical.

### Two passes

Run § 3 twice, each pass working only from the diff, the story and the docs — not from the other pass:

- **Pass A — requirement**: AC by AC against the code and its tests, contract against `02-reference/`, the doc updates
  (D1, D2, D5).
- **Pass B — risk**: security and rule 06, robustness, scope and style (D3, D4).

A finding both passes reach is confirmed. A finding only one reaches is reported and marked `[single pass]`. When the
two passes disagree about whether an AC is met, that disagreement **is** the finding — report it instead of quietly
picking the more convenient reading; it usually means the criterion needed interpretation (rule 03 R5) and the story is
what has to change.

## 4. Report

```
Review — <target> (<story id or "no story">)

Critical (must fix before merge)
- path:line — problem → concrete fix (origin: code|story|contract|interview)

Medium (should fix)
- path:line — problem → concrete fix (origin: …)

Nit (optional)
- path:line — suggestion (origin: …)

Definition of Done: D1 ✅ D2 ✅ D3 ❌ (lint: 2 errors) D4 ✅ D5 ⚠️ D6 … D8
Verdict: APPROVE | APPROVE WITH NITS | CHANGES REQUIRED
```

Every finding carries its **origin** — the stage that produced it, not the line it landed on:

| Origin | The defect was introduced by |
|--------|------------------------------|
| `code` | the implementation: the criterion was clear and the code does not do it |
| `story` | the acceptance criteria: missing, ambiguous, or not decidable without asking |
| `contract` | `02-reference/` or the story's contract: the doc and the code cannot both be right |
| `interview` | the brief: a fact the work needed was never settled |

An issue in the change that only exists because something upstream is wrong gets that upstream tag plus the fix that
removes it ("story: AC3 does not say which role may cancel → split into admin/user criteria"). The tag is what makes a
pile of findings readable as a trend: countable per stage, it says whether the next fix belongs in `cpt-interview`,
`cpt-docs`, `cpt-plan` or the code.

Grade D8 (changes committed) as **ready to commit** when reviewing a working tree: `cpt-ship` commits after this
review (§ 8), so a commit cannot exist yet. Grade it as failed only when the project commits before review and the
commit is missing.

- Every finding names a location and a fix. No vague "consider improving".
- Only report what you verified. Mark a suspicion you could not confirm as "unverified".
Verdict mapping:

| Findings | Verdict |
|----------|---------|
| Any Critical, or any failed DoD item | CHANGES REQUIRED |
| Medium (no Critical) | CHANGES REQUIRED — unless the user explicitly accepts each Medium as follow-up; then record each as a new story or open question and the verdict is APPROVE WITH NITS |
| Nits only | APPROVE WITH NITS |
| None | APPROVE |

Review the **story's own changes plus any test or infrastructure code they rely on** — an issue found in an
already-merged story is reported as a separate finding with "pre-existing in US-…" and handled as a fix story, not
as a blocker of the current one.

Not in scope: whether the change is deployed, and whether operations has a runbook for it. Those are
`cpt-release` and `cpt-ops`; a review may note the gap, but a missing release record is not a review finding.
