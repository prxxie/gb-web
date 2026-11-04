---
id: REL-001                              # must match the filename prefix (REL-<nnn>)
version: 0.1.0                           # <major>.<minor>.<patch>, per cpt-release § 2
date: YYYY-MM-DD                         # date of the production deployment (or the planned date)
environment: staging                     # staging | production
status: planned                          # planned | deployed | rolled-back
previous: none                           # previous deployed version, or none for the first release
stories: [US-CODE-001]                   # every story included, all of them done
commit: ""                               # the sha actually built and deployed
approved_by: ""                          # required for production: who cleared it
deployed_at: ""                          # UTC timestamp, filled when deployed
---

# REL-001 — <version> — <short theme>

## Included stories

| Story | Title | Epic |
|-------|-------|------|
| US-CODE-001 | <title> | EPIC-01-<slug> |

## Changes

> ⚠️ <breaking change first, in the user's words — or `none`>

- <feature / fix, one line each, grouped: breaking, features, fixes>

## Migrations

| Step | Forward | Reverse | Notes |
|------|---------|---------|-------|
| <name or "none — no schema or data change"> | <command> | <command> | <backup that makes an irreversible step recoverable> |

## Pre-release gates

| Check | Evidence |
|-------|----------|
| RR1 Stories done | <ids, all `done` at this commit> |
| RR2 Verified commit | `<sha>` · build `<cmd> ✅` · lint `<cmd> ✅` · tests `<cmd> — n passed` |
| RR3 Docs match | `01-overview/environment-setup.md`, `01-overview/deployment.md` |
| RR4 Migrations | <forward/reverse/backup, or none> |
| RR5 Rollback | <written, rehearsed on <env> on <date>> |
| RR6 Config | <env vars diffed; names only, no values> |
| RR7 Post-deploy checks | <smoke path + SLO signal + watch window> |
| RR8 Version | <semver reasoning: which change forced which bump> |

## Deployment

| Environment | Steps (commands, in order) | Run by | Result |
|-------------|----------------------------|--------|--------|
| staging | `<command>` | <role> | <timestamp UTC · outcome> |
| production | `<command>` | <role> | <timestamp UTC · outcome> |

## Post-deploy checks

| Check | Expected | Result |
|-------|----------|--------|
| <smoke path through a critical flow> | <observable result> | <what you saw> |
| <health/readiness endpoint> | `<expected body>` | <what you saw> |
| <SLO / error-budget signal, watched for <window>> | <threshold> | <what you saw> |

## Rollback

- **Trigger**: <the signal that means roll back, not debug>
- **Steps** (in order, as commands):
  1. `<command>`
  2. `<command>`
- **Data**: <what a rollback does to migrated data; the backup/restore that limits it>
- **Who**: <role> · **Rehearsed**: <date, environment>

## Notes

- <known issues shipped anyway, follow-ups, related CR / OQ / INC ids>
