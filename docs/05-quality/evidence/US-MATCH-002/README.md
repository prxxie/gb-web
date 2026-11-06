# US-MATCH-002 — touch aiming, browser run

- Ran: 2026-11-05, Playwright, landscape phone profile (same run as `../US-MATCH-001/e2e.txt`)
- `TC-MATCH-902: a one-finger pull raises the power readout` — a mouse drag of 120×90 px on the canvas moves
  `power-value` off `0.00`, so the pull gestures reaches the power ring
- Caveat: the documented `TC-MATCH-902` is "a second finger lands mid-pull → the pull is cancelled without firing and the
  camera gesture takes over" (`web` level). The Playwright title cites that id but asserts a different behaviour, so this
  run proves the pull path, not the documented case
- Not proven: second-finger cancellation, multi-touch on a real device, angle/ruler feedback, `fire` on release

## 2026-11-06 — still open

The unit cases (`apps/web/tests/aim.test.tsx`, `power-ring.test.tsx`) cover AC1, AC3's formula, AC4, AC5 and AC6. The
story stays `in-progress`: nothing asserts that a release sends exactly one `fire` with the angle and weapon slot (no
drag-to-fire e2e spec exists), and AC7/AC8 have no case. See the story's Delivery status section.
