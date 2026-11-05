# US-RANK-005 — results screen, browser run

- Ran: 2026-11-05, Playwright (same run as `../US-MATCH-001/e2e.txt`)
- `TC-RANK-153: a finished match lands on the result screen` opens `/results/ABCD23` cold and asserts a redirect to `/`,
  i.e. the screen refuses to invent a result when no match payload exists
- Caveat: the documented `TC-RANK-153` is "Results, ranked — deltas shown equal the server values". The test title reuses
  the id for a different assertion, so the ranked-delta path is still unproven
- Not proven: rating deltas, forfeit wording, rematch, share
