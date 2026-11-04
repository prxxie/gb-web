# Weekly data contract

Every field [`build_weekly_report.mjs`](../scripts/build_weekly_report.mjs) reads, and **where its value comes from**.
A field marked *input* cannot be derived from the repository and must come from the user. A complete filled example
is [weekly-data.example.json](weekly-data.example.json).

The rule this file enforces: **a number in the workbook comes from a file read or a command run in this session.** If
a value cannot be measured, leave the row out rather than estimate it.

Dates are `YYYY-MM-DD` in the JSON; the workbook shows them as `YYYY.MM.DD`, the template's format. Free text is in
English unless the brief (`13. Delivery → Reporting language`) or the user names another language; the template's own
labels stay as they are.
Never translate story ids, OQ ids, or file paths.

## 1. `meta` → banner, sheet subtitles, file name

| Field | Value | Source |
|-------|-------|--------|
| `project` | Short project name; becomes `<project>_Weekly Report_YYYYMMDD~YYYYMMDD.xlsx` and every sheet banner | `AGENTS.md` § PROJECT or the brief title |
| `period.from` / `.to` | The reporting week, Monday to Friday | Today's week unless the user names one |
| `period.label` | e.g. `Week 2 of Sprint 1` | Delivery plan sprint table; omit the sprint part if the plan has no calendar |
| `nextPeriod.from` / `.to` | Next week | |
| `sprint` | Sprint name and dates, and whether it closes this week | Delivery plan |
| `overallStatus` | 2–3 sentences: committed vs delivered, the main blocker with its OQ id | Counted from `tasks` and `risks` — not a mood |
| `preparedBy`, `issued` | | *input* (default: the user's name, today) |
| `measuredOn`, `measuredAgainst` | Date and the commit the metrics ran on, e.g. `main @ 1f09209` | `git rev-parse --short HEAD` |

## 2. `progress[]` and `people[]` → sheet *Weekly Report*

`progress`: `{ phase, task, current, next }`, one row per workstream (Requirement & Analysis, one row per active epic,
Quality, …). `current` and `next` are multi-line: numbered items separated by `\n`, plus a `* Ref. <doc>` line when a
document backs it. `current` comes from the week's commits:

```bash
git log --since=<from> --until=<to + 1 day> --pretty=format:"%ad|%an|%s" --date=short
```

`next` is a decision, not a derivation: take it from the user, or from the next stories in the delivery plan, and say
which.

`people`: `{ role, name, contribution, plan }` — the *Personal Report*, **one row per team member**. It is the part the
team reads, so build it per person, not per workstream:

```bash
git log --since=<from> --until=<to + 1 day> --pretty=format:"%an" | sort | uniq -c   # who committed
git log --since=<from> --until=<to + 1 day> --author="<name>" --pretty=format:"%ad %s" --date=short
```

- **Who**: everyone on the team, including members with no commits this week (testing, review, analysis, leave do not
  show in git — ask). Git identities map to full names and roles through the user; ask once and keep the mapping in
  the JSON, never guess it from an email address.
- **`contribution`**: one line per item, as the template asks — **Action + Object + Result/Output + Status + Target
  date**, with the story id: `US-CLAIM-003 move a claim between states → merged to main, Done, 2026.10.23`. Work in
  review says `in review`; work not in git (manual testing, a client workshop) is still listed, marked as reported by
  the user.
- **`plan`**: **Action + Object + Expected result + Target date**, one line per item, from the stories the person
  takes next week (*input* or the delivery plan — say which).
- The rows must agree with `tasks[]`: every `Done` or `In Progress` task's assignee has it in their `contribution`.

`capacityNote`: the gap between available man-days (sheet *Leave Plan*) and the committed load (sheet *WBS Timeline*),
and what absorbs it.

## 3. `leave[]` and `capacity[]` → sheet *Leave Plan*. *Input*

Absence is not in git. Ask for it. If the user does not supply it, write `Not supplied` in both columns and say so in
the response — never present a full team silently.

`leave`: `{ role, name, current, next, impact }`. The day columns are Excel formulas that **count words**, so the
wording is a contract:

| Write | Counts as |
|-------|-----------|
| `Full day` | 1 day each time it appears |
| `Morning`, `Afternoon` | 0.5 day each |
| anything else (`No leave`, `Not supplied`) | 0 |

Format several dates as `2026/10/23 – Full day; 2026/10/24 – Morning`. `20/10 off` counts as 0 — a silent error.
Team size on the capacity table is `COUNTA` of these names, so list everyone, including people with no leave.

`capacity`: exactly two rows, **current week then next week**: `{ week, workingDays, note }`. The first uses the
current-week leave total, the second next week's; sheet 1's *Team availability* reads the second. Set `workingDays`
below 5 for a public holiday.

## 4. `tasks[]` → sheet *Task Detail*

`{ storyId, task, module, assignee, status, notes }`, every story worked on in the week plus anything committed for the
sprint. `storyId` is the story id, or omit it for work that is not a story (it renders `—`). `module` is the epic title.

`status` must be one of the template's drop-down values, and drives the Progress formula:

| CPT story `status` | Template status | Progress |
|--------------------|-----------------|----------|
| `draft`, `ready` | `To Do` | 0 % |
| `in-progress`, branch open | `In Progress` | 50 % |
| `in-progress`, merge request open | `In Review` | 70 % |
| merged, awaiting acceptance | `Ready to Test` | 80 % |
| `done` | `Done` | 100 % |
| `closed` | `Canceled` | 0 % |
| `blocked` | the workflow position it is stuck in, with `Blocked by OQ-nn` in `notes` | |

The generator rejects any other value. Read the status from the story frontmatter and confirm movement from git
(`git log --since=<from> -p -- docs/03-stories` shows the `status:` lines that changed).

`notes` is the most valuable column: write what a reader could not infer — the decision taken, the trap avoided, what
is deliberately not done, and every risk, block or dependency.

## 5. `wbs` → sheet *WBS Timeline*

```json
{ "sprintWeeks": 2, "caveat": "optional text appended to the subtitle",
  "sprints": [{ "name": "S1", "from": "2026-10-12", "to": "2026-10-23" }],
  "rows": [{ "phase": "EPIC-01  Claims  (3 of 6)", "owner": "Dev team", "status": "In progress", "md": { "S1": 6 } }],
  "milestones": [{ "name": "UAT start", "endDate": "2026-11-16", "scope": "…" }] }
```

- `sprints`: any number. The template has six columns; unused ones are hidden, extra ones are inserted.
- `rows`: one per epic (or phase). Put progress in the name, `(done of total)`, from the `cpt:epics` table in
  `docs/03-stories/README.md`. `status` is one of `Done`, `In progress`, `At risk`, `Planned`, `Blocked`.
- `md`: man-days per sprint, keyed by sprint `name`, from the delivery plan's story sizes (S = 1, M = 2.5, L = 4.5).
  Cells are coloured by the row's status; Duration and the sprint-load row are formulas.
- **Never invent a calendar the delivery plan does not have.** If the plan has waves but no dates, map waves to sprints
  only with the user's agreement, and say so in `caveat`.

## 6. `metrics[]` → sheet *Quality Metrics*

`{ metric, result, target, status, notes }`. `status` is `Pass`, `Needs Improvement`, `At Risk` or `Blocked`. Each row
comes from a command run this session — put the command in `notes`. Typical rows:

| Metric | Command |
|--------|---------|
| Documentation integrity | `node .agents/scripts/verify-docs.mjs --strict` |
| Unit / integration tests, coverage | `PROJECT → Test` command in `AGENTS.md` |
| Lint, type check | `PROJECT → Lint / typecheck` command |
| Test cases traced (full tier) | count TC rows in `docs/05-quality/test-cases.md` against ACs |

A command that cannot run (no runtime, no CI yet) is a `Blocked` row naming why — not an omitted one, if the client
expects it.

`qualityNote`: trend, metrics below target, root cause, and the corrective action for next week.

## 7. `risks[]` → sheet *Risks & Open Questions*

`{ ref, item, impact, raised, due, owner, severity }`, from `docs/04-decisions/open-questions.md` (open ones, plus
those answered this week) and the delivery plan's gates.

- `ref` is the `OQ-nn` (or `R-nn` for a risk that is not a question). `raised` is the OQ's `Raised` date.
- `impact` says what cannot ship, in the client's terms, with the story ids.
- `due`: the gate date from the delivery plan, or a sprint name.
- `severity`: `Critical` (blocks the current or next sprint), `High`, `Medium`, `Low`, or `Resolved` (answered this
  week — keep these at the bottom so the register shows answers turning into work).

`actionRequired`: the decisions needed, by when, from whom, and the default outcome if the date passes.
