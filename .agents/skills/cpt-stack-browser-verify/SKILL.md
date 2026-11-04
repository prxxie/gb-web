---
name: cpt-stack-browser-verify
description: Browser evidence for a web UI — drive the project with the Chrome DevTools MCP server (console, network, accessibility tree, screenshots, Lighthouse, traces), capture it under docs/05-quality/evidence/<story-id>/, and review it. Use when reviewing or shipping a change that touches a rendered surface (component, template, styles, client-side route, rendered HTML) in a project that has a dev server and a browser.
status: unverified            # unverified | verified — see packs/README.md
---

# cpt-stack-browser-verify

Cross-cutting pack. The project's decisions in `docs/01-overview/conventions.md` override this pack.

## Scope and versions

Covers **how a rendered change is proved**: which browser checks a change owes, what evidence is kept, where it lives,
and what makes a check "not collected" rather than "passed". It does not replace the project's automation — journeys that
must never regress belong in the project's own browser tests (Playwright, Cypress, whatever the stack pack names).

**Written for:** `chrome-devtools-mcp` (`npx -y chrome-devtools-mcp@latest`, 2026-11), current stable Chrome, Node LTS.
The server requires Chrome and npm on the machine that runs the agent; it exposes browser content (including cookies) to
the client, so review hygiene in `references/evidence.md` is part of using it, not advice.

**Out of scope:** Android debugging, WebSocket/remote-endpoint setups, and the CLI form of the package. If a project needs
to attach to an already-running Chrome (`--browserUrl`), that is a project decision for `conventions.md`.

## PROJECT values

`cpt-docs` writes these into AGENTS.md § 2 from `conventions.md`; the pack assumes they exist and fails loudly when a
check needs one and it is missing.

- **Dev server**: command + base URL (for example `npm run dev` → `http://localhost:5173`). A review cannot start a pass
  without it.
- **Seeded state**: how to arrive at a logged-in, populated screen (fixture user, seed script, or "no seed: empty state
  is the expected screen").
- **Evidence home**: `docs/05-quality/evidence/<US-id>/` — always this, never a second layout.

## How this plugs into cpt-ship

Unchanged. The pack adds nothing to implementation and nothing to the Definition of Done — evidence is collected and
weighed at review (ADR-0006). Two things do move earlier: a story whose AC describes what a user *sees* names its route
or URL at ready time, and the dev server is started before the change is handed over, not during review.

## Review checklist

Run these for the changed screen only, in this order, and record the outcome of each — `none` is a valid, meaningful
answer; silence is not.

- [ ] The route loads with no uncaught exception, and a screenshot of the changed state exists.
- [ ] The console is read after load **and** after one interaction with the new control: no new error, and every new
      warning either fixed or explained in the review.
- [ ] Every network request over the pass is a 2xx/3xx, or a named status with a cause.
- [ ] The new control appears in the accessibility snapshot with a name a user would recognise.
- [ ] The keyboard reaches the new control in a sensible order, and its focus is visible.
- [ ] A dialog or menu returns focus where it came from when it closes.
- [ ] The changed screen is checked at a phone width when the layout changed.
- [ ] A form's validation message is reachable by screen reader (an alert or a described-by string), not just red.
- [ ] Cookies and storage are read as attributes/keys only when the change touched auth or tracking — never values, and
      never a token in a URL.
- [ ] A Lighthouse or trace run exists when the change moved a large asset or the first paint, quoted with its numbers.

Anything here that failed as a *design* question (wrong wording, missing state) is a review finding, not something to fix
silently in the review.

## References

- [references/testing.md](references/testing.md) — how to drive the server for these checks: connect, wait, snapshot,
  screenshot, network, Lighthouse, cleanup. Read when actually running a pass.
- [references/evidence.md](references/evidence.md) — what to keep, where, what must never be committed, and how to write
  "not collected". Read before writing anything into `docs/`.
- The server ships its own skills — `chrome-devtools`, `a11y-debugging`, `cookie-debugging`, `debug-optimize-lcp`,
  `memory-leak-debugging`, `troubleshooting`. Use them for tool names and options rather than memory; they change with
  the server version.
