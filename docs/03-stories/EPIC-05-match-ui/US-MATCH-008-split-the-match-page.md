---
id: US-MATCH-008
title: Split the match page into hooks and panels
epic: EPIC-05-match-ui
status: done
priority: P2
size: L
depends_on: [US-MATCH-001, US-MATCH-003, US-MATCH-005, US-MATCH-007]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/match.md, 01-overview/conventions.md]
---

# US-MATCH-008 — Split the match page into hooks and panels

## 1. Story

As the developer who adds the next thing to the battlefield, I want the match screen to be a handful of named hooks and
panels instead of one file, so that a change to the clock does not require reading a thousand lines to find out what
else listens to it.

## 2. Context

`apps/web/src/routes/MatchPage.tsx` is 1 004 lines with 13 `useEffect`s: the plan, the socket, the WebRTC mesh, the
host simulation loop, the turn clock, the HUD wiring, the phrase picker, the result hand-off and the weather banner all
live in one component body. It works and it is commented, but every one of those effects can now only be understood by
reading all of them — the recorded review (`06-reports/2026-11-08-independent-review.md` § 2 finding 10) called it the
place the next feature will hurt.

| Topic | Reference |
|---|---|
| The screen's contract | [`02-reference/screens/match.md`](../../02-reference/screens/match.md) |
| File and module conventions | [`01-overview/conventions.md`](../../01-overview/conventions.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC1 | the refactor is done | the tree is measured | `apps/web/src/routes/MatchPage.tsx` is ≤ 400 lines and no file under `apps/web/src/routes/` exceeds 500 (`TC-MATCH-190`) |
| AC2 | the same refactor | the suites run | every existing Vitest case and every Playwright case passes **without an edit to an assertion** — the suite is the oracle for "no behaviour changed" (`TC-MATCH-191`) |
| AC3 | the same refactor | `MatchPage` is read | no component body holds more than four `useEffect`s; each effect lives in a named hook (`usePlan`, `useRoomSocket`, `useMesh`, `useHostSimulation`, `useTurnClock`, …) with a one-line comment naming the contract it serves |
| AC4 | the same refactor | `pnpm budget` runs | the `shell` bucket does not grow, and no new chunk appears |
| AC5 | the same refactor | the dependency list is read | `apps/web/package.json` gains no dependency |

## 4. Contract

No wire, storage or route contract changes. The component tree below `MatchPage` may change freely; the `data-testid`
attributes the e2e specs use (`match-screen`, `match-actions`, `hud-*`, `weapon-strip`, …) stay as they are.

## 5. Rules and edge cases

- A hook owns its subscriptions and returns what the screen renders; no hook reaches into another's ref.
- The host simulation loop stays in one place: splitting the tick across two hooks reintroduces the double-apply bug
  `US-CORE-002` closed.
- No behaviour change is in scope, so a failing assertion is a bug in the refactor, never a reason to update the test.

## 6. Implementation notes

Suggested split, to be confirmed while doing it: `hooks/usePlan.ts`, `hooks/useRoomSocket.ts`, `hooks/useMesh.ts`,
`hooks/useHostSimulation.ts`, `hooks/useTurnClock.ts`, and panels under `components/match/` (`Hud`, `WeaponStrip`,
`PhrasePicker`, `Banner`, `WeatherBanner`). `TC-MATCH-190` is a meta test (`tests/meta/file-size.test.ts`) so the size
rule is enforced rather than remembered.

## 7. Out of scope

Renderer work (`ADR-0006`), performance tuning, any change to `packages/core`, and the accessibility follow-ups recorded
in `US-MATCH-003`/`US-MATCH-007`.

## 8. Test notes

Red: none — a refactor has no failing case to start from; the suites are the oracle for "no behaviour changed" (AC2), and
`tests/meta/file-size.test.ts` is what keeps the size rule from drifting back.

`TC-MATCH-190` (the size rule, meta), `TC-MATCH-191` (the suites unchanged). No new behaviour means no new case beyond
those two: every other assertion in the repository is already the proof.

## Delivery status — 2026-11-10

**done.** `MatchPage.tsx` went **1 108 → 172 lines** with **zero `useEffect`s left in the component body**; the twenty-odd
hooks and panels live under `apps/web/src/match/` (`useMatchEngine`, `useMatchPlan`, `useNetplay`, `battleMesh`,
`useBattleMount`, `useBattleSync`, `useTurnClock`, `useBotOpponent`, `useMatchInputs`, `useMatchItems`, `useMatchChat`,
`useWeaponSelect`, `useAimHud`, `useMatchRecorder`, `useHosting`, `useSnapshotWatchdog`, `useMatchAnnouncement`, `wiring`,
`aimAid`, and the `MatchTopBar`/`MatchBottomBar`/`MatchAimOverlays`/`MatchNotices` panels).

| AC | Evidence |
|---|---|
| AC1 | `TC-MATCH-190` — 172 lines against the 400 limit, and no route file over 500 (the case measures every file under `apps/web/src/routes/`). The cited file did not exist until now, which is why the page had grown back to 1 108 lines unnoticed. |
| AC2 | `TC-MATCH-191` — `apps/web/tests` 61 files / 417 cases pass with **no assertion edited**; `tests/e2e` 77 cases pass; `npx tsc -b` and `eslint apps/web/src` clean. A throwaway A/B spec rendered the pre-refactor page from `git show HEAD:` against the new one and compared `container.innerHTML` in five states (initial HUD, mid-pull, wheel open, wheel closed, pull hint): byte-identical. |
| AC3 | `TC-MATCH-190` also counts `useEffect(` in the page body and fails past four; the body has none. |
| AC4 | `pnpm budget` — the bucket list is unchanged and `shell` did not grow; every new module is a static import of the same lazy route, so no chunk appeared. |
| AC5 | `apps/web/package.json` is untouched. |
