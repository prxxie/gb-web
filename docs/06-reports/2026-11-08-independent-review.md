# Independent review — 2026-11-08

A read-and-run pass over the repository at `da17f7e` (the `US-ROOM-007` merge), executed on this machine rather than
summarised from earlier notes. It records what was measured, what it changed, and what it deliberately did not touch.

## 1. What was executed

| Command | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0, `ESLint: No issues found` |
| `pnpm test` | 123 files / **1036 cases passed** (34.2 s) |
| `pnpm build` | exit 0; web bundle below, worker `Total Upload: 184.03 KiB / gzip: 48.26 KiB` |
| `pnpm budget` | shell 152.6 / 153 · match 385.1 / 386 · signin 0.9 / 1 · css 2.9 / 3 KiB gzip |
| `node .agents/scripts/verify-docs.mjs` | 0 errors, 0 warnings |
| `pnpm e2e` (`E2E_WEB_PORT=5299`) | **61 passed, 1 failed** before this pass; 62 passed after (§ 3) |
| `tests/meta/traceability.test.ts` | 292 of 354 documented cases carry an automated test (the floor said 72) |

Web bundle as `vite build` printed it: `index` 111.44 kB / 30.92 kB gzip, vendor `index` 393.74 kB / 125.30 kB gzip,
`MatchPage` 1 454.85 kB / **394.30 kB gzip**, `SignInPage` 1.73 kB / 0.89 kB gzip, CSS 11.95 kB / 2.99 kB gzip,
service-worker precache 12 entries / 1 933.77 KiB.

## 2. Findings

### Critical

1. **The Playwright job was red on `main`.** `tests/e2e/pwa-offline.spec.ts:36` asserted the menu's offline sentence
   (`main.offline`) against the leaderboard banner, which `e2e8d08` moved to its own key (`leaderboard.offline`). `D2`
   ("the full test suite passes") was therefore unmet for `US-RANK-004` on a merged story.
2. **A merged story shipped a defect the docs already contradicted.** `room-do.ts` charged the `control` budget at
   **5 frames/s** while `02-reference/api/signaling.md` § Budgets documents **20/s**, and the loadout screen emits one
   frame per tap — eleven item taps plus a mobile tap crosses 5/s, and crossing a budget closes the socket with `4429`,
   which the client reads as fatal. Fixed on the `US-ROOM-007` branch before this pass (`a5a2edf`, merged as `91e32f1`).
3. **`main` had never been pushed.** `origin/main` is 63 commits behind at the start of this pass; `.github/workflows/`
   had therefore never executed on the real history, and no gate or release could cite a CI run.

### Medium

4. **Doc drift in the counts.** `05-quality/test-plan-status.md` said "118 Vitest files (962 cases), 13 specs (53 cases),
   green 2026-11-07"; `environment-setup.md` § 6 still said "15 files / 110 cases, `e2e` runs 6 specs". The real numbers
   are 123 / 1036 and 16 / 62.
5. **Oracle cells named files that do not exist** — eight Playwright specs (`focus`, `orientation`, `reconnect`,
   `privacy`, `prod-smoke`, `profile`, `errors`, `offline`) across `02-reference/screens/*`, `01-overview/` and
   `US-ROOM-006`. A register that lists them as *planned* is honest; the reference page that claims them is not.
6. **Two `done` stories cited a file that never existed** — `US-FND-003` and `US-PWA-002` named
   `apps/web/tests/i18n.test.ts`; the file is `i18n.test.tsx`.
7. **The coverage floor was 72 of 354** while 292 were automated: a regression of 220 cases would still have passed
   `traceability.test.ts`. A floor that far below reality is a comment, not a gate.
8. **The web payload had no enforced weight.** `NFR-03` caps the cold load at 5 MB and only the production e2e spec
   measures it, so a chunk could double between two e2e runs without anything failing.

### Recorded, not fixed here

9. **A route whose session could not be minted renders no `h1`.** With every API call aborted, `/lobby/:code` and
   `/results/:code` fall back to the sign-in prompt, which carries no heading — so the "every route moves focus to its
   `h1`" rule does not hold on that failure path, and `tests/e2e/focus.spec.ts` cannot include it. Recorded in
   `05-quality/test-plan-status.md` § 3; the fix is a heading in those two fallbacks.
10. **Structural debt.** `apps/web/src/routes/MatchPage.tsx` is 1 004 lines with 13 `useEffect`s; `apps/worker/src/room-do.ts`
    is 1 190 lines. Neither is a defect — both are cohesive and commented — but they are where the next feature will hurt.
11. **Anti-cheat is plausibility-only** (`OQ-30`, accepted): a tampered host can still claim a false result and the Elo
    ladder accepts it. Re-confirm before `M3`, because the ladder is user-visible.
