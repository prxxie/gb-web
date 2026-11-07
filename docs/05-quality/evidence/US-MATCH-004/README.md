# Evidence — US-MATCH-004 (skip a turn and send a preset phrase or emote)

Run on 2026-11-07 against the Vite dev server on `http://localhost:5273` (build from this branch), emulated
`844 × 390, mobile, touch, landscape`, solo bot match at `/match/AAAAAA`.

## Automated

| AC | Case | Where |
|----|------|-------|
| AC1, AC2, AC4 | `TC-MATCH-905` | `apps/web/tests/match-controls.test.tsx` |
| AC3, AC6, AC7 | `TC-MATCH-947` | `apps/web/tests/chat.test.tsx` |
| AC3, AC6 | `TC-MATCH-948` | `apps/web/tests/roster.test.tsx` |
| AC3, AC5, AC6, AC7 | `TC-MATCH-949` | `apps/web/tests/chat-wiring.test.tsx` |
| AC5, AC7 | `TC-CORE-963` | `packages/core/tests/phrases.test.ts` |
| AC4 (server side) | `TC-ROOM-065` | `apps/worker/tests/signaling.test.ts` |

## Manual check — AC3 in a real browser (`ac3-phrase-over-speaker-844x390.png`)

1. Play a bot match, open `Câu nói nhanh`, tap a phrase.
2. The banner appears **under the speaker's own chip** and reads the phrase in the client's locale.

Measured in the page (Chrome DevTools `evaluate_script`):

```text
toast text       "Bắn đẹp đấy!"
parent cell      data-testid="roster-0"     (the local player, slot 0)
bounding rect    x 9, y 140, w 92.8, h 24   (inside the 844 × 390 viewport)
document width   844 = viewport width        (no sideways scroll)
```

The capture was taken with `window.setTimeout` filtered so the 3 s fade did not race the screenshot; nothing about
the rendered frame depends on that filter.

Two things this walk found and this pass fixed:

- The banner was drawn under the `.banner` event feed. It now sits at `z-index: 52`, so a phrase is legible while a
  turn resolves.
- The banner used to be rendered in the **viewer's** corner as `match.chat.bubble`; it now hangs off the speaker's
  roster cell, which is what AC3 asks for and what makes a phrase attributable.

## Still manual

- `TC-MATCH-905`'s device half — six taps in a second on a real phone verifying the local budget feels right — is
  covered by the local case; no device run has been recorded.
- Two peers exchanging a phrase in a real room is exercised by `TC-MATCH-949` at the module level only; the
  two-device pass belongs to the `US-NET-004` manual sweep.
