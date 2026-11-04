# Doc specs

Required sections for every generated doc. A section with nothing to say gets one line explaining why, not deletion.
Sizes are guides; split a file that grows past ~400 lines.

## Quality criteria

Grade each doc against the criteria for its type before moving on — narrow enough that a failure says what to change.
Anything neither high nor low is not a criterion: length, tone and formatting are never reasons to rewrite a doc.

| Doc | Criterion | High | Low |
|-----|-----------|------|-----|
| `docs/README.md` | Routing | Every role in the brief reaches its doc in one hop; no dead entry in the start-here table | A list of every file, or a role missing |
| `01-overview/project-overview.md` | Scope boundary | In scope and out of scope both name real items; a reader can refuse a request from it | In-scope only, or "out of scope: see brief" |
| `01-overview/architecture.md` | Traceability | Every component owns data or a flow; every external system appears in a key flow; a rendered diagram, when one exists, shows the same components as the table | Components listed by technology alone; flows invented; a picture the table contradicts |
| `01-overview/glossary.md` | Code names | Every domain term and status value carries the identifier used in code and the DB | Terms without a code name, or synonyms as separate rows |
| `01-overview/nonfunctional-requirements.md` | Measurability | A number and how it is measured, or the word `operational` | "Fast", "secure", "scalable" |
| `01-overview/conventions.md` | Decidability | Each rule tells the agent what to do in a case it will hit | Pack values restated, or preferences |
| `02-reference/*` | Oracle | Each contract table says how it is checked: an `Oracle` column, a `TC-…` id, or a `tests/…` path | A table nothing would fail against |
| `02-reference/*` | Completeness | Every field, status, error and permission a story needs, with its exact name | Happy path only |
| `environment-setup.md`, `deployment.md` | Runnability | The commands the project will actually run, in order, from a clean checkout | "Install dependencies" without the command |
| `04-decisions/adr/*` | Reversibility | Decision in one sentence, each rejected alternative with the reason it lost, what becomes harder; a decision with a shape carries a `## Diagram` | A narrative of the discussion |
| `07-release/REL-…` | Reconstructability | A stranger can rebuild and redeploy this version from the record alone: commit, commands, config names, rollback | "Deployed to prod ✅", or a rollback that says "revert" |
| `08-ops/runbook.md` | Actionability | Every failure-mode row ends in a command or an escalation, and the symptom is a real alert or error string | "Investigate the logs" |
| `08-ops/slo.md` | Computability | Each SLI names the query or metric it is computed from and the `NFR-nn` behind it | "99.9% uptime" with no source |
| `08-ops/incidents/INC-…` | Mechanism | Root cause says how the failure was possible; every action is a story or question id | A person's name, or "human error" |
| `05-quality/acceptance-signoff.md` | Evidence before signature | Every `signed` row resolves to evidence that existed before the signature | A signature with an empty evidence cell |

The Oracle row is enforced: `verify-docs.mjs` warns about a reference doc with a contract table that names no oracle,
because a contract nothing checks is a contract that drifts.

## docs/README.md

- One-paragraph description of the product and a facts table: tier, project types, stack, stack packs.
- Counts come from a generated block, never typed by hand:
  `<!-- cpt:stats -->` + newline + `<!-- /cpt:stats -->` (filled by `verify-docs.mjs --fix`).
- **Start here** table: "You are… → Read" rows for: new to the project, setting up locally, each relevant role
  (backend, frontend, mobile, data, QA, PM/BA), using an AI agent (→ `AGENTS.md`). The "picking up work →
  `03-stories/README.md`" row is added by `cpt-plan` once the backlog exists.
- **Layout** tree of the folders that exist in this tier, one line each.
- **Blocking open questions**, if any, with links.

## 01-overview/project-overview.md

Purpose · Users and actors (table) · Goals and success measures · In scope (by module or epic area) · Out of scope ·
Constraints · Key numbers (screens, endpoints, entities, integrations — whatever applies).

## 01-overview/architecture.md

- **Context**: the system, its users, and external systems — a Mermaid `flowchart` diagram plus a table.
- **Diagram** (when the project has [cpt-visual](../../cpt-visual/SKILL.md)): a rendered file from the diagram home, or
the Mermaid block above standing in for it — the same components, never a second, richer picture. Keep the Mermaid
block either way: it is what a reader sees without opening an HTML file.
- **Components**: one row per deployable or module — responsibility, technology, owns which data.
- **Key flows**: 2–4 most important flows as numbered steps or a Mermaid `sequenceDiagram`.
- **Cross-cutting**: auth, error handling, logging, configuration, i18n — one short paragraph each, linking to
  conventions.
- **Source layout**: planned repository directory tree with one line per directory.
- **Lite tier only**: add short sections for glossary, NFRs, and the main contracts (endpoints / screens / commands)
  instead of separate files.

## 01-overview/glossary.md

Table: Term · Meaning · Code name (identifier used in code/DB) · Notes. Include every domain term and every status
value. Agents use the code name column to avoid inventing identifiers.

## 01-overview/nonfunctional-requirements.md

One section per area (performance, availability, security, privacy, accessibility, localization, audit, observability,
compatibility). Each requirement is measurable and has an id `NFR-<nn>` so stories can reference it. A requirement met
by operations rather than code (backups, uptime monitoring) says `operational` on its line; every other NFR must be
referenced by at least one story (`cpt-plan` ensures it; the verifier warns otherwise).

## 01-overview/conventions.md

