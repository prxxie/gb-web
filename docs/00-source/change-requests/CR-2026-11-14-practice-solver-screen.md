---
id: CR-2026-11-14-practice-solver-screen
status: applied
requested_by: Chung Pham (Product Owner)
date: 2026-11-14
---

# CR-2026-11-14-practice-solver-screen — the practice route is a real screen

## Request

`US-BAL-007` was written assuming a practice route already existed:

> **AC5.** Given the practice route, when it is opened, then it shows the three modes and states, once, that it is not
> available in a match.

The repository has no such route and no screen for it: `apps/web/src/app/App.tsx` serves `/`, `/sign-in`, `/profile`,
`/leaderboard`, `/lobby/:code`, `/match/:code` and `/results/:code`, `docs/02-reference/screens/` holds a file for each of
those seven, and "practice" in the doc set means a *practice match* — one device, one opponent, no network
(`US-CORE-005`, `apps/web/src/lib/plan.ts`) — not a tool screen. `EPIC-09` lists "the practice route's visual design" as
out of scope, so the surface was deferred rather than specified.

Asked on 2026-11-14 how to reach AC5 without inventing a screen, the client chose: **record the change request first, then
build the screen**. This CR specifies the surface so `US-BAL-007` can be sized, built and reviewed against a document
instead of against a guess.

What the screen is: the reference engine answers three questions in closed form — the bar for a distance, the distance for
a bar, and the flight time for either — and those three are the practice tool of a blind-fire game. They must never be
reachable from a ranked match, because the shot is the calculation.

## Impact

| Kind | Item | Change |
|------|------|--------|
| Doc | `02-reference/screens/practice.md` | **new** — `/practice`, layout, fields and controls, states, copy keys, permissions, contract table with an oracle per row (a `G2` requirement) |
| Doc | `02-reference/screens/README.md` | eight routes, not seven; a row in the screen index; a node and edge in the navigation map |
| Doc | `02-reference/screens/main.md` | one new control (`Công cụ tính toán` → `/practice`), its copy key, and the account state it follows |
| Doc | `02-reference/gameplay/reference-gunbound.md` § 11 | the practice tool joins the "where each rule lives" table, so the closed form has a home other than the integrator's story |
| Doc | `01-overview/glossary.md` | **solver** (the flat-ground closed form) defined once, distinct from the *resolver* (the integrator) |
| Story | `US-BAL-007` | AC5 names `apps/web/src/routes/PracticePage.tsx` and the screen doc; § 4 gains the fixed handle the page renders; § 7 out of scope narrows to "an in-match overlay"; **size S → M** (2.5 instead of 1.0 days) |
| Story | `US-BAL-008` | unchanged — it already depends on `US-BAL-007` and on the solver module, not on the screen |
| Code | `packages/core/src/solver.ts` | new pure module (already `US-BAL-007` § 6); no change from this CR |
| Code | `apps/web/src/routes/PracticePage.tsx`, `apps/web/src/app/App.tsx` | new route, lazily loaded like `SignInPage`, so the match route's graph is untouched; three inputs, three answers, one notice |
| Code | `apps/web/src/i18n/vi.json`, `apps/web/src/i18n/en.json` | the screen's copy in both languages (`NFR-18`); no literal strings in the component |
| Code | `apps/web/src/routes/MainPage.tsx` | one text link beside `Bảng xếp hạng` |
| Plan | `03-stories/delivery-plan.md` W8 | W8 **18.0 → 19.5** story-days, backlog **141.5 → 143.0**; order unchanged (`US-BAL-007` still ships before `US-BAL-008`) |
| Decision | `OQ` / `ADR` | no new open question and no ADR: the closed form is `reference-gunbound.md` § 10 applied, not a new physics decision. The one assumption below is recorded here instead |
| Stack | packs | none — the screen uses the `react-vite` pack's route, i18n and test conventions as they stand |
| Operations | `08-ops/` | nothing. The screen calls no API, needs no session, and cannot affect a room (`NFR-21`: it works offline) |
| Gate | `G1`, `G2` | both re-open: `G1` signed a baseline of 73 stories and 141.5 days, `G2` signed a contract set with no `/practice` in it. Both are re-signed by the same Product Owner after the change lands. `G3`/`G4` are `pending` and stay so |
| Budget | `scripts/bundle-budget.json` | a new `practice` bucket — the route is a separate lazy chunk, so the `match` bucket must not grow by it |

**Classification: additive.** One story that has not started (`US-BAL-007`, `ready`) is modified in place; no `done` story
is reworked, no story is closed, and no data migrates. Effort **+1.5 story-days**.

**Accepted assumption (recorded, not guessed silently).** The screen is public: no session, no rank, no stored history,
reachable from the main menu for every role — `roles-and-permissions.md` gains no new role, and the tool keeps working
offline like a practice match. The alternative (a signed-in-only tool) would have to be a permission rule, and the system
has none worth adding for arithmetic the player could do on paper.

**Not in this change.** Terrain-aware solving (that is the integrator), an in-match overlay or hint, saved history of
solved shots, and any per-mobile preset — the player types the three inputs they were given by the screen.

## Decision

**Approved and applied 2026-11-14** by Chung Pham (Product Owner), who also owns the two gate signatures this re-opens.
Applied in the same change: `02-reference/screens/practice.md`, `screens/README.md`, `screens/main.md`,
`reference-gunbound.md` § 11, `01-overview/glossary.md`, `US-BAL-007` (AC5, § 4, § 7, size `M`, cases `TC-BAL-149`–`155`),
`delivery-plan.md` (W8 19.5, backlog 143.0), `05-quality/acceptance-signoff.md` (`G1`, `G2` re-opened) and
`CHANGELOG.md`. The build itself lands with `US-BAL-007`.
