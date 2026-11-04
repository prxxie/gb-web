---
name: cpt-ship
description: Implement one user story end to end — check Definition of Ready, plan, write tests first, implement, verify, self-review against Definition of Done, update docs and story status, and commit. Use when the user says "ship US-…", "implement US-…", "build the next story", or "work on <story>".
---

# cpt-ship <STORY-ID>

Ship exactly one story. If no id is given, pick the first `ready` story in the delivery plan (or backlog index) whose
dependencies are `done`, and confirm it with the user.

## 1. Load context (read only)

1. `AGENTS.md` § PROJECT — commands and conventions. In standard/full tiers also `docs/01-overview/conventions.md`.
   For each layer the story touches, load its stack pack (`cpt-stack-<name>`, listed under Stack packs) and follow its
   "How this plugs into cpt-ship" steps and references. `conventions.md` overrides a pack where they differ. A pack
   whose frontmatter says `status: unverified` has never been run end to end: confirm each version-sensitive command
   and version pin against current official docs before you rely on it, and say in the report which ones you checked.
   If a layer has no pack, `conventions.md` (lite: `AGENTS.md`) governs it — do not install one mid-story on your own:
   note it and let `cpt-pack` decide.
2. The story file, then **only** the docs it links to (§ 2 references, § 4 contract, `refs`).
3. The code the story will touch: find it, and read up to three neighbouring files of the same kind to match their
   conventions. In a greenfield project with no such files yet, the stack pack's references are the convention.

## 2. Definition of Ready gate

Check R1–R7 from `.agents/rules/03-definition-of-ready-and-done.md` (lite tier: R1–R3). If any fails, **stop**:
report which check failed and what unblocks it (an OQ to answer, a dependency to ship, a contract to specify). Do not
start "the parts that are clear".

## 3. Plan

State in ≤10 lines: files to create or change, the test list (one or more per AC, plus edge cases from § 5), and
safety flags (⚠️ migration, breaking contract, security-sensitive per rule 06). For stories touching security-
sensitive areas or breaking a contract, wait for the user's go-ahead.

Set story `status: in-progress`. Create the branch per `.agents/rules/04-git.md` if the tier and repo use branches.

## 4. Build — tests first

For each acceptance criterion, in order:
1. Write the test. Run it. Confirm it fails for the expected reason (rule 05 § 1 defines acceptable red).
2. Implement the minimum to pass. Run it.
3. Refactor with tests green.

Foundation stories and stories with many small similar criteria may batch: all tests first, one red run, then
implement (rule 05 § 1) — say so in the report.

Then: edge cases and unhappy paths from § 5. Follow rules 05 (testing) and 06 (security).

**Discovered a gap?** If the story or docs do not say what to do and the answer would change behavior: stop, record
an open question (`cpt-decide`), and ask the user. Do not pick an answer silently.

## 5. Verify (executed, not assumed)

Run, in this order, using the commands in `AGENTS.md` § PROJECT: build, lint/typecheck, full test suite. Paste the
summary lines of each result into your report. If a command is missing or marked `(planned)`, say so — do not claim
it passed. If something fails, fix it; if it fails twice the same way, stop and report.

**A story with a user interface is also checked in a real browser where the tool has browser automation** (for
example a Playwright MCP server): run the app locally, walk each acceptance criterion as a user would, and record what
you saw — the page, the action, the result, a screenshot when the tool can take one. This complements the automated
tests; it never replaces them. Use only local or test environments and test data, never production or real accounts.

## 6. Docs

- Update `02-reference/` (and overview docs) for any contract or behavior that changed or was added.
- If this story made a `(planned — …)` command runnable (normally US-FND-001), replace it in `AGENTS.md` § PROJECT
  and `environment-setup.md` with the command exactly as you ran it, and remove the marker.
- Story file: tick or annotate acceptance criteria if useful; set `status: done` **only after** § 7 approves.
- Full tier: update TC rows in `05-quality/test-cases.md`.
- Run `node .agents/scripts/verify-docs.mjs --fix` — it regenerates the epic table and all counts.

## 7. Self-review

Run `cpt-review` on the change. The story may become `done` only with verdict APPROVE or APPROVE WITH NITS. Review
grades D8 as ready-to-commit — the commit itself happens in § 8. On
CHANGES REQUIRED: fix every Critical and Medium finding, re-verify (§ 5), and review again. If the story was already
marked `done` but not merged, set it back to `in-progress` first (rule 03 § 3 reopen).

**Review in a fresh context where the tool allows it** — a subagent, a new session, or a separate model call that sees
only the story, the diff, and the rules, not the reasoning that produced the code. The agent that wrote a change has
already decided it is correct, so its self-review tends to confirm that decision. When a fresh context is impossible,
read the diff as a reviewer would: findings first, in writing, before touching the code — and do not fix anything until
the list is complete.

## 8. Commit and report

Commit per rule 04 (code + docs together) if the user asked for commits or the project's workflow says so. Without
a remote, merge the approved branch locally per rule 04 § 4. Report:

```
Shipped US-XXX-nnn — <title>
Changed: <files, one line each>
Verified: build ✅/❌ · lint ✅/❌ · tests <n passed / n failed> (commands as run)
Docs: <docs updated>
⚠️ Flags: <or none>
Open questions raised: <OQ ids or none>
Next: <next ready story | cpt-release when the scope is complete | cpt-ops when this touched a live failure mode>
```
