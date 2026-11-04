---
name: cpt-visual
description: Produce the committed diagram a design decision needs — in docs/02-reference/diagrams as an archify-rendered HTML file when the archify skill is installed, as a Mermaid block when it is not. Use when brainstorming or comparing architecture options, when cpt-docs writes 01-overview/architecture.md, when cpt-decide records an architecture ADR, or when the user asks to "draw the system", "show the options" or "diagram this decision".
---

# cpt-visual

A diagram is a document: one home, one name, committed, linked from the prose it illustrates. This skill owns that
contract and the two ways to satisfy it.

## The artifact

- **One home**: `docs/02-reference/diagrams/`. Nothing renders anywhere else, and a picture pasted into chat or a
  comment is not the artifact.
- **One file per diagram**: `<slug>.html` for a view of the system (`architecture-overview.html`), and
  `ADR-<nnnn>-<slug>.html` for a decision — the ADR id is the ADR whose `## Diagram` links it.
- **Committed**, reviewed in the pull request like any doc: a reader with no Node still opens it.
- **archify's working folder stays out of git.** Its default authoring folder is `.archify/<type>-<slug>-<timestamp>/`
  inside the project root; add `.archify/` to `.gitignore` the first time you render, and commit only the output file.
- **An accepted ADR's diagram is a record.** A new decision gets a new file; supersede, never overwrite. A superseded
  ADR's diagram moves to `diagrams/archive/` unchanged.

## When a picture earns its place

| Moment | Diagram |
|--------|---------|
| `cpt-docs` writes `01-overview/architecture.md` | `architecture-overview.html` — the system's parts, boundaries and external systems |
| `cpt-decide` records an architecture ADR (style, stack, storage, auth, integration, deployment) | one file of the **chosen** option; a rejected option only when its shape differs in a way the options table cannot show |
| The user is brainstorming or comparing options | one file per option under consideration, linked from the question or the proposed ADR |
| Someone asks to see the shape of a flow, a schema or a lifecycle | the matching type — see § Mermaid fallback for what each type is |

Skip it when the picture would restate a table or three sentences, and say why you skipped: a two-box arrow is not a
document. A diagram never contradicts the prose — if rendering exposes a wrong component in
`architecture.md`, fix the doc, do not redraw around it.

## Where the facts come from

Boxes, edges, labels and numbers come from the docs: the component table in `01-overview/architecture.md`, the options
in the ADR, the brief, the story. Never invent a component to fill the canvas. An unresolved edge is a gap labelled as
one (`?` plus a note), never a guess — the same standard as rule 04's "never invent facts".

## Render with archify

1. **Locate it.** The package root is a directory holding `bin/archify.mjs`. Check, in order:
   `.agents/skills/archify/`, `~/.agents/skills/archify/`, `~/.claude/skills/archify/`,
   `~/.codex/skills/archify/`; if none of those exist, search once:
   `find "$HOME" -maxdepth 5 -path '*skills/archify/bin/archify.mjs' 2>/dev/null | head -1`.
   Not found → § Mermaid fallback. **Installing it is the user's call**, because it needs Node and network:
   `npx -y skills@latest add https://archify.si --skill archify --agent <agent> --copy` installs it into the project
   `.agents/skills/` (add `--global` for the user's own skills folder). Ask; do not install silently.
2. **Health check.** `node <package>/bin/archify.mjs doctor`. Non-zero → fall back, and record the message you got.
3. **Read archify's own skill**: `<package>/SKILL.md` and its `references/` hold the authoring rules, the
   `candidate.json` schema and the style profile. They are authoritative — this skill does not restate them. When the
   type is unclear, `node <package>/bin/archify.mjs guide "<scenario>" --json` picks among the ten types:
   `architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline`, `waterfall`
   (`explainer` for a one-page answer instead of a poster).
4. **Author** `candidate.json` in the folder archify's guide puts it in.
5. **Render** `node <package>/bin/archify.mjs finalize <type> <candidate.json> docs/02-reference/diagrams/<name>.html --quality showcase --json`
   (add `--repo-root <root>` when the evidence checks need it). Repair what its gates report — validate → deliver →
   strict check → browser-check — inside its repair limit; if it still fails, fall back to Mermaid and say so.
6. **Link it** (§ Link contract), then run the docs check.

## What a passing receipt proves

`finalize --json` reports that the automated gates ran and passed. It is not a visual review: open the browser-check
frame (or the file) before you describe the picture as checked. If you cannot open it, write "gates passed, not
eyeballed" in the story evidence — never "verified".

## Mermaid fallback

No archify, or archify failed? The contract still holds: the picture lives in the doc that needs it, in the same
`## Diagram` section, as a fenced `mermaid` block, plus one line saying no HTML was produced and why
(`Diagram: Mermaid — archify is not installed in this project`).

| Diagram | Mermaid |
|---------|---------|
| architecture, dataflow | `flowchart LR` (a `subgraph` per boundary or trust zone, labelled edges) |
| workflow | `flowchart TD` |
| sequence | `sequenceDiagram` |
| lifecycle | `stateDiagram-v2` |
| erd | `erDiagram` |
| class | `classDiagram` |
| tree | `flowchart TD` or `mindmap` |
| timeline | `timeline` |
| waterfall | `gantt` |

Keep it to the nodes the prose names, under roughly twenty of them, and split rather than shrink.

## Link contract

- `01-overview/architecture.md`: `## Diagram` with `[Architecture](../02-reference/diagrams/architecture-overview.html)`.
- An ADR: `## Diagram` with `[Diagram of the chosen option](../../02-reference/diagrams/ADR-<nnnn>-<slug>.html)`; delete
  the section for a decision with no shape (a naming or policy choice).
- A relative link to the `.html` file — an `![…]` image of an `.html` file does not render.
- **Render before you link**: the verifier fails a dangling relative link, and a `## Diagram` section that points at a
  file nobody wrote is worse than no section.

## Rules

- One fact, one place (conventions D5): the picture carries shape, the prose carries justification. Do not also paste
  the labels into a table.
- Never edit files under the installed `<package>/`; upgrade archify through its own installer.
- If the system grew, update the component table in the same change as the picture.
- Nothing else in the kit gains a dependency: no Node in `install.sh`, no `.html` in the verifier.
