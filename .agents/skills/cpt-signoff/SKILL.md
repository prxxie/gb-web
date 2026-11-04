---
name: cpt-signoff
description: Run the full-tier stage gates — requirements baseline, design baseline, acceptance/UAT, and release readiness — by collecting the evidence each gate needs, recording who signed or waived it in docs/05-quality/acceptance-signoff.md, and refusing a signature that has no evidence. Use when the user asks for client sign-off, acceptance, UAT, a milestone or phase gate, a go/no-go, or "are we approved to release".
---

# cpt-signoff [status | sign <G#> | waive <G#> | reopen <G#>]

The rest of the kit grades **work**: a story is ready, a change is reviewed, a record is deployed. This skill grades
**phases**, which is what a client, an auditor, or a steering committee actually asks for: was the requirement frozen,
was the design approved, was it accepted, was it cleared to run.

Full tier by default. `standard` projects may adopt it when someone outside the team must approve a milestone; `lite`
never runs it (`.agents/skills/cpt-interview/references/tiers.md`).

## 1. The four gates

One file — `docs/05-quality/acceptance-signoff.md` — one row per gate, created by `cpt-docs` at full tier from
`.agents/templates/signoff.md`. Rows are never deleted; a gate that is re-opened keeps its history in `## History`.

| Gate | Phase | Signed when | Evidence that must already exist |
|------|-------|-------------|----------------------------------|
| **G1** | Requirements baseline | Scope is agreed and the backlog is planned against it | Brief `status: confirmed` · every in-scope story `ready` with decidable ACs (R5) · open questions either answered or listed in `accepted_assumptions` · `03-stories/delivery-plan.md` naming this milestone |
| **G2** | Design baseline | The contracts are specified and checkable | `01-overview/architecture.md` and `02-reference/` complete for in-scope layers · every contract table names its oracle · NFRs measurable (`NFR-<nn>`) · ADRs for the choices a newcomer would question |
| **G3** | Acceptance / UAT | The milestone's stories are accepted by the signer | Every story in scope `done` (DoD verified) · each `TC-…` executed with its result · open defects triaged by severity with an agreed disposition · UAT run by the accepting role, not by the team |
| **G4** | Release gate | Production may be touched | `cpt-release` RR1–RR8 green · rollback written and rehearsed · runbook and SLO written · the release record exists with `status: planned` |

A gate is **per milestone**, not per project: G1/G2 once at the start (re-signed after a baseline-changing CR), G3/G4
for each milestone or production release. Reuse the row by appending to `## History` and resetting `Status: pending`.

## 2. `status` — what is pending

Read the file and report, without changing anything:

```
Gate status — <project> — <milestone>
G1 Requirements baseline  signed   2026-10-24  by <role>   evidence: brief.md, delivery-plan.md
G2 Design baseline        pending  missing: contract oracle for 02-reference/api/claims.md
G3 Acceptance             pending  12/15 stories done · TC-… 9 executed · 2 open defects (1 P1)
G4 Release               pending  cpt-release not run
Verdict: not cleared for production
```

The report names the **gap**, not just the state: "missing X", "3 stories not done", "defect P1 undispositioned".
`G4 pending` is the normal answer until `cpt-release` runs, and `cpt-release` refuses production while G4 is unsigned
(full tier).

## 3. `sign <G#>` — the gate

Before writing anything, collect the evidence and check it:

1. Walk the gate's row in § 1 and confirm each item exists **and says what it must say**. A doc that exists but has an
   empty contract table is not evidence.
2. Re-run the mechanical part where it exists: `verify-docs.mjs --strict`, the test suite, the TC table. Report as
   executed, never as assumed.
3. Present a go/no-go summary: the gate, the evidence with links, every open defect and question with its disposition,
   and the exact risk the signer is accepting. Then **stop and wait for the named signer**.
4. On approval, write the row: `Status: signed`, `Signed by` (person or role), `Role`, `Date` (YYYY-MM-DD), and
   `Evidence` as resolvable links. Append the event to `## History`.

Never sign on someone's behalf. "The client said it's fine in the call" is not a signature unless the user states who
accepted and on what date — then record exactly that, and the word `verbal` in `Note`. A gate signed by the team for
the team is not a gate; say so and leave it `pending`.

## 4. `waive <G#>` — accepting a known gap

A waiver is a decision with a name on it, not a shortcut:

1. State what is missing, what risk that creates, and what the compensating control is (monitoring, manual check,
   limited rollout, date of the follow-up story).
2. Get the risk accepted explicitly by someone entitled to accept it. If nobody present can, the gate stays `pending`
   and the gap becomes an open question (`cpt-decide`).
3. Record `Status: waived`, the accepter, the date, and in `Note`: the gap, the risk, the compensating control, the
   follow-up story id.

Two things are never waived, mirroring `rule 01 § 6`:

- **Security** (`rule 06`): an open Critical security finding blocks a gate; the answer is a fix, not a waiver.
- **A gate with no evidence at all**: that is not a waiver, it is no gate. Missing evidence means `pending`.

## 5. `reopen <G#>`

Re-open when the basis changed after the signature:

- a change request alters scope, contracts, or data → `cpt-change` decides whether G1/G2 must be re-signed;
- a released defect invalidates the acceptance → G3 re-opens with the defect and the fix story;
- a release was rolled back → G4 re-opens until a green release record exists.

Set `Status: pending`, keep the old signature in `## History` with the reason for re-opening, and name what must be
re-proven. A silently re-signed gate is the failure mode this skill exists to prevent.

## 6. Report

```
Gate G3 — Acceptance / UAT — <milestone>
Evidence: 15/15 stories done · TC-… 15 executed, 15 passed · defects: 0 open P1/P2 · UAT by <role>
Signed: <name/role> 2026-10-27 · file: docs/05-quality/acceptance-signoff.md
Next: G4 (release gate) — cpt-release REL-004 is planned; run cpt-signoff sign G4 after RR1–RR8 are green.
```

- `cpt-report` includes gate status for the period; an unsigned G3 with stories marked done is a risk worth surfacing.
- A signature is a fact with a date — never edit an old row to change it. Append, re-open, re-sign.

## 7. Things this skill never does

- Sign a gate on your own authority, or infer a signature from silence, a meeting, or a green build.
- Treat "UAT passed" as evidence when no `TC-…` result exists.
- Waive security, or waive a gate whose evidence is missing rather than incomplete.
- Delete or rewrite history rows to make a gate look cleaner.
- Block work that the tier does not require: outside full tier (or an explicit request), this skill stays out of the way.
