---
id: US-FND-003
title: Render the app shell with routing, locale loading and an error boundary
epic: EPIC-00-foundation
status: done
priority: P0
size: M
depends_on: [US-FND-001]
open_questions: []
accepted_assumptions: []
refs: [02-reference/screens/README.md, 01-overview/conventions.md, 01-overview/nonfunctional-requirements.md]
---

# US-FND-003 — Render the app shell with routing, locale loading and an error boundary

## 1. Story

**As a** player opening the link
**I want** a landscape shell that routes between the seven screens, loads the right language and survives an API
failure
**so that** every later screen story adds a route body instead of a layout.

## 2. Context

The React shell owns the layout, the router, the i18n tables and the Phaser mount point; the game scene owns nothing
([architecture.md](../../01-overview/architecture.md#components)). This story builds the shell with empty route bodies
and the failure path players will actually hit on a flaky mobile network.

| Topic | Reference |
|-------|-----------|
| Routes and navigation | [screens/README.md](../../02-reference/screens/README.md) |
| Naming, i18n and error rules | [conventions.md](../../01-overview/conventions.md) |
| FR-01 room entry, NFR-16/18/19 | [nonfunctional-requirements.md](../../01-overview/nonfunctional-requirements.md) |

## 3. Acceptance criteria

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The shell running | Each of the seven routes is opened directly by URL | Every route renders its own `h1` and nothing else throws; unknown paths redirect to `/` |
| AC2 | The shell running with no `locale` in storage | The app starts | It renders in `vi`, the toggle shows `VI`, and every visible string comes from the locale table |
| AC3 | The locale set to `en` | The app is reloaded | It renders in `en` and the choice persists in `localStorage` under `gbw.locale` |
| AC4 | An API call stubbed to return `500` with a `request_id` | The screen settles | A banner shows the translated message and the `request_id`, and no stack trace or raw JSON is visible (`TC-FND-132`) |
| AC5 | A route rendering a component that throws | The route renders | The error boundary shows the same banner and the rest of the shell stays usable; the error is logged once |
| AC6 | A 844×390 landscape viewport and a 1024×768 one | The shell renders | No horizontal scrolling and no element below the 44 px touch minimum outside the canvas |

## 4. Contract

Route table (`react-router-dom` v7, `createBrowserRouter`): `/`, `/sign-in`, `/profile`, `/leaderboard`,
`/lobby/:code`, `/match/:code`, `/results/:code` — lazy-loaded except `/` ([screens/README.md](../../02-reference/screens/README.md#screen-index)).

`apps/web/src/app/`:

```ts
export function App(): JSX.Element            // router + providers
export function Shell(props: { children: ReactNode }): JSX.Element  // top bar, locale toggle, main
export class ErrorBoundary extends Component<{ children: ReactNode }>  // banner + request_id
```

`apps/web/src/i18n/index.ts`:

```ts
export type Locale = "vi" | "en";
export function loadLocale(l: Locale): Promise<Record<string, string>>;
export function t(key: string, vars?: Record<string, string | number>): string; // throws in dev on a missing key
```

Top bar: 56 px, contains the locale toggle (44×44 minimum) and the slot for the sign-in/profile control.

## 5. Rules and edge cases

- A missing translation key throws in development and renders the key in production — never an empty string.
- The locale choice is read before the first paint (no Vietnamese flash for an English player); a blocking read from
  `localStorage` is acceptable here.
- The error boundary catches render errors only; API failures are handled per screen and must not unmount the shell.
- No network call may be issued by the shell itself; `/` renders without any request.
- Route bodies stay empty in this story; adding gameplay to `/match/:code` is the MATCH epic.

## 6. Implementation notes

- `Vite` + `react-router-dom` v7 data router; `Phaser` is not imported by the shell (only by the match route, lazily).
- `apps/web/src/i18n/vi.json` and `en.json` hold the keys; a `apps/web/tests/i18n.test.tsx` compares the key sets.
- The banner component is shared with the match screen's reconnect overlay but is not the same component.

## 7. Out of scope

- Screen contents: main menu ([US-ROOM-001](../EPIC-02-rooms/US-ROOM-001-create-a-room-with-a-shareable-code.md)), sign-in ([US-AUTH-002](../EPIC-01-accounts/US-AUTH-002-sign-in-with-clerk.md)), profile ([US-AUTH-003](../EPIC-01-accounts/US-AUTH-003-edit-display-name-and-avatar.md)), leaderboard ([US-RANK-004](../EPIC-06-ranked/US-RANK-004-climb-the-leaderboard.md)), lobby ([US-ROOM-002](../EPIC-02-rooms/US-ROOM-002-join-a-room-and-see-the-roster.md)), match (MATCH epic), results ([US-RANK-005](../EPIC-06-ranked/US-RANK-005-see-the-result-screen.md)).
- Language completeness and the a11y pass — [US-PWA-002](../EPIC-07-pwa-i18n/US-PWA-002-switch-between-vietnamese-and-english.md).

## 8. Test notes

`TC-FND-131` (`apps/web/tests/shell.test.tsx`, RTL + memory router) and `TC-PWA-130` (`apps/web/tests/i18n.test.tsx`
for the two locale tables) cover AC1–AC3 and AC5; `TC-FND-132` (`apps/web/tests/errors.test.tsx`) covers AC4 and
`TC-FND-133` (`tests/e2e/a11y.spec.ts`) covers AC6.
- **Red:** `TC-FND-132` in `apps/web/tests/errors.test.tsx` failed while the banner showed only the dictionary line
  and dropped the `request_id`, so support could not connect a screenshot to a log line.

## 9. Open questions

None.

<!-- delivery:2026-11-05 -->

## Delivery status — 2026-11-05

**done.** the React shell, the seven routes, the vi/en tables and the locale provider exist; `apps/web/tests/{hud,input}.test.tsx` cover the tables and the gate
