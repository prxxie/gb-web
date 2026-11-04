---
name: cpt-report
description: Produce a project status, weekly, or sprint report from the story backlog, open questions, change requests, and git history, saved under docs/06-reports. The weekly report is an Excel workbook filled from the CPT weekly-report template (progress, personal report, leave plan, task detail, WBS timeline, quality metrics, risks and open questions). Use when the user asks "where are we", for a status update, weekly report, sprint review, or a summary to send to a client or manager.
---

# cpt-report [status | weekly | sprint <n>] [--since YYYY-MM-DD]

Default: `status` (as of today). Weekly: the current Monday–Friday week, delivered as the Excel workbook and its covering email in § 3.
Sprint: dates from the delivery plan or as given.

## 1. Gather facts (do not estimate what you can count)

**Delegate this section where the tool allows it** — run `verify-docs.mjs --fix` first, then a read-only subagent can
gather the facts below for the period and return them with their sources; you write § 2 or § 3 from what it returns.
Without one, gather them yourself.

- Stories: current counts come from the `cpt:stats` / `cpt:epics` generated blocks — put them in the report and run
  `node .agents/scripts/verify-docs.mjs --fix` to fill them. Read story frontmatter only for per-story detail.
- Movement in the period: `git log --since=<date> --name-only -- docs/03-stories` to find stories whose status changed;
  confirm by reading the diff of the frontmatter. Commits per story id from `git log --grep`.
- Open questions: open / answered in period / blocking (with blocked story counts).
- Change requests in `docs/00-source/change-requests/` dated in the period.
- Delivery plan: current wave, gates ahead, milestone dates.
- Quality (full tier): latest test results if a report or CI artifact exists — never claim results you did not see.
- Releases: the newest `docs/07-release/REL-…` records with `status: deployed` (what is running now) and any
  `rolled-back` since the period started; incidents opened or resolved from `docs/08-ops/incidents/`.

## 2. Write

`status` and `sprint`: save to `docs/06-reports/YYYY-MM-DD-<kind>.md` (create the folder if needed; in lite/standard
tiers print the report instead unless the user asks to save it). `weekly`: build the workbook in § 3.

```markdown
# <Project> — <Status | Weekly | Sprint n> report — YYYY-MM-DD

## Summary
<3–5 lines: progress in one sentence, the biggest risk, the decision needed from the reader.>

## Progress
| Metric | Value | Change in period |
|--------|-------|------------------|
| Stories done | x / total | +n |
| In progress | | |
| Blocked | | |

### Done in period
| Story | Title | Epic |

### In progress / next
| Story | Title | Expected |

## Decisions needed
| OQ | Question | Blocks | Needed by |

## Changes to scope
| CR | Summary | Effect |

## Releases and incidents
| Item | Version / SEV | Date | Status | Note |

## Risks
| Risk | Impact | Mitigation |

## Plan
<Current wave, next wave, milestone outlook: on track / at risk / late — with the reason.>
```

## 3. Weekly workbook

The weekly report is one `.xlsx` built from [assets/weekly-report-template.xlsx](assets/weekly-report-template.xlsx):
six sheets — *Weekly Report* (progress per workstream, personal report), *Leave Plan* (leave and sprint capacity),
*Task Detail*, *WBS Timeline*, *Quality Metrics*, *Risks & Open Questions*. Never hand-build or hand-edit the workbook:
fill a JSON file and let [scripts/build_weekly_report.mjs](scripts/build_weekly_report.mjs) fill the template.

1. **Gather** the facts in § 1 for the week, then fill a JSON file following
   [references/weekly-data-contract.md](references/weekly-data-contract.md) (start from a copy of
   [references/weekly-data.example.json](references/weekly-data.example.json)). It lists the source of every field.
2. **Ask** for what git cannot tell: the leave plan, the people's roles, and next week's plan. Do not invent them; if
   leave is not supplied, write `Not supplied` and say so.
3. **Build** — the script needs `exceljs`, which the project installs from its `package.json`. Run `npm ci` when
   `node_modules` is missing, then:

   ```bash
   node .agents/skills/cpt-report/scripts/build_weekly_report.mjs \
     --data docs/06-reports/YYYY-MM-DD-weekly.json --out docs/06-reports
   ```

   It writes `<project>_Weekly Report_YYYYMMDD~YYYYMMDD.xlsx`, grows or shrinks every table to the data, rewrites every
   formula, rejects a status or severity the template's drop-downs do not allow, and fails if a template placeholder
   such as `[PROJECT NAME]` is left. It prints the values the key formulas should show (tasks complete, leave days,
   next week's available man-days) — quote them to the user so a wrong one is caught.
4. **Write the covering email** from the same JSON, following
   [references/weekly-email-template.md](references/weekly-email-template.md): save it as
   `docs/06-reports/email-draft-YYYYMMDD.md`. One screen — progress, quality, the team table (one row per member, from
   `people`), next week, and each decision as one line. Never send it.
5. **Keep the JSON** next to the workbook. Updating the report means editing the JSON and re-running, then rewriting the
   email; a hand edit in the workbook is lost on the next run.

The workbook stores formulas without cached results: Excel, LibreOffice and Google Sheets calculate on open, but a
previewer that reads cached values shows those cells blank. Say so when delivering it.

If `exceljs` cannot be installed, write the markdown report from § 2 instead and say the workbook was not produced.

## 4. Adapt to the audience

Client or manager audience: no file paths or code terms, lead with decisions needed and dates. Team audience: include
story ids and links.

**Language** defaults to English. Write the report in another language only when the brief sets one
(`13. Delivery → Reporting language`, e.g. `vi`) or the user asks for it; an empty or placeholder field means English.
Docs stay in English either way. If the user asks for both, save the translated copy as
`docs/06-reports/YYYY-MM-DD-<kind>.<lang>.md` next to the English one (for the workbook: a second JSON with the
translated text, built the same way). Never translate story ids, file paths, or field
names.
