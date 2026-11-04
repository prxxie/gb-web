# UI verification at review

Read when the diff changes what a user **sees** — a component, template, style, client-side route, or any rendered HTML.

A green suite proves the logic a test can reach. It does not prove the screen loads, the console is quiet, the new button
has a name, or that a request did not fail. For a rendered surface, that is what the review owes.

## 1. Decide whether this review owes a browser pass

It does when the diff touches a rendered surface in a project with a dev server: a component, a template, a style block, a
client-side route, a form, a rendered email, or anything the user interacts with. Say so in the report, in one line.

It does not when the diff is backend-only, a script, a doc, a migration, or a config file with no visual effect. Say that
too — "no browser pass: server-side change" is a fact a reviewer can check.

## 2. Which pass: the pack, or the checklist

- **`browser-verify` pack installed** — the project committed a prompt (typically in a PR template) that names
  `cpt-stack-browser-verify`, and has the Chrome DevTools MCP server configured. Run the pack's checklist and keep its
  evidence.
- **No pack, no prompt** — a UI change still needs more than the suite, but a review does not demand a tool the project
  did not choose. Do the manual version: open the screen in the running app, click the new control, read the console,
  screenshot the changed state, and record it in the report. That is a manual check under D1, not a gap.
- **The pack is installed but the server is not configured** — that is a Medium finding for `cpt-pack`: the project pays
  for a checklist it cannot run. The review still does the manual pass.

## 3. Reading what came back

Grade what the pass **saw**, not that it ran:

- An error in the console from the changed code is Critical when it breaks the screen, Medium when it is noise the
  project owns, and never a Nit.
- A failed request is a finding when it is the feature's; a `401` on a stale token is a fact to name and move past.
- An unlabelled control is Medium — it is an accessibility defect with a regression test waiting to be written.
- "Not collected" is honest and reviewable; "looks fine" is neither. If the pass could not run, the report says why.

## 4. Where it goes in the report

One line under `## What was checked` (see the skill's report shape):

```
Browser: /claims/42 at 1280 and 390 px, console clean, PATCH /api/claims/42 200, menu labelled and keyboard-reachable
```

When the project keeps evidence, cite the directory instead of restating it:
`Browser: docs/05-quality/evidence/US-CLM-014/` — the pack's `references/evidence.md` says what belongs in there.
