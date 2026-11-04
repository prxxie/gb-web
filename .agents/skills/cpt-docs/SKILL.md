---
name: cpt-docs
description: Generate or regenerate the project's AI-friendly documentation (docs/01-overview, docs/02-reference, docs/README.md) and fill the PROJECT section of AGENTS.md from the confirmed brief. Use after cpt-interview, when the user asks to "generate the docs", or when the brief changed and the docs must be refreshed.
---

# cpt-docs

Turn `docs/00-source/brief.md` into the overview and reference layers of the doc set, sized to the project's tier.

## Preconditions

- `docs/00-source/brief.md` exists. If not, stop and run `cpt-interview`.
- If the brief has `status: draft`, warn the user that the docs will contain more assumptions, then continue only if
  they agree.

## Procedure

1. **Read** the brief, `.agents/rules/02-docs-navigation.md`, and the layout table in
   [../cpt-interview/references/tiers.md](../cpt-interview/references/tiers.md). Read every file in
   `docs/00-source/` the brief cites.
2. **Decide the stack — write its ADR before anything else.** From the brief, take the stack facts and constraints,
   propose what fits (name the alternative you rejected and why), and get the user's decision. Record it in
   `docs/04-decisions/adr/` from `.agents/templates/adr.md`: status `accepted` if the user chose or delegated it
   (`[user: delegated]`), `proposed` if it rests on an open question. Number from `ADR-0001`. Nothing else is written
   before this file exists — the packs and every reference doc encode this decision, so a late stack change is a
   rewrite of both. If the brief leaves the stack genuinely open, hand to `cpt-decide` and stop here.
3. **Stack packs** — hand to [cpt-pack](../cpt-pack/SKILL.md) (`propose` → your approval → install → read back),
   justified by the ADR from § 2. It resolves the scaffold path, reads the catalog, installs with `install.sh --pack`,
   and records the result in `AGENTS.md` and `conventions.md`. Read each installed
   `.agents/skills/cpt-stack-<name>/SKILL.md` before step 6: the docs must state the conventions the project actually
   follows, not a generic stack's. Layers with no matching pack are covered by `conventions.md` alone — say which.
4. **Plan the file list.** From the tier and `project_types`, list every file to generate (✅ and applicable ◐ rows).
   Show the list to the user in one message, then proceed unless they object.
5. **Existing docs.** If a target file already exists, update it in place: keep content not derived from the brief,
   and never delete a section someone added by hand. Report what changed per file.
6. **Write each file** following [references/doc-specs.md](references/doc-specs.md). Rules:
   - Carry source tags from the brief into the docs where a fact could be challenged.
   - Anything the brief does not support is an assumption: tag it `[assumption: OQ-nn]` (rule 02 § 7) and add or
     reuse an open question in `docs/04-decisions/open-questions.md` (create from
     `.agents/templates/open-questions.md`).
   - **No story ids yet** — stories do not exist until `cpt-plan`. Write `—` in "story" columns; `cpt-plan` fills
     them in.
   - `conventions.md` records project decisions and deviations from the installed packs only — link the pack for
     everything else; do not copy pack content.
   - **Every contract names its oracle.** In `02-reference/`, each contract table says how its rows are checked — an
     `Oracle` column, a `TC-…` id, or a `tests/…` path; where tests do not exist yet, name the test that will cover it
     and the story that writes it. `verify-docs.mjs` warns about a reference doc that names none.
   - Grade each file against the quality criteria for its type in [references/doc-specs.md](references/doc-specs.md)
     § Quality criteria before moving on.
   - Prefer tables. Keep each file focused; link instead of repeating.
   - **A picture where a picture is due.** `01-overview/architecture.md` keeps its Mermaid `flowchart`; when the project
     has archify, [cpt-visual](../cpt-visual/SKILL.md) also renders the committed diagram under that page's
     `## Diagram`. Never draw a second, different system: the picture and the component table say the same thing.
7. **Remaining decisions.** For each other significant choice in the brief (architecture style, auth approach, hosting,
   integration pattern), write an ADR the same way — the stack ones are already recorded in § 2.
8. **Operational and gate docs** — the half of the lifecycle the overview layer does not cover, sized by the layout
   table:
   - `01-overview/deployment.md` (full ✅, standard ◐ when deployed): environments, pipeline, config per environment,
     rollback, who may deploy. `cpt-release` executes this file, so a step that cannot be followed is a defect.
   - `07-release/README.md` (full ✅, standard ◐ when deployed): one line of purpose plus the
     `<!-- cpt:releases -->` / `<!-- /cpt:releases -->` markers, each on its own line. Never type the table by hand —
     `verify-docs.mjs --fix` renders it from the `REL-…` records.
   - `08-ops/runbook.md` and `08-ops/slo.md` (same tiers as the release index): structure and the quality bar are in
     [cpt-ops](../cpt-ops/SKILL.md) § 1–2. Every SLO row names an `NFR-<nn>`; an NFR marked `operational` gets a row
     here instead of a target.
   - `05-quality/acceptance-signoff.md` (full only): copy `.agents/templates/signoff.md` unchanged, all four gates
     `pending`. `cpt-signoff` owns it from then on.
   - Only write what the brief supports: without environments, an SLO target, or a monitoring source, the file says
     `_not applicable_ — <reason>` and raises an open question, exactly like any other doc.
9. **AGENTS.md PROJECT section.** Replace only the text between `<!-- cpt:project:start -->` and
   `<!-- cpt:project:end -->`. Fill name, tier, project type, stack, stack packs, layout, and conventions summary.
   `cpt-pack` already wrote the stack-packs line and the build/test/lint/run commands from each pack's PROJECT values;
   verify them against § 3 rather than retyping. Where no pack covers the layer, use the real command if the project is
   already set up, or the command the chosen stack's standard tooling will use.
   Commands not yet runnable get `(planned — verify after US-FND-001)`; `cpt-ship` removes the marker once the story
   that makes them runnable is done. In the lite tier, put the conventions (naming, structure, error handling,
   testing framework) directly here, ≤15 lines.
10. **docs/README.md.** Write it per doc-specs § docs/README.md, including the `cpt:stats` generated block.
11. **Verify.** Run `node .agents/scripts/verify-docs.mjs --fix`. Fix every error; report warnings.
12. **Report** the files written, packs installed, assumptions added (with OQ ids), ADRs created, and the next step:
    `cpt-plan`.

## Do not

- Invent requirements, endpoints, fields, or roles the brief does not imply. A reasonable inference is allowed only as
  an assumption with an open question.
- Write stories — that is `cpt-plan`.
- Install a stack pack the stack ADR does not justify, or install one without asking — that is `cpt-pack`'s job under
  its own rules.
- Fill a release record, an incident, or a gate signature — those belong to `cpt-release`, `cpt-ops`, `cpt-signoff`.
- Copy the brief verbatim. The docs restructure it for lookup; the brief remains the record of what was said.
