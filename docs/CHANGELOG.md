# Changelog

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
