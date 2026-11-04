---
name: cpt-plan
description: Break the project docs into epics and vertical-slice user stories with acceptance criteria, dependencies, and sizes, plus a backlog index and delivery plan. Use after cpt-docs, or when the user asks to "plan the work", "create stories", "break this down", or to re-plan after a change.
---

# cpt-plan

Turn the brief and docs into a backlog in `docs/03-stories/` that `cpt-ship` can execute one story at a time.

## Preconditions

- `docs/00-source/brief.md` and `docs/01-overview/` exist. If not, run `cpt-docs` first.
- Read `.agents/rules/02-docs-navigation.md` (ids, frontmatter) and `.agents/rules/03-definition-of-ready-and-done.md`.

## Procedure

1. **Epics.** Group scope into 3–12 epics by capability area (not by layer). Always include
   `EPIC-00-foundation` (code `FND`): repository setup, tooling, CI, base layout, auth skeleton if needed,
   deployment pipeline. Propose the epic list (id, code, one-line goal) to the user and wait for confirmation.
   When two or more groupings are plausible, compare them per
   [references/comparing-options.md](references/comparing-options.md) and report the ranking with the reason it won.
2. **Stories.** For each epic, write stories from `.agents/templates/story.md`:
   - **Vertical slices**: each story delivers observable behavior end to end (UI + API + data, or command + logic),
     not "build the database layer". Exceptions: foundation stories.
   - **Testable acceptance criteria** in given/when/then — including the unhappy paths (validation, permission,
     not found, conflict). Each criterion must be decidable by a stranger holding only the story and the repository
     (rule 03 R5): no criterion that a reviewer has to interpret.
   - **Contract** section filled or linked to `02-reference/`. If the reference layer lacks a contract the story needs,
     add it there (and say so in the report).
   - **Size** S/M/L; split anything larger. **Priority** P0–P3.
   - **depends_on** only real dependencies (needs code or data from that story). No cycles.
   - **Status** — for every open question that touches the story, decide with the user (one batched question per
     round, not per story):
     - the answer could change acceptance criteria and the recorded default is not acceptable → `blocked`, OQ in
       `open_questions`;
     - building on the recorded **Assumption** is acceptable → OQ in `accepted_assumptions`, story can be `ready`;
     - otherwise `ready` if R1–R7 can be met, else `draft`.
   - **NFRs**: reference every `NFR-nn` the story must satisfy (in § 2 or § 5). Every NFR not marked `operational`
     must be referenced by at least one story — add a story if none fits.
   - `US-FND-001` sets up the project so the build/test/lint commands in `AGENTS.md` § PROJECT work; its acceptance
     criteria include running them and removing every `(planned — …)` marker from AGENTS.md and
     `environment-setup.md`.
3. **Epic README** per epic from `.agents/templates/epic.md` (its story table is the `cpt:epic-stories` generated
   block).
4. **Backlog index** `docs/03-stories/README.md`: the `cpt:stats` and `cpt:epics` generated blocks (rule 02 § 8), a
   list of blocked stories with their OQs, and suggested order (link to the delivery plan).
5. **Delivery plan** (standard and full) `docs/03-stories/delivery-plan.md`:
   - Waves: groups of stories whose dependencies are satisfied by earlier waves; order inside a wave is dependency
     order then priority. When two or more wave splits are plausible, compare them per
     [references/comparing-options.md](references/comparing-options.md).
   - Per wave: stories, total size in story-days (S=1, M=2.5, L=4.5), and the **gates** — open questions that must be
     answered before the wave starts.
   - Critical path and the first three stories to ship.
   - If milestones exist in the brief, map waves to them and flag any that do not fit.
6. **Test cases** (full tier) `docs/05-quality/test-cases.md`: one table per epic — TC id · story · AC · level
   (unit/integration/e2e/manual) · steps · expected result. Every AC maps to at least one TC.
7. **Open questions.** Every gap found while writing stories becomes an OQ (`cpt-decide` format) with `Blocks` set.
8. **Back-fill the docs**: replace `—` in the "story" columns of `02-reference/` indexes with the story ids, and add
   the "Picking up work → `03-stories/README.md`" row to `docs/README.md`'s Start-here table.
9. **Verify** with `node .agents/scripts/verify-docs.mjs --fix` (regenerates counts and tables); fix every error.
10. **Report**: epics, story counts by status, blocked stories and their OQs, accepted assumptions, first stories to
    ship, next step `cpt-ship <first ready story>`.

## Re-planning

When stories already exist: never renumber or delete. Add new stories with the next free number, mark removed scope
`closed` (via `cpt-change` rules), and update indexes and the delivery plan.
