---
name: cpt-change
description: Apply a change request (new, changed, or removed requirement) across the doc set — record it, analyse impact on docs, stories, code, and plan, get approval, then update everything consistently. Use when the client or user changes requirements mid-project, adds a feature, drops scope, or says "they want X instead of Y".
---

# cpt-change

A change request (CR) never edits stories ad hoc. It is recorded, analysed, approved, then applied everywhere at once.

## 1. Record

Create `docs/00-source/change-requests/CR-<YYYY-MM-DD>-<slug>.md`:

```markdown
---
id: CR-YYYY-MM-DD-slug
status: proposed          # proposed | approved | applied | rejected
requested_by: <person or role>
date: YYYY-MM-DD
---

# CR-YYYY-MM-DD-slug — <title>

## Request
<The change as requested, verbatim if it came in writing. Attach or link the source.>

## Impact
<Filled in step 2.>

## Decision
<Approved / rejected, by whom, when. Filled in step 3.>
```

If the request is ambiguous, ask the user (≤4 questions) before analysing.

## 2. Analyse impact

Search the doc set and code for every affected item (grep ids, terms from the glossary, endpoints, fields, screens).
Fill **Impact** with:

| Kind | Item | Change |
|------|------|--------|
| Doc | `01-overview/…`, `02-reference/…` | what changes |
| Story | `US-…` | modify AC / new story / close (status `closed`) / reopen |
| Code | module or file | already implemented? → rework needed |
| Plan | wave / milestone | effect on order and dates |
| Decision | OQ / ADR | answered, raised, superseded |
| Stack | pack (`cpt-stack-…`) | a new layer the CR adds, or a pack it retires (`cpt-pack`) |
| Operations | `08-ops/runbook.md`, `slo.md` | a failure mode or SLI this CR invalidates |
| Gate | G1–G4 | a signed gate this CR re-opens (§ 4) |

Classify the change: **additive** (new stories only), **modifying** (done stories need rework — list them),
**removal**. Estimate added and removed effort in story sizes. Flag ⚠️ rework of `done` stories and data migrations.

## 3. Approve

Present the impact table and effort delta. Wait for explicit approval. Rejected → set `status: rejected` and stop.

## 4. Apply

1. Update overview and reference docs. Raising the tier is allowed here; lowering is not.
2. Stories:
   - Modified, not yet started: edit in place.
   - Modified, already `done`: leave it `done` and add a **new** story for the rework that links the original and the
     CR.
   - Removed: set `status: closed`, and add at the top: `> Closed YYYY-MM-DD by CR-…: <reason>.` Keep the file.
   - New: next free id in the right epic (or a new epic).
3. Update epic READMEs, backlog index, delivery plan, and test cases (full tier).
4. Re-open the gates the change invalidates (`cpt-signoff reopen <G#>`): scope and contracts re-open G1/G2, a change to
   what a user must accept re-opens G3, and a change to deployment, rollback, or data re-opens G4. A live system's
   runbook and SLOs are updated in the same change, not afterwards.
5. A CR that adds a layer (a queue, a container, a model eval, a frontend) goes through `cpt-pack` before the docs are
   updated: the conventions the docs will cite have to exist as an installed pack, not only in prose.
6. Record decisions: answer OQs or write ADRs via `cpt-decide` rules.
7. Add an entry to `docs/CHANGELOG.md` (standard and full tiers; create if missing), newest first:

   ```markdown
   # Changelog

   ## YYYY-MM-DD — CR-YYYY-MM-DD-slug — <one-line summary>

   - Added: US-…    - Modified: US-…    - Closed: US-…    - Rework of done stories: US-… (or none)
   ```
8. Set CR `status: applied`. Run `node .agents/scripts/verify-docs.mjs --fix`.
9. Report: what changed, stories added/modified/closed, rework needed on shipped code, plan impact.
