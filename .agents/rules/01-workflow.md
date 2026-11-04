# Rule 01 — Workflow

How any task in this repository moves from request to result.

## 1. Classify the request first

| The request is… | Do this |
|-----------------|---------|
| A repository that already has code but no `docs/00-source/brief.md` | `cpt-adopt`, then `cpt-interview` for the intent gaps it lists |
| A new idea or a project with no `docs/00-source/brief.md` | `cpt-interview` (run `cpt-ingest` first if `docs/00-source/` holds specs) |
| "Generate / regenerate the docs" | `cpt-docs` |
| "Which stack packs do we need?", the stack changed, a new layer (container, queue, frontend, model eval) | `cpt-pack` |
| "Break it into stories", "plan the work" | `cpt-plan` |
| "Build / implement / ship US-…" | `cpt-ship <STORY-ID>` |
| "Review this", "check my changes" | `cpt-review` |
| "Release / deploy / cut a version / promote to prod / hotfix" | `cpt-release` |
| Something is down or degraded, "runbook", "SLO", "postmortem", incident | `cpt-ops` |
| "Sign off", acceptance, UAT, phase or milestone gate (full tier) | `cpt-signoff` |
| "Where are we?", weekly / sprint report | `cpt-report` |
| "Draw it", brainstorming or comparing architecture options, a picture for an architecture page or ADR | `cpt-visual` |
| The client or user changed a requirement | `cpt-change` |
| A question nobody can answer yet, or a decision to record | `cpt-decide` |
| A question about the code or docs | Answer it. Do not edit files |
| A small fix outside any story (typo, broken build) | Do it, but say which story or doc it relates to, if any |

## 2. Think before acting

Before writing code or docs, state in ≤3 lines: the success criterion, the critical assumptions, and how you will
verify. Pick the most likely interpretation; ask only when interpretations diverge materially **and** the work is
costly to reverse.

## 3. When information is missing

Never fill a gap with a plausible guess. In order of preference:

1. Find it — in `docs/`, the code, or official documentation.
2. Ask the user, offering a recommended default.
3. If the user **delegates** ("you decide"): it is decided — apply your recommended default, record it as
   `[user: delegated]` (an ADR for technical choices), and do not open a question.
4. If **nobody present can answer** ("need to ask HR"): record an **open question** (`cpt-decide`) with the default
   you will use in **Assumption**. Affected stories are either `blocked` (the answer could change their acceptance
   criteria and the default is not acceptable) or proceed with the question in `accepted_assumptions` (the user
   agreed to build on the default) — see rule 03 R4.

## 4. Scope discipline

- Every changed line traces to the request or the story.
- Do not refactor, reformat, or "improve" adjacent code.
- Do not add dependencies, abstractions with fewer than two uses, or speculative configuration.
- Remove code made unused by your change; leave pre-existing dead code alone and mention it.

## 5. Finishing

Report in ≤5 lines: what changed, how it was verified (executed, not assumed), safety flags (⚠️ breaking change,
data migration, security-sensitive), and assumptions that would change the result if wrong.

## 6. Overriding a rule

A hard rule in `AGENTS.md` or in this directory is a default, not a veto. A user who says **"override rule N —
reason"** is making a decision, and refusing it would be its own kind of guessing. Follow the work, then record it:

- One line in the commit body: `Override: rule <N> — <reason> (asked by <who>)`.
- If it changes behavior, contracts, or data, record it where that belongs too: an ADR via `cpt-decide` for a technical
  choice, a change request via `cpt-change` for a requirement. The docs must not silently disagree with the code.
- If it applies only to this change, say so in the report and leave the docs untouched.

Three limits:

- **Security is not overridable.** Rule 06, and "no secrets" in hard rule 7, are refused with a one-line reason and a
  safe alternative. If the user insists, they are accepting a risk: ask them to state it in writing, and stop.
- **"Do it quickly" is not an override.** It is a request to skip work; name the rule it would skip and let the user
  decide with that on the table.
- **A request that names no rule is not an override.** It is either already allowed (§1, last two rows) or a change to
  the work, which is `cpt-change`.
