---
id: INC-001                               # must match the filename prefix (INC-<nnn>)
title: <what broke, in user-visible terms>
severity: SEV3                            # SEV1 | SEV2 | SEV3 | SEV4
status: open                              # open | mitigated | resolved | closed
detected: YYYY-MM-DD                      # when it started affecting users (or when it was first seen)
resolved: ""                              # required when status is resolved or closed
release: ""                               # REL-<nnn> in flight, if the incident is tied to one
---

# INC-001 — <title>

## Impact

<Who was affected, for how long, in their terms. Data at risk or lost. Money / SLA / contractual impact if the brief
measures it. `none — internal only` is a valid answer.>

## Timeline

All times UTC. Written live during the incident, one row per event.

| Time | Event | Who |
|------|-------|-----|
| HH:MM | <detected / alerted / responded / mitigated / resolved — what happened> | <role> |

## Mitigation

<The step that actually restored service — rollback, failover, feature disabled, hotfix REST id. Commands as run.>

## Root cause

<The mechanism, not the blame. "Migration 0042 held a lock for 40 minutes because the backfill ran in the same
transaction." Leave `unknown — <what would find it>` rather than a guess.>

## Detection

<Why the alert did or did not fire; the gap in minutes between user impact and someone knowing. This is where most
follow-up actions come from.>

## Actions

| Action | Story / question | Owner | Due |
|--------|------------------|-------|-----|
| <what changes so this cannot repeat> | US-CODE-001 / OQ-01 | <role> | YYYY-MM-DD |

## Postmortem

<SEV1 and SEV2 only — or `not required (SEV3)` / `not required (SEV4)`. Summary, what made it possible, what made it
slow to detect, what made it slow to fix. Blameless.>
