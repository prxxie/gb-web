---
name: cpt-pack
description: Choose and install the stack packs a project needs — map the decided stack (architecture and stack ADRs) to the pack catalog, propose one line per pack, install on approval with install.sh --pack, then record the result in AGENTS.md and conventions.md. Use after the stack decision, when adopting an existing repository, or when a story or change request introduces a new layer (container, queue, model eval, frontend).
---

# cpt-pack

The core skills are stack-agnostic; packs carry the coding guide, test recipes, PROJECT commands, and review checklist
for one stack. This skill decides **which** packs a project has, so that decision has an owner and a written record
instead of being fixed at install time and never revisited.

Read first: `AGENTS.md` § PROJECT (tier, stack, stack packs), `docs/01-overview/architecture.md`, the accepted ADRs in
`docs/04-decisions/adr/`, and `docs/01-overview/conventions.md` when it exists.

## 0. When this runs, and when it refuses

| Trigger | What you do |
|---------|-------------|
| `cpt-docs` step 3, after the stack ADR | Propose the packs the ADR implies. This is the normal path. |
| `cpt-adopt` hand-off | Propose packs that match the code actually found (`package.json`, lockfiles, `Dockerfile`, CI jobs). |
| A story or change request adds a layer | Propose only the pack for that layer; install after approval. |
| "Which packs do we have?" (`cpt-pack status`) | Diff catalog → installed → recorded. Install nothing. |

**Refuse and report** when: the stack is not decided yet (no architecture doc and no ADR — go back to `cpt-docs` or
`cpt-decide`); the scaffold path cannot be resolved (§ 2); the requested pack is not in the catalog; or the request is
really a kit upgrade (`install.sh --force`) — that is a different, riskier operation the user must ask for.

## 1. A pack is justified by a decision, not by taste

A pack may be installed only when one of these exists, and you can point at it:

- an accepted ADR naming that stack (`docs/04-decisions/adr/ADR-000x-…`), or the stack line of `architecture.md`;
- for an adopted repo, the file that proves it: `package.json` dependency, `pyproject.toml`, `Dockerfile`, CI job;
- a change request that adds the layer (`docs/00-source/change-requests/`).

A cross-cutting pack is justified by the product's shape instead of a stack: `browser-verify` when the docs say the
product has a rendered surface — `01-overview/project-overview.md` describes screens, `02-reference/screens.md` exists, or
a story's criteria describe what a user sees. Cite the file, same as any other proposal.

"Everyone uses Redis" is not a reason. If the decision is missing, raise it (`cpt-decide`) instead of installing.

## 2. Resolve the scaffold and read the catalog

1. `$CPT_SCAFFOLD_PATH`, else `scaffold_path` in `.agents/cpt.json`, else ask the user for their scaffold checkout.
2. `<scaffold>/install.sh --list-packs` — names, descriptions, `status`, `requires`, `recommends`.
3. `<scaffold>/packs/README.md` § Precedence for what a pack may and may not override.

If no path works (a teammate's clone, CI, another machine), do not guess: give the user the exact command to run
(`CPT_SCAFFOLD_PATH=/path/to/cpt-kit ./install.sh --pack <names> .`) and stop before § 6.

## 3. Propose — one line per pack, then wait

For each pack the decision justifies:

```
cpt-stack-fastapi   → backend        ADR-0002 (FastAPI accepted)   status: verified
cpt-stack-docker    → delivery       ADR-0005 (containers)         status: verified   + requires: api
```

- Say which part of the stack it covers and cite the ADR or file — a proposal without a citation is a shopping list.
- Show `requires:` packs as pulled in automatically (the installer follows them transitively).
- Name `recommends:` packs as **not installed**; installing one needs its own justification next time.
- Propose `browser-verify` whenever the product has a rendered surface, even when no stack pack recommends it: a review
  cannot prove a screen works from jsdom, and the project learns that at the first UI story if it does not hear it now.
  Propose it as one line with its citation, and say what changes without it — the review does the manual pass instead.
- Flag `status: unverified` packs: their commands have not been run end to end on a real project, so confirm them
  before the first story relies on them.
- Name the layers with no matching pack — `conventions.md` alone covers those, and the user should know.
- Ask once, in one message, and install only what was approved. Declined packs are "proposed, not installed" in the
  report, never retried silently.

## 4. Install

Run from the project root:

```bash
<scaffold>/install.sh --pack <a,b> .
```

This is additive: it creates `.agents/skills/cpt-stack-<name>/` and a `.claude/skills` link, records them in the
`.agents/cpt.json` manifest, and leaves `AGENTS.md` and `docs/` alone (they belong to the project).

- **Version drift first.** If `version` in `.agents/cpt.json` differs from `<scaffold>/VERSION`, the packs would come
  from a different kit version than the skills. Say so and recommend `install.sh --dry-run --force .`; do not run it
  yourself — it rewrites `.agents/`, which is the user's call.
- Never use `--force` to "make sure" a pack is there. That upgrades every CPT file.
- Never edit files under `.agents/skills/cpt-stack-*` — a project deviation goes in `conventions.md`.

## 5. Read what you installed

Read each new `.agents/skills/cpt-stack-<name>/SKILL.md`, then its `references/` as needed. Extract: the layer it
governs, its "PROJECT values" (build/test/lint/run commands), and the conventions it expects. These feed § 6 — a pack
you have not read cannot be recorded accurately.

## 6. Record the decision in three places

1. `AGENTS.md` § PROJECT `**Stack packs**`: `cpt-stack-fastapi`, `cpt-stack-react-vite` — or `_none_ — <reason>`. This
   line is checked against the installed directories; a mismatch is an error.
2. `AGENTS.md` § PROJECT build/test/lint/run: take the pack's PROJECT values. If a command is not runnable yet, keep
   `(planned — verify after <STORY-ID>)`.
3. `docs/01-overview/conventions.md` (standard, full): the pack table `pack → layer → link`, plus project deviations.
   In `lite`, conventions live in `AGENTS.md` only — update it there.

Then run `node .agents/scripts/verify-docs.mjs --fix` and report its output.

## 7. `cpt-pack status`

Report three diffs, each as a list, not a sentence:

- **installed, not recorded** — `.agents/skills/cpt-stack-*` missing from the `AGENTS.md` line (verify-docs errors on
  this, so it means someone installed a pack by hand);
- **recorded, not installed** — the line names a pack with no directory (deleted by hand, or a half-finished upgrade);
- **unverified packs in use** — `status: unverified` packs that a shipped story already relies on.

## 8. Report

```
Packs installed:   cpt-stack-fastapi (backend, ADR-0002), cpt-stack-docker (delivery, ADR-0005, requires api)
Already present:   cpt-stack-api
Proposed, declined: cpt-stack-llm-eval (no eval layer in scope yet)
Unverified:        none
Recorded in:       AGENTS.md § PROJECT, docs/01-overview/conventions.md
Next:              cpt-docs step 4 (file list), or cpt-ship <STORY-ID>
```

## 9. Never

- Install a pack no ADR, architecture doc, code file, or change request justifies.
- Install `recommends:` packs because they look useful.
- Install without approval, or re-propose a pack the user declined in the same session.
- Run `install.sh --force`, `--uninstall`, or an upgrade as part of pack selection.
- Leave `AGENTS.md`/`conventions.md` disagreeing with what is installed — the doc is what the next agent trusts.
- Hand-copy a pack's content into `conventions.md`; link the pack and record only deviations.
