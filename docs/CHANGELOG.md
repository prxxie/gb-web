# Changelog

## 2026-11-08 — the physics goes back to GunBound's

An audit of the integrator against the genre found the model had invented two things GB does not have and scaled a third
wrong. All three are gone; the numbers below are measured on the engine, not estimated.

- **One gravity for the roster.** Each mobile carried its own `gravity` (84–128 u/s²) and `mass` (118–169), so the same
  angle and power drew a different parabola per mobile (1,610–2,199 units at 45°/full power) and a range learned on one
  mobile did not transfer. GB gives every mobile the same gravity: `TUNABLES.gravity = 100`, bent only by the map's
  `gravityModifier`, and the `gravity`/`mass` fields are gone from the mobile record, the doc tables and the tests. What
  separates the twenty mobiles is now the firing envelope and the shell — which is the genre's design.
- **A wind that is horizontal and mass-free.** The wind was a 12-sector polar vector divided by mass, so it had a vertical
  term that made shells hang and a push that varied per mobile. GB's wind is east or west and pushes every mobile alike:
  `ax = 0.8 × magnitude`, `ay = 0`, `windSectors = 2`, and the dial draws two ticks instead of twelve. At full wind (26)
  the calibration shot bends 760 units — six ruler divisions, a sixth of the map — where it used to bend 129.
- **`speedK` 4.55 → 6.2, so the power bar is usable.** A shot to the 1,640-unit spawn gap on `map-01` needed force 86–99
  of 100 (3.44–3.97 of 4 bars) and two mobiles could not reach the enemy at all; it now needs ~65 (2.6 bars), and full
  power clears a whole map width, as it does in GB.
- **A decode bug the rebalance exposed**: `snapshot.ts` rebuilt `directionDeg` as `sector * 30` while the engine rolled
  `sector * 180`, so a west wind came back from the wire as 30° and a peer simulated a different shot (`TC-CORE-928`).
- The health endpoint and the worker fixtures now read `TUNABLES.rulesetVersion` instead of a literal, and
  `RULESET_VERSION` moved to `2026-11-08` — the `!` change `NFR-23` asks for.
- Docs rewritten in the same change: `tunables.md` § 1.1–1.3, `mobiles.md` § 1 and § 4 (regenerated table, no `g`/`mass`
  columns), `reference-gunbound.md` § 10, `ADR-0005`, `OQ-41`, and the four stories whose acceptance criteria quoted the
  old numbers.

Still on the GB-parity list, in the next change: the delay a player pays for thinking (`+10/s`), item delay costs at GB's
ratios, the super shot recharging from energy instead of once per match, and Bunge Shot carving 25 % more ground instead
of returning to the caster.

## 2026-11-08 — the play-through: the match could not be played, and now it can

A real bot match, driven in a landscape browser at 844 × 390, exposed what 1036 unit cases and 73 browser cases could
not: the game was unplayable in practice. Every finding below came from playing it, not from reading it.

- **The enemy was never on screen.** The camera followed the shooter (`windowOn`) and the two mobiles spawn 1 640 units
  apart on a 2 000-unit map, so the target sat outside the window: the player aimed at a number. `windowOnBoth` frames
  the pair, `clampWindow` keeps it inside the map, and the frame is nudged off the HUD cluster on the player's own side.
- **The shell was never drawn.** The scene drew sky, terrain, tanks and the aim ring, and nothing for the shot itself —
  the engine resolves a shot in one step, so the state jumped from "before" to "after". The `shot` event already carries
  the resolved `path`, `flightMs`, `impact` and `hits`, so the scene now animates exactly that: a shell with a trail
  along the engine's own path, a muzzle flash, an impact burst with smoke, a scorch mark, a frame shake, and the damage
  numbers over the target.
- **The angle readout ignored the gesture.** `aimAngle` was `45 + aimDelta`, the pad's nudge only; the pull's own angle
  went to `fireFromPull` and never to the screen. It now reads the pull, clamped to the barrel window — the same
  expression the shot uses.
- **The HUD swallowed the aim gesture.** `.match__hud > *` was `pointer-events: auto`, so `.match__top` — a band across
  the whole width — took every press: a pull that started there never reached the canvas, the power readout stayed at
  `0.00` and the release was cancelled as a dead zone. Containers are now transparent to pointers; only controls take
  a press.
