# Screen — `/practice`

The reference engine's three closed-form answers, as a tool a player can use while practising. A distance in phần and an
angle give the bar; a bar and an angle give the distance and the flight time; a bar and an angle give the time alone. It is
**flat ground by construction** and it is **never reachable from a match** — the arithmetic is the game
(`US-BAL-007`, `CR-2026-11-14-practice-solver-screen`).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ←   Công cụ tính toán                                          [VI|EN]          │
├───────────────────────────────────────────────────────────────────────────────┤
│  [ Tính bar ] [ Tính khoảng cách ] [ Tính thời gian ]                          │
│                                                                               │
│  Máy      [ Boomer ▾ ]        Góc      [ 45 ] °                                │
│  Gió      [ 12 ]  ( Đông ) ( Tây )       Chênh cao  [ 0 ] phần                 │
│  Khoảng cách [ 2.77 ] phần                                                     │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Bar 4.00        bay 3.37 s                                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│  Chỉ đúng trên mặt đất phẳng. Công cụ này không có trong trận đấu.            │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Mode | segmented control: `bar` · `distance` · `time` | local state, default `bar` | Chooses which one field is the **input** and which answers are printed (`US-BAL-007` AC5) |
| Máy | select, the seventeen machines (`data/mobiles.md`) | `MOBILES` in `@gbw/core` | Its `weight` gives `gravity`, its `windDrag` gives the wind coefficient — `gravityFor` and `windKFor`, never a typed-in number |
| Góc | number, 0–180, step 1, default 45 | local state | The angle the player means to fire at; `facing` is always east, so the answer is the bar or distance for that side of the muzzle |
| Chênh cao | number, phần, step 0.01, default 0 | local state | The target's height above the muzzle, negative for below (`deltaY` in world units after `× 100`) |
| Gió | number 0–26 + `Đông`/`Tây` toggle | local state, default 0 | Feeds `windAcceleration(wind, k)` — the wind is horizontal (`tunables.md` § 1.1, `US-CORE-015`) |
| Khoảng cách | number, phần, step 0.01 | local state, the input in `bar` mode | The only place phần becomes world units: `parts × TUNABLES.partWidth` (`US-BAL-007` § 5) |
| Bar | number, 0–4.00, step 0.01 | local state, the input in `distance` and `time` modes | Clamped by the solver to `0…4`, like `muzzleVelocity` |
| Answer — bar | fixed 2 decimals | `barForDistance` | Printed with its flight time: `Bar 4.00 · bay 3.37 s` |
| Answer — distance | fixed 2 decimals, phần | `distanceForBar` | Plus the flight time, same line |
| Answer — time | fixed 2 decimals, seconds | `timeForShot` | The mode's only answer |
| Refusal | one sentence | `SolveResult.reason` | Shown in the answer box instead of a number — never a negative bar, `NaN` or `Infinity` (`US-BAL-007` AC3) |

## Actions

| Action | Effect | API | Permission |
|--------|--------|-----|-----------|
| Solve | Recomputes on every input change; no submit button. A refused solve keeps the inputs and prints the reason | `solver.ts` in `@gbw/core`, on the device | public — no session, no network (`NFR-21`) |
| Switch mode | Keeps góc, máy, gió, chênh cao; swaps which value is typed | — | public |
| Back | → `/` | — | — |

## States

| State | Behaviour |
|-------|-----------|
| Solved | The answer box holds the numbers; the flat-ground sentence is always below it |
| Refused | The box holds `practice.invalid` and the reason (`góc phải trong 0…180`, `không tới được ở góc này`, `gió quá mạnh cho góc này`); nothing else on screen changes |
| Never seen the answer yet | The box is empty; no spinner — the solve is synchronous and takes microseconds |
| Offline | Works unchanged. The page carries `practice.offlineNote` once, and no request is made (`US-PWA-001` §5) |
| Narrow | Inputs stack in one column below 640 px of content width; the language switch and the notice stay visible |

## Notes

- The page imports `solver.ts` and **nothing from `../game`**, and the match route imports neither — the import graph is
  the guard (`US-BAL-007` AC4). The route is lazy-loaded like `SignInPage`, so its own chunk is the whole cost.
- The notice "không có trong trận đấu" is rendered **once** on the page, not per answer, and it is the only place the
  screen mentions a match (`US-BAL-007` AC5).
- No result is stored, logged or sent: the screen has no network path at all, which is also why it needs no consent
  banner and no `request_id` handling.
- Numbers are printed with the locale's decimal separator (`Intl.NumberFormat`) but always two decimals, so `4,00` in
  `vi` and `4.00` in `en` mean the same bar.
- The answer is a number, not an instruction: it says what bar reaches that distance **on flat ground**, and the sentence
  under it says the terrain is not in the arithmetic.

## Copy keys

`practice.title`, `practice.mode.bar`, `practice.mode.distance`, `practice.mode.time`, `practice.machine`,
`practice.angle`, `practice.height`, `practice.wind`, `practice.windEast`, `practice.windWest`, `practice.distance`,
`practice.bar`, `practice.answerBar`, `practice.answerDistance`, `practice.answerTime`, `practice.flight`,
`practice.flatOnly`, `practice.notInMatch`, `practice.offlineNote`, `practice.invalid`,
`practice.invalidAngle`, `practice.invalidUnreachable`, `practice.invalidWind`.

## Oracle

| Contract | Checked by |
|----------|-----------|
| `bar → distance → bar` round trip across angles 20–85° and bars 0.5–4.0, to ±0.01 bar | `packages/core/tests/solver.test.ts` (TC-BAL-149) |
| The calibration shot: 2.77 phần at 45°, flat, no wind → bar `4.00`, flight `3.37 s ±0.05` | `packages/core/tests/solver.test.ts` (TC-BAL-150) |
| A too-low angle for the height difference and a too-strong headwind return `ok: false` with a reason, never a negative or infinite bar | `packages/core/tests/solver.test.ts` (TC-BAL-151) |
| The match route's import graph does not reach the solver, and the practice route's reaches nothing in `game/` | `tests/meta/solver-isolation.test.ts` (TC-BAL-152) |
| The screen shows the three modes, each with its own answer, and the "not in a match" notice exactly once | `apps/web/tests/practice.test.tsx` (TC-BAL-153) |
| Every string comes from the vi and en tables; no literal copy in the component | `apps/web/tests/practice.test.tsx` (TC-BAL-154) |
| The route solves with the network off and never issues a request | `apps/web/tests/practice.test.tsx` (TC-BAL-155), `tests/e2e/practice.spec.ts` |
| Direct URL, `h1`, keyboard order, 44 px targets, axe AA clean | `tests/e2e/practice.spec.ts` (TC-BAL-155) |
