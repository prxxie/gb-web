---
paths:
  - "docs/**"
---

# Rule 02 — Docs navigation and contracts

The doc set under `docs/` is written for agents first: small files, stable ids, explicit links, and frontmatter that a
script can check. These contracts are enforced by `node .agents/scripts/verify-docs.mjs`.

## 1. Reading order

1. `docs/README.md` — tier, layout, and the "start here" table.
2. `docs/01-overview/project-overview.md` — scope, out of scope, actors.
3. `docs/01-overview/architecture.md` — components and how a request flows.
4. The story you are working on, then **only** the references it links to.

Do not read the whole doc set "for context". Follow links from the story.

## 2. Folder meaning

| Folder | Holds | Who edits |
|--------|-------|-----------|
| `00-source/` | Original input: specs, `brief.md`, `ingest-report.md`, `adopt-report.md`, `change-requests/` | Only `brief.md`, those two reports and new change requests are written; source files are never modified |
| `01-overview/` | Read-once context | `cpt-docs`, `cpt-change` |
| `02-reference/` | Lookup tables: API, data, screens, CLI, codes | `cpt-docs`, `cpt-ship` (when contracts change), `cpt-change` |
| `03-stories/` | Backlog | `cpt-plan`, `cpt-ship` (status), `cpt-change` |
| `04-decisions/` | `open-questions.md`, `adr/` | `cpt-decide`, any skill that finds a gap |
| `05-quality/` | Test cases (full tier) and `acceptance-signoff.md` (the gate record) | `cpt-plan`, `cpt-ship`, `cpt-signoff` |
| `06-reports/` | Reports (full tier) | `cpt-report` |
| `07-release/` | Release records `REL-<nnn>-<slug>.md` and their index | `cpt-release` |
| `08-ops/` | `runbook.md`, `slo.md`, `incidents/INC-<nnn>-<slug>.md` | `cpt-ops` |

## 3. Ids

| Kind | Format | Example | Lives in |
|------|--------|---------|----------|
| Epic | `EPIC-<nn>-<slug>` (directory) | `EPIC-01-auth` | `03-stories/` |
| Epic code | 2–6 uppercase letters, unique | `AUTH` | epic `README.md` frontmatter `code` |
| Story | `US-<CODE>-<nnn>` | `US-AUTH-001` | `03-stories/EPIC-…/US-AUTH-001-<slug>.md` |
| Open question | `OQ-<nn>` | `OQ-07` | `04-decisions/open-questions.md` heading |
| ADR | `ADR-<nnnn>` | `ADR-0003` | `04-decisions/adr/ADR-0003-<slug>.md` |
| Test case | `TC-<CODE>-<nnn>` | `TC-AUTH-001` | `05-quality/test-cases.md` |
| Change request | `CR-<YYYY-MM-DD>-<slug>` | `CR-2026-10-21-export-csv` | `00-source/change-requests/` |
| Release | `REL-<nnn>` | `REL-004` | `07-release/REL-004-<slug>.md` |
| Incident | `INC-<nnn>` | `INC-003` | `08-ops/incidents/INC-003-<slug>.md` |

Ids are never reused. A removed story keeps its file with `status: closed`.

## 4. Story frontmatter

```yaml
---
id: US-AUTH-001                 # must match the filename prefix
title: Sign in with email and password   # imperative, no trailing period
epic: EPIC-01-auth              # must match the parent directory
status: ready                   # draft | ready | in-progress | blocked | done | closed
priority: P1                    # P0 blocks others | P1 core | P2 important | P3 nice-to-have
size: M                         # S ≤1 day | M 2–3 days | L 4–5 days (XL is not allowed — split it)
depends_on: [US-FND-001]        # story ids that must be done first
open_questions: []              # OPEN questions that block this story; required (non-empty) when status is blocked
accepted_assumptions: []        # optional: open questions whose recorded Assumption the user agreed to build on
refs: []                        # optional: doc paths this story relies on, relative to docs/
---
```

| Status | `open_questions` must contain | Enforced |
|--------|-------------------------------|----------|
| `blocked` | ≥1 question that is still `open` | error |
| `ready`, `in-progress`, `done` | no `open` question (answer it, block the story, or move it to `accepted_assumptions`) | error |
| any | answered questions are removed from the list | warning |

`in-progress` and `done` stories require every `depends_on` story to be `done` or `closed`.

## 5. Open questions

`04-decisions/open-questions.md` holds one section per question:

```markdown
## OQ-07 — Do invited users need email verification?

- **Status**: open            <!-- open | answered | withdrawn -->
- **Raised**: 2026-10-21 by cpt-interview
- **Blocks**: US-AUTH-003
- **Assumption**: none        <!-- the default being used until answered, if any -->
- **Answer**: —               <!-- filled when answered, with date and who answered -->
```

All five fields are required. The summary at the top of the file is a generated block (§ 8) — never edit counts by
hand. Questions only the user could answer and that they delegated ("you decide") are **not** open questions.

## 6. Links

- Use relative Markdown links between docs; every link must resolve.
- Link to a heading with `file.md#anchor` when the target file is long.
- Mention ids (`US-AUTH-001`, `OQ-07`, `ADR-0003`) in prose freely; the verifier warns when an id does not exist.

## 7. Writing style

- One topic per file; split a file that passes ~400 lines.
- Tables over prose for anything enumerable (fields, endpoints, roles, errors).
- State facts, not intentions.
- **One assumption marker**: append `[assumption: OQ-nn]` to every statement that rests on an open question's
  default. For a whole paragraph, start it with `> ⚠️ [assumption: OQ-nn]`. When the question is answered, every tag
  for it must be replaced by the decided fact — find them with `grep -rn "assumption: OQ-nn" docs/`; the verifier
  warns about tags of answered questions.
- Other source tags: `[spec: file#section]`, `[user]`, `[user: delegated]`, `[inferred]`.

## 8. Generated blocks

Counts and index tables are generated from frontmatter, never edited by hand:

| Block | Put it in | Renders |
|-------|-----------|---------|
| `<!-- cpt:stats -->` … `<!-- /cpt:stats -->` | `docs/README.md`, `03-stories/README.md`, reports | Story counts by status, open-question counts |
| `<!-- cpt:releases -->` … `<!-- /cpt:releases -->` | `07-release/README.md` | Release table: id, version, date, environment, status, stories |
| `<!-- cpt:epics -->` … `<!-- /cpt:epics -->` | `03-stories/README.md` | Epic table with story / done / blocked counts |
| `<!-- cpt:epic-stories -->` … `<!-- /cpt:epic-stories -->` | each epic `README.md` | The epic's story table |
| `<!-- cpt:oq-summary -->` … `<!-- /cpt:oq-summary -->` | `04-decisions/open-questions.md` | Counts and the question table |

After changing any story or question, run `node .agents/scripts/verify-docs.mjs --fix`: it regenerates every block,
then verifies. Without `--fix`, a stale block is an error.
