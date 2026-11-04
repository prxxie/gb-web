# CR-2026-11-05 — no decompilation in the basis

- **Raised**: 2026-11-05 by the client
- **Status**: approved
- **Affects**: `02-reference/gameplay/reference-gunbound.md` (rewritten), `02-reference/gameplay/tunables.md`,
  `02-reference/data/{mobiles,items}.md`, `01-overview/{project-overview,glossary}.md`, `04-decisions/adr/ADR-0005`,
  `04-decisions/open-questions.md` (`OQ-18` closed), `03-stories/EPIC-03-match-core/*` (citation cleanup),
  `03-stories/EPIC-08-ops/US-OPS-004` (unblocked), `00-source/brief.md`, `docs/README.md`, `03-stories/delivery-plan.md`

## Request

> no decompile, we have all needed

The client ruled that no decompilation of another product is part of this project's basis: nothing is read, cited, or
required from it.

## What changed

| Area | Before | After |
|---|---|---|
| `reference-gunbound.md` | "what the client's decompiled binary does", with `[gb: file#section]` citations and function addresses | **genre rules we adopt**, no citations, no addresses, no third-party names |
| Every `[gb: …]` tag (34 across 18 files) | pointed at another product's files | **removed** |
| Physics attribution | "the model recovered from …" | **our own model**, derived and tuned (`ADR-0005`, `OQ-37`) |
| Parameter framing | GB's `parts/tick` side by side with ours | genre concepts side by side with ours |
| Four parameter families | "what the recovery found" | **our** taxonomy (`ice` / `ico` / `trico` / `turtle` → neutral descriptions) |
| `OQ-18` | open, blocking `US-OPS-004` | **answered** — nothing copied, nothing to sign |
| `US-OPS-004` | `blocked` | **`ready`**, no open questions |

## Why this is safe to do

Nothing in the build ever depended on the decompilation as an *artifact*: no file, table, asset or line of code was
copied. What it informed was a set of **genre conventions** (delay-queue turns, three weapon slots, three-tier blasts,
eleven items, four modes, gimmicks, avatar bonuses) which are described in the client's own words and implemented from
scratch, plus a **physics shape** (constant acceleration, per-mobile gravity and mass, wind divided by mass, no drag) that
is textbook kinematics and whose constants were already ours — fixed by a calibration point and by playtest.

## Consequences

- The legal question is gone; the public demo and the launch have no rights-holder dependency.
- Balance and behaviour do not move: every number in `tunables.md`, `mobiles.md` and `items.md` is unchanged, so no test
  case or story acceptance threshold changes.
- `CHANGELOG.md` keeps its historical entries, with the repository links excised and a note pointing at this CR.
- One backlog effect: `US-OPS-004` moves from `blocked` to `ready` — 53 stories, **0 blocked**.

## Alternatives rejected

- **Keep the citations but mark them "reference only"** — the client's instruction was unconditional, and a doc set that
  cites a decompilation invites exactly the negotiation the client wants to avoid.
- **Re-derive the constants from scratch** — the numbers are already ours; only their provenance wording changed.
- **Delete `reference-gunbound.md`** — the genre rules are the design basis for eleven stories; the file is still needed,
  rewritten as our own statement of them.