- **The polite live region never said a shot happened.** It announced the turn and nothing else, so a screen-reader
  player never heard a shell land. It now announces the shot's own numbers (`match.announce.hit` / `match.announce.miss`).
- **The menu did not fit a landscape phone.** 1 028 px of content in 390 px of height put the play button below the
  fold; the lobby measured 1 685 px. A two-column layout at short landscape heights puts the play button at y=289, the
  header on one row, and the pitch line away — tap targets keep their 44 px floor (`NFR-17`).
- **A guest asked `/me` and logged two 401s** on every visit to `/profile` before the redirect. Only an account session
  asks now.
- **Graphics**: the sky is a dusk ramp with a horizon glow, the terrain has a lit surface band over three depth bands
  and a crisp rim, and impacts leave scorch marks that fade.
- **The ratchet moved with the weight**: `match` 386 → 388 KiB gzip and `css` 3 → 4 KiB gzip (total 543 → 546), recorded in `scripts/bundle-budget.json` with the reason — the shot animation and the sky/terrain pass cost 1.5 KiB gzip on the Phaser route and 0.3 KiB on the stylesheet.
- **Also fixed while verifying**: the heading no longer draws the browser's focus ring (the route focus is programmatic,
  so the title looked like a text input), and the landscape rule that hid the menu tagline no longer hides the result
  screen's "could not record" line (`TC-RANK-157`).

New oracle: `tests/e2e/match-feedback.spec.ts` (`TC-MATCH-900`). The canvas parts — pair framing, the flying shell, the
damage numbers — are recorded as hand-verified evidence in `05-quality/test-plan-status.md` § 3, with the reason the
angle case is not automated: Playwright's mobile emulation does not deliver the drag to the canvas the way a finger does.

## 2026-11-08 — the production deploy stops going red after every merge

- **Fixed** `deploy-production.yml`: the job arms itself only when the repository variable `PRODUCTION_READY` is `true`
  (or on manual dispatch). Before, every green `CI` run on `main` started a deploy that died on an empty
  `CLOUDFLARE_API_TOKEN` — a red run per merge, which is how a team learns to ignore red.
- **Changed** the two Cloudflare environment variables to the names `wrangler` 4 reads (`CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`); the `CF_*` pair is deprecated and warns on every run.
- **Fixed** `01-overview/deployment.md` § 4, which described a `ci.yml` that lints the OpenAPI with `redocly` and a
  production workflow triggered by "push to `main`, manual approval" — neither was true.

## 2026-11-08 — the five missing browser oracles, and two defects they found

