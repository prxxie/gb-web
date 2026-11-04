---
name: cpt-ops
description: Keep the running system documented and handle it when it misbehaves — maintain the runbook, SLOs, and error budget in docs/08-ops/, open and resolve incident records, write postmortems, and turn every action into a story. Use when something is down or degraded, when the user asks for a runbook, on-call guide, SLO, monitoring plan, incident report, or postmortem.
---

# cpt-ops [runbook | slo | incident | postmortem] [<INC-id>]

The lifecycle does not end at `deployed`. This skill owns the three documents that keep a deployed system operable and
the one procedure that runs when it is not:

| Artifact | Path | Answers |
|----------|------|---------|
| Runbook | `docs/08-ops/runbook.md` | "It is 02:00 and this is broken — what do I run?" |
| SLOs | `docs/08-ops/slo.md` | "Is it healthy, and how much budget do we have left to break it?" |
| Incident | `docs/08-ops/incidents/INC-<nnn>-<slug>.md` | "What happened, what did we do, what stops it recurring?" |

Read first: `docs/01-overview/deployment.md` (environments, who may deploy), `01-overview/nonfunctional-requirements.md`
(the NFRs that become SLOs), the newest release record in `docs/07-release/`, and `rule 06` (secrets, PII, logging).

**Tier:** `lite` keeps a runbook only if the thing runs somewhere other people depend on; `standard` and `full` keep all
three. An incident record is never optional for an environment other people use.

## 1. Runbook

`docs/08-ops/runbook.md` — organised by service, then by symptom, because nobody reads it top to bottom at 02:00.

```markdown
## <service> — <environment>

- **Health check**: <url or command> → expected `<body/status>`
- **Logs**: <where, exact query> · **Metrics**: <dashboard link>
- **Start / stop / restart**: <exact commands>
- **Config**: <which env vars/secrets, where they live — names only, never values>
- **Data**: <where it lives, backup and restore commands, last restore test>
- **Escalation**: <role → contact route> · **Owner**: <role>

| Symptom | Diagnosis | Action |
|---------|-----------|--------|
| `<exact error or alert name>` | `<command that confirms it>` | `<command that fixes it, or the escalation>` |
```

Rules that make it usable:

- Every row ends in a **command or an escalation**, never in "investigate". A row that says "check the logs" is a row
  nobody can act on.
- Symptom text is copied from a real alert or error string, not paraphrased — it is what the responder will grep for.
- The restore command is tested at least once and the date of that test is in the file; an untested backup is a hope.
- No secrets, tokens, or customer data. Names and locations, never values (rule 06).
- Update it in the same change as the behavior it describes: a new environment, endpoint, or dependency is `cpt-release`
  work; a new failure mode discovered during an incident is § 5 work.

## 2. SLOs and error budget

`docs/08-ops/slo.md` — one table, one row per indicator, each row tied to an `NFR-<nn>` id. An SLO with no NFR behind
it is a number nobody agreed to.

| SLI (exact query) | Target | Window | NFR | Error budget | If exhausted |
|---|---|---|---|---|---|
| `<metric/query>` | `99.9%` | `28d` | `NFR-04` | `43m` | `<freeze features until back in budget / page the owner>` |

- The SLI must be computable from a signal that exists: name the metric, log query, or probe. "APdex" with no source is
  not an SLI.
- State the policy, not just the number: what stops when the budget is spent (features, releases, both), and who decides
  otherwise.
- An NFR marked `operational` (backups, uptime monitoring) gets a check and an owner here, not a target invented to fill
  the cell.

## 3. Incident — open

Create `docs/08-ops/incidents/INC-<nnn>-<slug>.md` with `.agents/templates/incident.md`, `nnn` continuing from the
highest existing record.

Severity decides who and how much, not how bad it feels:

| Severity | Meaning | Record requires |
|----------|---------|-----------------|
| `SEV1` | Users cannot use a core flow, or data is at risk | Postmortem, gate-level review, `cpt-report` entry |
| `SEV2` | A core flow is degraded or a secondary flow is down | Postmortem |
| `SEV3` | Limited impact, workaround exists | Root cause and actions |
| `SEV4` | Cosmetic or internal-only | Actions |

During the incident, **mitigate first and record as you go** — the timeline is written live, in UTC, one row per event
(detected, alerted, responded, mitigated, resolved), with who did what. A timeline reconstructed afterwards loses
exactly the minutes you need to fix the detection gap.

Secrets, tokens, customer identifiers, and PII never appear in the record. Say "credential rotated (ref: vault path)",
not the value.

## 4. Incident — resolve

1. Restore service by the safest route: roll back with `cpt-release § 7`, fail over, disable the feature, or hotfix
   (`cpt-release --hotfix`, which needs a `fix:` story).
2. Confirm with the same check that showed the failure — recovery is measured, not announced.
3. Fill `resolved`, and the impact in user terms: who, how long, what data, what was lost.
4. Root cause: the **mechanism**, not the blame ("migration 0042 held a lock for 40 minutes because the backfill ran in
   the same transaction"), and why detection took as long as it did.
5. Close only when every action has an owner and an id.

## 5. Follow-ups are stories

Every action becomes a story through `cpt-plan` (`fix:` in the title, `depends_on` the story that introduced the
defect), or an open question through `cpt-decide` when the fix is a decision. The incident's `## Actions` table lists
the ids; `verify-docs.mjs` warns about an action that names no story and no recorded reason.

Never fix the defect inline as part of "closing the incident": an unreviewed fix during an incident is how the second
incident starts. A mitigation that needs code goes through `cpt-release --hotfix` like any other.

## 6. Postmortem

Blameless, and about the system: what made the failure possible, what made it slow to detect, what made it slow to fix.
A postmortem that names a person is a report nobody will write honestly next time.

| Section | Content |
|---------|---------|
| Summary | 3 lines: what broke, for whom, for how long |
| Impact | Users, duration, data, money or SLA — whatever the brief measures |
| Timeline | The § 3 table, cleaned up but unedited in substance |
| Root cause | The mechanism, and the contributing conditions |
| Detection | Why the alert did or did not fire; the gap in minutes |
| Response | What worked, what cost time |
| Actions | Story ids, one per row, with owner and due date; a repeat-incident check ("would this alert page now?") |

The last action is always a **test or a check that would have caught it** — a postmortem whose only output is
documentation has not changed the system.

## 7. Report

```
INC-003 — SEV2 — claim intake returned 500s for 38 minutes
Mitigated: rollback to REL-002 at 14:12 UTC · Resolved: 14:31 UTC · Checks green
Impact: ~120 claims retried by users; no data loss
Root cause: <mechanism>
Actions: US-CLAIM-014 (alert), US-CLAIM-015 (guard), OQ-12 (retention decision)
Runbook: row added for <symptom> · SLO: error budget spent 62%
```

- `cpt-report` reads `08-ops/incidents/` for the period; a SEV1 reaches the weekly report without anyone remembering it.
- A runbook row that was missing, wrong, or unreadable during the incident is fixed now, and the fix is in the report.

## 8. Things this skill never does

- Reconstruct a timeline from memory and present it as a record.
- Name a person as the cause.
- Close an incident with no root cause, or actions with no story ids.
- Put secrets, tokens, PII, or customer data in any `08-ops/` file.
- Edit application code to "stabilise" outside the story + review + release path.
- Let an NFR marked `operational` stay ownerless.
