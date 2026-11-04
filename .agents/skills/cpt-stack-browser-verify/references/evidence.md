# Evidence: what to keep, where, and what never to keep

Read before writing anything into `docs/`.

## The rule

A browser pass that leaves no artifact did not happen, and a review cannot re-read it. One directory per story:

```
docs/05-quality/evidence/<US-id>/
├─ README.md              what was checked, route(s), server + Chrome versions, date, who ran it
├─ screen.png             the changed state (full page when layout changed)
├─ console.txt            the console messages, or "none after load and after one interaction"
├─ network.txt            requests over 399: method, URL, status, and the cause or the finding
├─ a11y.txt               the accessibility snapshot of the changed region (trimmed to it)
└─ lighthouse.json         only when performance or accessibility was the point of the change
```

`README.md` is the only required file; keep the others you actually produced and leave the rest out rather than writing an
empty file. Trim each excerpt to the changed surface — a 3 000-line console dump is not evidence, it is a haystack.

## What goes in `README.md`

```markdown
# US-XXX-001 — browser evidence

- Route: `/claims/42` (`http://localhost:5173/claims/42`), reached by signing in as the fixture user
- Ran: 2026-11-04, Chrome 141, chrome-devtools-mcp via npx, visible browser, seeded database
- Changed surface: the claim status badge and its edit menu
- Console: clean after load and after opening the menu
- Network: `PATCH /api/claims/42` 200; one `401` on `/api/session` 180 ms before sign-in completed — expected
- Accessibility: menu trigger is a `button` named "Change status"; keyboard reaches it after the badge
- Not checked: performance (no asset change)
```

Then the review's `## What was checked` cites this directory in one line. Nothing else links here.

## What never goes in

- **Cookie values, tokens, session ids, passwords.** Attributes only (`HttpOnly`, `Secure`, `SameSite`, expiry). A
  screenshot that shows a token in a URL bar is a leaked secret.
- **Personal data** of real users. Seed data or a fixture account; if a pass exposed production data, say so in the review
  as a finding and delete the artifact.
- **Traces, videos, `.heapsnapshot` files.** Tens of megabytes. Keep the insight and one screenshot; delete the file and
  say it was deleted.
- **Full-page screenshots of unrelated screens.** Evidence is scoped, like a diff.

## "Not collected" is a result

When the pass could not run — no browser MCP installed, dev server down, no Chrome on the machine — write it plainly:

- `docs/05-quality/evidence/<US-id>/README.md` says `Not collected: <reason>`, or
- the review says "browser evidence not collected: <reason>" and names `install.sh --pack browser-verify`.

A review that says "not collected" is honest and can be argued with. A review that says "looks fine" is neither.
