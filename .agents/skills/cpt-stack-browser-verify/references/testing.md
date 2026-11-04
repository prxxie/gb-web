# Driving the browser

Read when running a pass. The tool names below are the ones the server exposes today; after a server upgrade, check them
against its own `chrome-devtools` skill rather than guessing.

## Start clean

- **A visible browser** is the default and what a review wants: you can see what the reviewer sees.
- **`--isolated`** gives a throwaway profile. Use it to reproduce a first-run flow (no cookies, no cache) or when a
  previous pass may have left state behind. Do not use it when the flow needs the developer's login — sign in inside the
  pass instead and say so in the review.
- **`--headless`** is for a machine with no display. A headless screenshot is still evidence; say it was headless.

## The pass

```
new_page            → open the base URL from conventions.md
navigate_page       → the changed route
wait_for            → the text or element that means "loaded" (not a fixed sleep)
take_snapshot       → the accessibility tree: is the new control there, with a name?
take_screenshot     → the changed state, to the evidence directory
list_console_messages / get_console_message → read AFTER interacting once with the new control
list_network_requests / get_network_request → status, timing, and the failing ones
```

- **Wait on a condition, not a timer.** `wait_for` on a visible string is the difference between a real pass and a race the
  reviewer has to guess about.
- **Interact before reading the console.** Most errors in a new feature happen on the first click, not on load.
- **One screenshot per changed state**, full page when the change affects layout below the fold.
- **Network failures are read, not counted.** `401`, `403`, `404`, `500` each mean something different; the review says
  which.

## When the change is about size or speed

- `lighthouse_audit` (a11y, best practices, SEO) on the changed screen, and quote its failing audits — not its score
  alone.
- `performance_start_trace` / `performance_stop_trace` around one reload, then read the insights. Keep the numbers and one
  screenshot of the insight; delete the trace file.

## When the change is about auth or tracking

- `evaluate_script` to read `document.cookie` and storage **keys** — never paste values into a document.
- `cookie-debugging` covers `Set-Cookie` attributes, `SameSite`, partitioned cookies and consent banners; use it instead of
  re-deriving the rules.

## Closing the pass

1. Write the excerpt files (§ `evidence.md`) while the data is on screen — a second pass costs another server start.
2. Close the pages you opened; leave the developer's browser as you found it.
3. If the server cannot start (no Chrome, port taken, `npx` offline), say so in the review as **not collected** with the
   error's first line, and use the server's `troubleshooting` skill if it is a connection problem.