12. **`TC-ROOM-047`** (the 20 s countdown to `disconnected`) and the mid-match half of `TC-ROOM-046` (HP restored from
    `lastSnapshot`) still have no automated case; `tests/e2e/reconnect.spec.ts` proves the lobby seat and team.

## 3. What this pass changed

| Change | Why |
|---|---|
| `tests/e2e/pwa-offline.spec.ts` asserts the documented `leaderboard.offline` sentence and the retry that sits in the same element | Finding 1 — the spec, not the product, was wrong (`02-reference/screens/leaderboard.md` § Offline) |
| 15 oracle rows now name the file that exists, or say `— planned, see 05-quality/test-plan-status.md` | Finding 5 |
| `test-plan-status.md` rewritten from the tree: 123/1036 and 16/62, the written lists regenerated, the planned table trimmed to what is really missing, and § 3 naming the `done` stories whose oracle is still planned | Findings 4, 5, 11 |
| `environment-setup.md` § 6 lists `pnpm build` and `pnpm budget` and the real counts | Finding 4 |
| 12 story lines and 4 spec headers repointed from the retired layout (`tests/core/…`, `tests/web/…`, `tests/worker/…`) to the package paths, and three story filenames corrected | The same class of drift as finding 5, inside the stories |
| `tests/meta/traceability-baseline.txt` 72 → 292 | Finding 7 — the floor now sits where coverage actually is |
| `scripts/bundle-budget.mjs` + `scripts/bundle-budget.json` + `pnpm budget` + a CI step | Finding 8 — the weight of every chunk is a ratchet: a bucket may only grow when its number is raised in the same change, and a chunk that matches no bucket fails |
| The five Playwright specs the oracle tables named but the repository never had — `errors`, `focus`, `profile`, `privacy`, `reconnect` (11 cases) | Findings 5 and 11 — and they found two real defects, below |
| `useRouteFocus()` now repeats its attempt inside a 2 s budget | The single 50 ms attempt found no `h1` on the two lazy routes (`/sign-in`, `/match/:code`), so focus stayed on the control the navigation had removed — `US-PWA-004` AC7 was only true for eager routes |
| `/profile` redirects a guest instead of prompting | `screens/profile.md` and `TC-AUTH-143` promise a redirect; the screen offered a link |
| `TC-PWA-131`, `TC-PWA-190` and four oracle rows narrowed to the criterion the stories state | The "focus returns to the invoking control on back" clause existed in no acceptance criterion and in no code — the case table was asserting a feature nobody wrote |
| `AGENTS.md` § PROJECT and this report | The numbers a stranger reads first |

`pnpm e2e` after the changes: **73 passed** (21 specs). `pnpm test`: 123 files / 1036 cases, traceability 295 of 355
documented cases automated. `pnpm budget`: every bucket inside its recorded weight.

## 4. What is left, and who can do it

| Item | Blocker | Next action |
|---|---|---|
| CI has never run on this history | needs a push to `origin/main` (63+ commits), which `04-git.md` § 6 forbids without explicit permission | ask, then `git push origin main` |
| `G1`–`G4` are all `pending` | a gate is signed by a person with the evidence in front of them, never by the agent (`03-definition-of-ready-and-done.md` § 5) | run `cpt-signoff` for `G1`/`G2` and sign the rows; `docs/05-quality/acceptance-signoff.md` is still empty |
| No release record and no tag | `US-FND-004` and `US-OPS-004` are `ready`, and a real deploy needs Cloudflare and Clerk credentials this machine does not have | `US-FND-004` first, then `cpt-release` writes `REL-001` |
| `OQ-20` (art policy) | open, and the delivery plan calls it a release blocker for `M3` | `cpt-decide` |
| Findings 9 and 10 | need a story and a decision, not a patch | two `refactor` stories proposed below |

### Proposed stories

Neither is created here: a backlog entry is a planning act, and the ACs below are a sketch for `cpt-plan` to accept or
rewrite.

- **`US-MATCH-008` — split the match page.** AC: `apps/web/src/routes/MatchPage.tsx` is ≤ 400 lines and the route is
  composed of named hooks and panels; no file under `apps/web/src/routes/` exceeds 500 lines; every existing web test
  and e2e spec passes **without an edit to its assertions** (the suite is the oracle for "no behaviour changed").
- **`US-ROOM-009` — split the room object.** AC: `apps/worker/src/room-do.ts` is ≤ 400 lines, with the socket budget,
  the host election and the match recording in their own modules under `apps/worker/src/room/`; every
  `apps/worker/tests/room-*.ts` file passes unchanged, including `TC-ROOM-712` and the migration cases.
