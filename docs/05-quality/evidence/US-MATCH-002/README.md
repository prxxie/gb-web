# US-MATCH-002 — aim and fire by touch: evidence

## Automated (2026-11-07)

| Case | What it pins down | Where |
|------|-------------------|-------|
| `TC-MATCH-914` | drag distance → power: 45 % of the shorter edge is 4.0, half of that 2.0 ± 0.1; the angle comes from `atan2(-dy, dx)` and is mirrored for a mobile facing the other way | `apps/web/tests/aim.test.tsx` |
| `TC-MATCH-916` | below the dead zone nothing is sent; two fingers pan or zoom, never a pull | `apps/web/tests/aim.test.tsx` |
| `TC-MATCH-936` | exactly one `fire` per release with `force = round(power × 25)`, the clamped angle, the active `weaponSlot` and the sender's `seq`; a second release in the same turn is dropped; the ring is an arc from −90° clockwise, amber → red, at a fixed 64 px radius | `apps/web/tests/aim-fire.test.tsx` |
| `TC-MATCH-937` | aiming is refused out of turn, when the local mobile is wrecked, when the match is over and after one shot in the turn | `apps/web/tests/aim-fire.test.tsx` |
| `TC-MATCH-902` | a real drag on the canvas moves the power readout and the shot lands in the feed | `tests/e2e/smoke.spec.ts` |

## Browser walk — 2026-11-07, 844 × 390 (`http://localhost:5273`, bot match)

`docs/05-quality/evidence/US-MATCH-002/ac-arc-and-hint-844x390.png` was taken mid-pull after a

1. short drag that ended inside the dead zone → nothing was fired and `[data-testid="pull-hint"]` printed
   `Kéo để lấy lực` once;
2. longer drag → the arc filled clockwise from −90° in amber (power `1.30` of 4.0), and the readout moved to the top
   of the ring (`match__power--on-ring`, `style.left/top` on the reported focus point);
3. release → one shot in the event feed, the ring cleared, and the clock turned over to the bot.

Two visual notes, both recorded rather than hidden: the weapon strip still sits over the lower-left of the ring (the
open follow-up from `US-MATCH-003`), and the `Lượt của bạn` line is partly clipped while the readout is anchored to the
ring — the number itself stays legible.

## Still manual — `TC-MATCH-938`

The 16 ms budget of AC2 needs a device trace, not a desktop browser:

1. Open a bot match on an iPhone 12 and a Galaxy A52 in landscape, at 60 FPS.
2. Record a performance trace while dragging for ~10 s.
3. Read the frame durations of the pull frames: every frame that draws the ring must be ≤ 16 ms.

Record the numbers here when they are measured. The check is scheduled with UAT at M2 (`docs/03-stories/delivery-plan.md`).