- **Added** the five Playwright specs the oracle tables named but the repository never had:
  `tests/e2e/errors.spec.ts` (`TC-FND-079`: every API call aborted → a translated sentence, never a raw error string),
  `focus.spec.ts` (`TC-PWA-131`: focus lands on the new route's `h1`, lazy routes and back included),
  `profile.spec.ts` (`TC-AUTH-143`: a guest opening `/profile` is sent to `/sign-in`),
  `privacy.spec.ts` (`TC-ROOM-052`: the stubbed TURN username and credential never reach storage, a cookie or the DOM),
  `reconnect.spec.ts` (`TC-ROOM-046`: a guest that reloads inside the grace window keeps its seat and team).
- **Fixed** route focus on the two lazy routes. `useRouteFocus()` looked for `#main h1` once, 50 ms after the
  navigation; `/sign-in` and `/match/:code` commit their chunk later, so focus stayed on the control the navigation had
  already removed (`US-PWA-004` AC7). The attempt now repeats inside a 2 s budget.
- **Fixed** `/profile` for a guest: it rendered a prompt with a sign-in link, while `screens/profile.md` and
  `TC-AUTH-143` promise a redirect. It now redirects.
- **Changed** `TC-PWA-131`/`TC-PWA-190` and the `02-reference` oracle rows to the criterion the stories actually state
  (focus moves to the route's `h1`; the "returns to the invoking control on back" clause was in no acceptance criterion
  and in no code).
- **Fixed** `tests/e2e/routes.spec.ts`: "renders without the error boundary" asserted `role="alert"` was absent, but a
  screen's own error banner carries that role too, so the case failed on `/leaderboard` whenever the API answered slowly
  under CI load. It now asserts the boundary's own marker (`.screen--error`).
- **Note** `tests/e2e/prod-smoke.spec.ts` left the oracle set for `deployment.md` § post-deploy: a check against a
  deployed environment is a release-stage check (`cpt-release` RR7), not a design oracle.
- **Note** one gap stays on the record in `05-quality/test-plan-status.md` § 3: a route whose session could not be
  minted renders no `h1`, so the heading rule does not hold on that failure path.

## 2026-11-08 — the records match the tree, and the payload has a ratchet

- **Fixed** the red Playwright job: `tests/e2e/pwa-offline.spec.ts` asserted the menu's offline sentence against the
  leaderboard banner, which `e2e8d08` had moved to `leaderboard.offline` (`02-reference/screens/leaderboard.md` § Offline).
- **Added** `pnpm budget` (`scripts/bundle-budget.mjs` + `scripts/bundle-budget.json`, and a CI step) — the gzip weight
  of every web chunk is a ratchet behind `NFR-03`: a bucket may only grow when its number is raised in the same change,
  and a chunk that matches no bucket fails the check.
- **Changed** `tests/meta/traceability-baseline.txt` from 72 to 292: the floor now sits where automated coverage
  actually is (292 of 354 documented cases), so a regression is caught instead of tolerated.
- **Fixed** 15 oracle rows in `02-reference/` and `01-overview/` that named Playwright specs which do not exist — each
  now names the file that covers the case, or says `— planned, see 05-quality/test-plan-status.md`.
- **Fixed** the retired test layout in 12 story lines and 4 spec headers (`tests/core/…`, `tests/web/…`,
  `tests/worker/…` → the package paths) and three story filenames cited from spec headers.
- **Changed** `05-quality/test-plan-status.md` and `environment-setup.md` § 6 to the measured numbers (123 files /
  1036 cases, 16 specs / 62 cases), and `test-plan-status.md` § 3 now names the `done` stories whose oracle is still
  planned instead of leaving the gap implicit.
- **Note** the independent review of this pass is [`06-reports/2026-11-08-independent-review.md`](06-reports/2026-11-08-independent-review.md).

## 2026-11-05 — joinable rooms, verified realtime path, ground-anchored camera

- **Added** `POST /api/v1/rooms/{code}/join` — without it a second player had no way into an existing room
  (`docs/02-reference/api/rooms.md`).
- **Changed** WebSocket authentication: the socket carries no bearer header (a browser cannot set one), so the
  Durable Object verifies the session token from the first `auth` frame and binds the socket to that subject
  (`docs/02-reference/api/signaling.md`).
- **Changed** the default camera framing follows the active mobile with its feet ~70 % down the frame, instead of
  centring on the map (`docs/02-reference/gameplay/tunables.md` § camera).
- **Fixed** a practice match that could end on the first turn (it had no opponent seat), the guest-seat identity clash
  that made the bot play the player's turn, the stale power ring after a release, and two un-interpolated copy strings
  on the results and waiting banners.
- **Verified** the room protocol end to end against a real Durable Object: join, team assignment, `match_started`
  with seed and assignments, snapshot relay, host migration to generation 2.
- **Note** local development now requires `apps/worker/.dev.vars` with `SESSION_TOKEN_SECRET`
  (`docs/01-overview/environment-setup.md` § 3).

## 2026-11-05 — implementation wave — the backlog is built

- **All 53 stories implemented** as a single delivery wave (client request "ship all"): engine, worker API, Durable
  Object room, React shell, Phaser 4 scene, WebRTC mesh, PWA, D1 schema.
- New code: `packages/core/src` (20 modules), `apps/worker` (12 endpoints + `Room` Durable Object + 4 migrations),
  `apps/web` (7 routes, vi/en tables, scene, camera, HUD, mesh, PWA), `tests/e2e` (3 Playwright specs).
- **100 automated tests** green (`npx vitest run`), `tsc -b` and `eslint .` clean, `pnpm build` green with a 1.86 MB
  precache and a first load of 470 kB; Clerk is isolated to the entry and sign-in chunks (`TC-PWA-139`).
- `tests/meta/traceability.test.ts` added: no test may cite an undocumented case id, and documented coverage may not
  fall below the committed baseline (now **72 of 162** cases automated).
- Story frontmatter stays `ready`: `rule 03` forbids `done` without per-criterion evidence, and the browser,
  Clerk, deployment and load checks cannot run here. Each story carries a "Delivery status — 2026-11-05" note naming
  exactly what is implemented and what remains.
- New report `06-reports/2026-11-05-implementation-status.md` records the verification actually performed.
- Doc corrections in the same wave: `tunables.md` § 3 `turnDurationMs` 30 000 → 20 000, § 1.1 speed law blockquote now
  `speedK 4.55`, § 4.3 family names de-branded, § 6 map line points at `maps.ts` with `gravityModifier`; `mobiles.md`,
  `items.md` and the two CORE stories now cite `packages/core/src/data/*.ts`; `signaling.md` documents that
  `projectiles[]` is normally empty because a shot resolves at fire time.
- `eslint.config.mjs` added with a documented deviation: only `rules-of-hooks` and `exhaustive-deps` are enabled.

## 2026-11-05 — CR-2026-11-05-no-decompile — the decompilation leaves the basis

- **No decompilation is part of the basis** [user, 2026-11-05]: nothing is read, cited or required from another
  product's code, binaries or data files (`OQ-18` answered, `CR-2026-11-05-no-decompile`).
- All **34 `[gb: …]` citation tags** removed from 16 docs; the repository links in earlier changelog and change-request
  entries are excised (the entries stay as history).
- `02-reference/gameplay/reference-gunbound.md` rewritten as **genre rules we adopt** — no addresses, opcodes, file names
  or third-party attribution; § 10 now states the physics model we chose and § 11 maps each rule to its story and oracle.
- `tunables.md` and `mobiles.md` phrasing: "recovered from …" → **"our model"**, the 50 ms step is justified by
  determinism (`NFR-28`) rather than by another engine's tick, § 4.3 became "four parameter families" (ours).
- `ADR-0005` Context rewritten: no published specification exists, `OQ-18` and this CR are the legal position, and the
  brief's own formula pair (`force × 512/100` with `gravity 0.35`) is internally inconsistent — which is why the
eight-point calibration, not imitation, sets the numbers.
- `US-OPS-004` **unblocked** (`ready`, no open questions): the release record states the game is an original
  implementation of genre conventions. Backlog 53 stories, **0 blocked**.
- No number changes: every value in `tunables.md`, `mobiles.md` and `items.md` is unchanged, so no test case or
  acceptance threshold moves.

## 2026-11-05 — CR-2026-11-05-turn-clock-and-weather — 20 s turns, weather per round, 12-sector wind dial

- **Turn clock 30 s → 20 s** (`turnDurationMs = 20000`, `OQ-03`); the 20 s grace extension is unchanged.
- **Wind is polar**: `{ magnitude 0–26, directionDeg = sector × 30, sector 0–11 }` replaces `{ x, y }` on `−10…+10`
  (`OQ-41`). `windCoefficient` 110 → **42** so the maximum push is unchanged: full wind still moves a mid-mass shot ~129
  units (one ruler division at the default window).
- **Weather re-rolls once per round** — `turn.round` increments when the delay queue wraps, the host rolls
  `magnitude`/`sector` deterministically from the match seed, and `weather { wind, rolledAtRound }` is broadcast and carried
  in every snapshot of the round. Constant within a round, announced once.
- **Wind dial** in the HUD: 12 ticks of 30° (long ticks at the cardinals), arrow at `directionDeg`, whole-number magnitude
  0–26, `0` drawn as a hollow grey dial, plus a 1.5 s `match.weather.changed` banner (`TC-MATCH-923`).
- Snapshot and `RoomState` gained `turn.round` and `weather`; `wind` is gone from the wire.
- New story `US-CORE-015` (weather per round); `US-CORE-001/002`, `US-MATCH-002/003` edited in place. Backlog 52 → 53
  stories, 113.5 → 114.5 story-days, W3 17 → 18; milestones unchanged.
- Docs: `tunables.md` § 1.1 (polar wind, recalibration), § 1.2 (+`windMagnitude`, `windSectors`, `turnDurationMs`,
  `weatherRerollPerRound`; stale `density` row removed), **new § 1.3** (weather rules), `screens/match.md`,
  `workflow-state-machine.md`, glossary (+Round, Weather, Sector).

## 2026-11-04 — CR-2026-11-04-touch-only-viewport — fullscreen, zoomable window, ruler, no joystick

- **Fullscreen landscape** on the first tap (`OQ-39`); iPhone Safari falls back to a viewport-filling layout with
  safe-area insets, still without the `apple-mobile-web-app-capable` meta.
- **Camera window** replaces the whole-map view: default **1000 × 600 units** (½ map each way), pinch down to 250 × 150 and
  out to the whole map, two-finger pan clamped to the map bounds; the camera is per client and never crosses the wire.
- **Ruler** on the bottom edge: `segments = clamp(round(8 × visibleWidth / 1000), 8, 16)` — 8 divisions at the default
  window, 16 at whole-map zoom, each labelled with its world width (`TC-MATCH-920`).
- **Joystick removed** (`OQ-40`). One finger pulls power, two fingers pan, pinch zooms; a two-finger gesture cancels the
  pull without firing.
- **Power ring** around the mobile: gradient arc, numeric `0.0–4.0` inside (GunBound's power bar), `force = power × 25`;
  release fires above a **0.3** dead zone (`OQ-38`), `TC-MATCH-915/916`.
- **Four-way pad** anchored to the mobile on your turn: ◀ ▶ move, ▲ ▼ angle (±1°/tap, 10°/s held, clamped to the mobile's
  own window), badges show the remaining moves (`TC-MATCH-907/917`).
- New story `US-MATCH-007` (camera, zoom, ruler, fullscreen, M); `US-MATCH-002` and `US-MATCH-006` rewritten in place.
  Backlog 51 → 52 stories, 111 → 113.5 story-days, W3 14.5 → 17; milestones unchanged.
- Docs: `screens/match.md` (Layout/Camera/Ruler/Fields/Controls), `tunables.md` § 9 (camera and power constants),
  `conventions.md` § 7, glossary (+5 terms), `project-overview.md` key numbers.

## 2026-11-04 — CR-2026-11-04-gb-constant-acceleration — constant-acceleration model replaces the first integrator

- Reference: an open-source trajectory fit for the genre (**removed from the project's basis on 2026-11-05** — see
  `CR-2026-11-05-no-decompile`). It shows
  a **pure constant-acceleration parabola with no drag**, per-mobile `gravity` (`0.433–0.9295`) and `mass` (`90–169`), wind
  acceleration `÷ mass` with a vertical term, and one power law for every mobile (`0%–100% → 0…4.0 parts/tick`).
- `tunables.md` § 1.1 rewritten to that structure, with the GB→ours unit mapping table (`1 part = 100 px`, power bar,
  `g`, `mass`) and a new § 4.4 listing the four parameter families and their
  constants.
- **Removed** `density` (per weapon) and `dragK`: GB has no drag, so shell weight is now the **mobile's `mass`**
  (`TC-CORE-925`). **Added** per-mobile `gravity` 84–128 u/s² and `mass` 118–169, and a vertical wind term
  `a_y = −gravity + 110 × wind.y / mass`.
- One launch law for the whole roster (`speedK = 4.55`); trajectory profiles now set only the **aim band**. Calibration:
  force 98 at 45° → **1,988 units in 6.3 s**; drift 121–191 units at wind +10 rises with low `mass`.
- `data/mobiles.md` gained `gravity`/`mass` columns and a re-simulated trajectory table (reach 1,441–2,162 units);
  `reference-gunbound.md` gained § 10 with the equations and constants; `ADR-0005` and `OQ-37` updated.
- `US-CORE-001` / `US-CORE-007` contracts updated (`Weapon` loses `density`, `Mobile` gains `gravity`/`mass`);
  `TC-CORE-020/023/024/924` re-scaled, `TC-CORE-925` added. No story or schedule change (111 story-days).

## 2026-11-04 — CR-2026-11-04-per-mobile-aim-and-movement — own angle window and own movement per mobile

- Every mobile now declares its **own `angleMin`/`angleMax`** inside its trajectory profile's band; the clamp uses the
  mobile's window (`TC-CORE-022`).
- Movement is per mobile and per turn: `moveDistance` 60–110 px, `maxMovesPerTurn` 1–2, `runMultiplier` 1.5–1.9,
  `moveEnergy` 8–14 (double for a run), `moveDelay` +8…+14, `maxIncline` 22–44° — model written out in
  `tunables.md` § 4.3 with GB's move action `0xc304` cited (`TC-CORE-904`).
- `data/mobiles.md` gained an aim-and-movement table and per-mobile firing angles in the flight sample.
- No story or schedule change (111 story-days).

## 2026-11-04 — CR-2026-11-04-hp-scale-and-per-mobile-ballistics — 1,000-scale health, per-mobile ballistics

- HP re-scaled to **900–1,200** (shield 0–300, regen 0–40, Inner-hit damage 180–580), matching the visual size of
  GunBound's health bars; blast gimmicks and avatar numbers rescaled to match.
- Integrator now runs a fixed **50 ms** tick, written out as explicit equations in
  `02-reference/gameplay/tunables.md` § 1.1 (launch, wind, drag, impact, blast rings, shield absorption) with a
  calibration point: force 100 at 45° → **1,854 units in 6.6 s**.
- **Five trajectory profiles** (`standard`, `direct`, `lobber`, `mortar`, `skimmer`) fix each mobile's launch law and
  angle envelope; **per-weapon `density` 0.80–1.40** makes shell weight divide wind push and drag, so heavy shells drift
  less and fly further.
- `02-reference/data/mobiles.md` § 3 prints the simulated range and hang time for all twenty mobiles,
  `TC-CORE-924` asserts it; `TC-CORE-020/023/026/903/905` re-scaled.
- Source inconsistency recorded, not hidden: `gravity 0.35` cannot coexist with `force × 512/100` on a 2,000-unit map
  (`tunables.md` § 1.1), so gravity is re-expressed in `u/s²`.
- No story or schedule change (111 story-days).

## 2026-11-04 — CR-2026-11-04-twenty-mobiles — twenty original mobiles

- Roster 8 → **20** mobiles: English names, ten archetypes × 2, each echoing a real-world mythical beast, with an art
  brief (silhouette hook, three-value palette, both team tints) — `docs/02-reference/data/mobiles.md`.
- Every mobile has a unique weapon-class triple and exactly two mobiles per archetype; the pair sits within **±10 %**
  of itself on damage per delay, with a deliberate cross-archetype spread of 0.21–0.32 (`TC-CORE-923`); balance moved
  out of code into `mobiles.json` + `mobiles.balance.csv` (`NFR-29`).
- Mobile selection added to the lobby (`US-ROOM-007` AC7, `TC-ROOM-153`); duplicates allowed.
- No story, dependency or schedule change (111 story-days), because `US-CORE-007` and `US-ROOM-007` already own the
  loader and the loadout step.

## 2026-11-04 — CR-2026-11-04-gb-gameplay-fidelity — GunBound rule set and physics replica

- Approved option **B — full GunBound**: delay turn queue, three weapon slots, HP + shield + regen + defense,
  Inner/Mid/Outer blast tiers, movement with energy, eleven items, four modes, eight stage gimmicks, eleven maps, avatar
  stat bonuses, and a GunBound-shaped physics replica in `packages/core` (`ADR-0005`).
- New reference layer: `docs/02-reference/gameplay/{reference-gunbound,tunables}.md`,
  `docs/02-reference/data/{mobiles,items}.md`.
- Backlog 40 → **51 stories**, 79 → **111 story-days**; `M2` week 11, `M3` week 17.
- `US-CORE-001…005` rewritten; `US-CORE-006…013` added; `US-MATCH-005`, `US-MATCH-006`, `US-ROOM-007` added;
  `US-ROOM-001`, `US-MATCH-002`, `US-MATCH-003` extended.
- `OQ-19` answered, `OQ-36` answered (option B), `OQ-37` raised and answered (fidelity limit).
- `NFR-28` (determinism) and `NFR-29` (combat data is data) added; test cases 120 → 146.
- Gate `G1` re-opened (match rules changed).