Project-specific working agreement. `cpt-pack` writes the first table (pack → layer → link); `verify-docs.mjs` checks
the `AGENTS.md` stack-packs line against the installed `.agents/skills/cpt-stack-*`, so keep both in step when a pack is
added or retired. Then record
only what the packs do not decide or what this project does differently: chosen libraries (driver, auth library),
sync vs async, API/response conventions (envelope, paging, error body, ids, dates), configuration and env vars
(`.env.example` names), naming specific to this domain. For layers without a pack, cover repository layout, naming,
error handling, logging, test framework and locations, and lint/format tools. Mark each convention that is a
recommendation rather than a user decision.

## 01-overview/roles-and-permissions.md

Role list with descriptions · Permission matrix (rows = actions or resources, columns = roles) · Object-level rules
(ownership) · How roles are assigned.

## 01-overview/workflow-state-machine.md

One section per stateful entity: Mermaid `stateDiagram-v2` · transition table (from · to · trigger · who · guard ·
side effects) · terminal states.

## 01-overview/environment-setup.md

Prerequisites with versions · clone and install · configuration (env vars table: name, required, example, purpose) ·
run locally · run tests · common problems. Commands not yet verified are marked `(planned)`.

## 01-overview/deployment.md

Environments table · build and release pipeline · configuration per environment · rollback · who can deploy.

## 02-reference/api/

`README.md`: conventions summary, auth, error codes table, and an endpoint index (method · path · purpose · roles ·
story — `—` until `cpt-plan` fills it). One file per resource with, per endpoint: request (params, body schema table), responses (status · body ·
when), errors, permissions, example. Anchors per endpoint.

## 02-reference/data/

`README.md`: Mermaid `erDiagram` and entity index. One file per domain area with, per table/collection: purpose,
columns (name · type · null · default · description), keys and indexes, relations, retention. Note which values are
code-managed enums (link to glossary).

## 02-reference/screens/

`README.md`: screen index (route · name · roles · stories — `—` until `cpt-plan` fills it) and navigation map. One file per screen: purpose, layout
areas, fields (name · type · validation · source), actions (label · effect · API · permission), states (loading,
empty, error), and links to designs in `00-source/`.

## 02-reference/cli.md

Global options · one section per command: synopsis, arguments and flags table, examples, output (human and `--json`),
exit codes, config/env interaction.

## 02-reference/public-api.md

Install · one section per exported module/class/function: signature, parameters, returns, errors raised, example,
stability (stable / experimental). Compatibility and deprecation policy.

## 02-reference/pipelines.md

One section per flow or pipeline: trigger/schedule · source → transformations → destination (table) · field mapping
or schema · volumes · failure handling and retries · idempotency · monitoring. For ML: dataset, model, evaluation
metric and threshold, serving path.

## 07-release/

`README.md`: one paragraph of purpose plus the `<!-- cpt:releases -->` block (generated from the records — never typed).
It answers "what is running in production right now" in one table.

One file per release, `REL-<nnn>-<slug>.md`, from `.agents/templates/release.md`. Frontmatter:

```yaml
---
id: REL-004                 # must match the filename prefix
version: 1.4.0              # <major>.<minor>.<patch>, chosen per cpt-release § 2
date: 2026-10-27
environment: production     # staging | production
status: deployed            # planned | deployed | rolled-back
previous: 1.3.2             # previous deployed version, or none
stories: [US-AUTH-003]      # every story included, all of them done
commit: 1a2b3c4             # the sha actually deployed
approved_by: <role>         # required for production
deployed_at: 2026-10-27T14:12:00Z
---
```

Sections: Included stories · Changes (⚠️ breaking first) · Migrations (forward, backfill, reverse, backup) ·
Pre-release gates (RR1–RR8 with evidence) · Deployment (per environment, commands and result) · Post-deploy checks ·
Rollback (trigger, steps, data implications, who) · Notes. `verify-docs.mjs` rejects an empty required section, a story
that is not `done`, a `deployed` record without `commit`, and a production record without `approved_by`.

A record is written before deploying (`status: planned`) and finalized after verification. Never rewritten to hide a
failed release — `rolled-back` is an honest status.

## 08-ops/runbook.md

One section per service and environment: health check with its expected response · where logs and metrics live ·
start / stop / restart commands · configuration (names and locations, never values) · data location, backup and restore
commands with the date the restore was last tested · escalation route and owner. Then a failure-mode table
`Symptom | Diagnosis | Action` whose symptom column holds the literal alert or error string. Structure and the quality
bar are in `cpt-ops` § 1.

## 08-ops/slo.md

One table: `SLI (exact query) · Target · Window · NFR · Error budget · If exhausted`. Every row names the signal it is
computed from and the `NFR-nn` it serves; an NFR marked `operational` gets a check and an owner here instead of a
target. State the policy — what stops when the budget is spent, and who can override it.

## 08-ops/incidents/

One file per incident, `INC-<nnn>-<slug>.md`, from `.agents/templates/incident.md`. Frontmatter: `id`, `title`,
`severity` (`SEV1`–`SEV4`), `status` (`open` | `mitigated` | `resolved` | `closed`), `detected`, `resolved`, `release`.
Sections: Impact (users, duration, data, in their terms) · Timeline (UTC, written live during the incident) ·
Mitigation (what actually restored service, commands as run) · Root cause (the mechanism, or `unknown — <what would
find it>`) · Detection (why the alert did not fire sooner) · Actions (story/question ids with owner and due date) ·
Postmortem (SEV1/SEV2, blameless). No secrets, tokens, customer identifiers, or PII.

## 05-quality/acceptance-signoff.md

Full tier. The gate record from `.agents/templates/signoff.md`: one row per gate (G1 requirements, G2 design, G3
acceptance, G4 release) with `Criterion · Evidence · Status · Signed by · Role · Date · Note`, then a `## History` table
of sign, waive, and re-open events. Only `cpt-signoff` writes it. A `signed` row needs evidence that resolves; a
`waived` row names who accepted the risk, the compensating control, and the follow-up story. Security is never waived.
