# Test cases

Which of these cases has a test file today, and which file each planned one lands in:
[`test-plan-status.md`](test-plan-status.md).

One table per epic. Every case has an id `TC-<epic code>-<nnn>`, the story that owns it, the criterion it proves, a
level, and the file that runs it. `unit` = Vitest on `packages/core`; `worker` = Vitest with miniflare; `web` = Vitest +
RTL; `e2e` = Playwright (two contexts where two players are needed); `manual` = the two-phone matrix, evidenced in the
release record.

The `covers` column names the requirement ([nonfunctional-requirements.md](../01-overview/nonfunctional-requirements.md)
`NFR-…`), the functional item from the brief (`FR-…`), an ADR, or an open question id whose assumption the case pins.

## Foundation (FND)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-FND-001 | US-FND-002 | `GET /api/v1/health` on a fresh worker | `200 {"status":"ok","version":"<sha>"}` | worker | operational — see `08-ops/slo.md` |
| TC-FND-002 | US-FND-001 | Every env var the code reads has a row in `apps/worker/.dev.vars.example` or `apps/web/.env.example`, and no row holds a secret | Names match the code; the only values allowed are public defaults (`VITE_API_BASE=/api/v1`) | worker | NFR-12 |
| TC-FND-012 | US-FND-001 | Built web assets scanned for secret values | No match for `SESSION_TOKEN_SECRET`, `TURN_KEY_API_TOKEN` | web | NFR-12 |
| TC-FND-018 | US-FND-001 | `packages/core` imports no DOM, Phaser or network module | Static import scan is empty | unit | NFR-22 |
| TC-FND-070 | US-FND-002 | Response shapes for all endpoints | Match `openapi.yaml` (schemathesis or explicit fixtures) | worker | `api/README.md` |
| TC-FND-100 | US-FND-002 | Migrations apply to an empty D1 | Schema equals `data/README.md` | worker | ADR-0003 |
| TC-FND-901 | US-FND-004 | Open a pull request touching `apps/web` | Pages preview + `-preview` worker URLs and the commit sha appear in the PR comment | manual | NFR-13 (deploy hygiene) |
| TC-FND-902 | US-FND-004 | Rehearse the documented rollback on preview | Previous worker and Pages build serve again within 5 min; `/health` reports the previous sha | manual | deployment.md |

## Accounts (AUTH)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-AUTH-057 | US-AUTH-001 | Session token used after 60 min | `401 unauthenticated`; client refreshes at 55 min | worker | OQ-27 |
| TC-AUTH-065 | US-AUTH-001 | Guest calls `/me`, `start_match`, `team_assign` | `401`/`403`, room state unaffected | worker | NFR-11 |
| TC-AUTH-074 | US-AUTH-001 | `POST /sessions` as guest and as registered | Correct `subject.kind`, 60-min expiry, `wsUrl` present | worker | FR-01 |
| TC-AUTH-135 | US-AUTH-001 | Guest path from the main menu | No sign-in prompt, room created | e2e | roles |
| TC-AUTH-137 | US-AUTH-002 | Guest escape from the sign-in screen | Returns to `/` without an error | e2e | roles |
| TC-AUTH-138 | US-AUTH-002 | `returnTo=https://evil.example` on sign-in | Ignored; lands on `/` | e2e | NFR-11 |
| TC-AUTH-101 | US-AUTH-003 | Duplicate `display_name_key` after normalisation | `409 display-name-taken`, previous value kept | worker | `data/accounts.md` |
| TC-AUTH-102 | US-AUTH-003 | Display name of 1 or 17 characters, or unknown avatar | `422 validation_failed` naming the field | worker | `data/accounts.md` |
| TC-AUTH-140 | US-AUTH-003 | Profile name saved, then a `409` | Optimistic value reverts with an inline field error | e2e | `data/accounts.md` |
| TC-AUTH-143 | US-AUTH-003 | Guest opens `/profile` | Redirect to `/sign-in` | e2e | roles |
| TC-AUTH-069 | US-AUTH-004 | `DELETE /me` during a live room | `409`, nothing deleted | worker | NFR-13 |
| TC-AUTH-075 | US-AUTH-004 | Any response for another account | Contains no `accountId`/`guestId`/email | worker | NFR-13 |
| TC-AUTH-103 | US-AUTH-004 | Delete an account, then run the purge | Rows anonymised, Clerk user deleted, `rating_history` kept | worker | NFR-13 |
| TC-AUTH-104 | US-CORE-013 | Equipped avatar part the account no longer owns | Stripped server-side at loadout validation, bonus not applied | worker | NFR-11 |
| TC-AUTH-142 | US-AUTH-004 | Delete flow on the profile screen | Typed confirmation → signed out, redirect, no further access | e2e | NFR-13 |

## Rooms (ROOM)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-ROOM-071 | US-ROOM-001 | `POST /rooms` with `maxPlayers: 3` | `422 validation_failed` | worker | FR-01 |
| TC-ROOM-072 | US-ROOM-001 | 11 rooms created in one minute from one IP | The 11th is `429`, the first 10 succeed | worker | NFR-25 |
| TC-ROOM-073 | US-ROOM-001 | `GET /rooms/{code}` for a closed room | `410 room-closed` | worker | FR-01 |
| TC-ROOM-120 | US-ROOM-001 | Room code format and collision retry | Matches `^[A-HJ-NP-Z2-9]{6}$`, retried on collision, no duplicate room | worker | FR-01 |
| TC-ROOM-133 | US-ROOM-001 | Room-code input | Rejects `I`, `O`, `1`, `0`; enables join at 6 characters | e2e | FR-01 |
| TC-ROOM-134 | US-ROOM-001 | Create vs join from the main menu | Host lands in the lobby with a copy control, peer joins the same room | e2e | FR-01 |
| TC-ROOM-136 | US-ROOM-001 | Join a 404/410 code | Banner shown, stays on `/` | e2e | FR-01 |
| TC-ROOM-150 | US-ROOM-001 | Copy-code control | Clipboard equals the code | e2e | `screens/lobby.md` |
| TC-ROOM-151 | US-ROOM-007 | Host selects mode, map and capacity; a non-host tries | Host writes, member is rejected, loadout caps at 11 items across two pages | e2e | `screens/lobby.md` |
| TC-ROOM-153 | US-ROOM-007 | Two players pick the same mobile, then a guest picks one | Both are accepted in the same match, every mobile appears once in the grid, the choice survives reconnect | e2e | `data/mobiles.md` |
| TC-ROOM-123 | US-ROOM-001 | Idle room for 10 minutes | Storage deleted, code reusable after 60 s | worker | `data/room-state.md` |
| TC-ROOM-121 | US-ROOM-002 | `auth` after 5 s, or a bad token | Close `4401`; no member created | worker | `api/signaling.md` |
| TC-ROOM-122 | US-ROOM-002 | Ninth join to an 8-slot room | Close `4409`, roster unchanged | worker | FR-01 |
| TC-ROOM-126 | US-ROOM-002 | Any message before `auth` | Close `4401` | worker | `api/signaling.md` |
| TC-ROOM-127 | US-ROOM-002 | Ping/pong liveness | Three missed pings → `connectionState: "grace"` | worker | NFR-07 |
| TC-ROOM-128 | US-ROOM-002 | `leave` then rejoin in `lobby` | Slot reused, no duplicate member | worker | `data/room-state.md` |
| TC-ROOM-068 | US-ROOM-002 | Second socket for the same subject | Replaces the first, no duplicate member | worker | NFR-07 |
| TC-ROOM-147 | US-ROOM-002 | Two contexts in the same room | Identical roster, slots and teams | e2e | FR-01 |
| TC-ROOM-066 | US-ROOM-003 | Non-host sends `start_match` or `team_assign` | `error not-host`, roster unchanged | worker | NFR-11 |
| TC-ROOM-148 | US-ROOM-003 | Start gating | Disabled until every slot is filled, teams equal and non-empty | e2e | `workflow-state-machine.md` |
| TC-ROOM-162 | US-ROOM-003 | Illegal state transitions in `playing`/`ended` | Rejected with no side effects | worker | `workflow-state-machine.md` |
| TC-ROOM-164 | US-ROOM-003 | `start_match` in a lobby that is not full | `room-not-full` | worker | `workflow-state-machine.md` |
| TC-ROOM-165 | US-ROOM-003 | `start_match` with unbalanced teams | `teams-not-balanced` | worker | `workflow-state-machine.md` |
| TC-ROOM-166 | US-ROOM-003 | `match_started` after a host start | Carries the chosen mode, map and each assignment's loadout | worker | `api/signaling.md` § 3 |
| TC-ROOM-163 | US-NET-004 | Every documented client frame, and one field the frame does not document | Each documented frame parses; an unknown `t` is `unsupported-message`; an undocumented field is `bad-request` naming it; an 8 KB sdp is `payload-too-large` | unit | `api/signaling.md` § 2 |
| TC-ROOM-167 | US-ROOM-007 | A lobby loadout of eleven items, then a twelfth | Eleven are kept and the twelfth is refused | worker | `data/items.md` |
| TC-ROOM-046 | US-ROOM-004 | Reconnect within the 20 s grace | Slot, team and HP restored from `lastSnapshot` | e2e | NFR-07 |
| TC-ROOM-047 | US-ROOM-004 | Grace countdown on the match screen | Overlay counts 20 → 0, then `disconnected` | e2e | NFR-07 |
| TC-ROOM-055 | US-ROOM-004 | Kill one peer during a 2v2 | The other three keep playing; the match completes | e2e | NFR-08 |
| TC-ROOM-056 | US-ROOM-004 | One player reconnects mid-match | Their view matches the host's state (HP, turn, wind) | e2e | NFR-07 |
| TC-ROOM-059 | US-ROOM-004 | Forfeit rules | Loss only when every member of a team is `disconnected` | worker | NFR-07 |
| TC-ROOM-048 | US-ROOM-005 | Host socket dies in `playing` | Longest-connected peer becomes host, `hostGeneration` +1 | worker | NFR-06 |
| TC-ROOM-049 | US-ROOM-005 | Migration end to end | Playable again ≤ 5 s from the failure | e2e | NFR-06 |
| TC-ROOM-124 | US-ROOM-005 | `snapshot_push` above 8 KB | Rejected, previous snapshot kept | worker | NFR-04 |
| TC-ROOM-149 | US-ROOM-005 | Host leaves the lobby | Banner shown, earliest joiner promoted | e2e | NFR-06 |
| TC-ROOM-050 | US-ROOM-006 | Signaling relay | SDP passed through byte-identical, never stored | worker | NFR-09 |
| TC-ROOM-051 | US-ROOM-006 | `GET /turn-credentials` | Two servers, `ttlSeconds: 3600`, nothing logged | worker | NFR-10 |
| TC-ROOM-052 | US-ROOM-006 | Client storage after a match | No ICE credential or TURN token in `localStorage`/`sessionStorage` | e2e | NFR-10 |
| TC-ROOM-125 | US-ROOM-006 | `signal` over 8 KB or to a non-member | Error, nothing relayed | worker | NFR-09 |

## Match core (CORE)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-CORE-011 | US-CORE-001 | Two tunables files produce different trajectories | Trajectories differ; a recorded match carries its `rulesetVersion` | unit | NFR-23 |
| TC-CORE-020 | US-CORE-001 | `mbl-01` shot 1 at 45°, force 98, no wind | Lands at 1,988 units after 6.3 s, each position inside the golden-sample ±0.5 units band; gravity 100 u/s² adds exactly 5 u/s per step | unit | FR-04 |
| TC-CORE-021 | US-CORE-001 | Wind +max pushes the projectile downwind | Δx increases monotonically with wind | unit | FR-04 |
| TC-CORE-022 | US-CORE-001 | Force and angle out of the mobile's own window (`mbl-05` 25°, `mbl-15` 50°, `mbl-13` −18°) | Clamped to that mobile's `angleMin…angleMax` and `0…maxPower`, never `NaN`, and two mobiles with the same profile clamp differently | unit | FR-03 |
| TC-CORE-023 | US-CORE-001 | Same shot in calm, in wind +26 and in wind −26, on `mbl-01` (`mass 168`) | Landing drift equals `½ · (windCoefficient × magnitude / mass) · t²` with `windCoefficient = 42` (`tunables.md` § 1.3) within 2 %, is linear in `magnitude`, reverses sign with the wind, and a vertical component changes effective gravity (`a_y = −g + 42 × wind.y / mass`) | unit | FR-04 |
| TC-CORE-024 | US-CORE-003 | Blast at Inner, Mid and Outer radii | Three distinct damage tiers, 0 beyond the radius | unit | FR-06 |
| TC-CORE-025 | US-CORE-003 | HP would go below zero | HP floored at 0, player marked `eliminated` | unit | FR-06 |
| TC-CORE-026 | US-CORE-003 | Target with `defense 1.15` takes an Inner hit of 500 | Damage is divided by `defense` and rounded: 435 | unit | FR-06 |
| TC-CORE-027 | US-CORE-003 | Blast hits a teammate; last player of a team reaches 0 | Friendly fire damages; match ends with the other team as winner | unit | OQ-02 |
| TC-CORE-028 | US-CORE-001 | Same seed and inputs twice | Identical state hash after 200 steps | unit | NFR-22 |
| TC-CORE-029 | US-CORE-001 | Projectile leaves `mapBounds` and never lands | Turn resolves as a miss after `maxFlightMs`, no error | unit | FR-04 |
| TC-CORE-040 | US-CORE-004 | Apply the same snapshot twice | Second apply is a no-op; key order and rounding stable | unit | FR-05 |
| TC-CORE-041 | US-CORE-004 | Encode 8 players in Jewel mode with 6 jewels; then the same match with `includeTerrain` | ≤ 800 bytes and no mask by default, decodes identically; the mask-bearing frame is larger but ≤ 8 KB and its heights decode to a tenth of a unit | unit | NFR-04 |
| TC-CORE-042 | US-CORE-004 | Snapshot with an older `seq` or a stale `hostGeneration` | Ignored, state unchanged | unit | FR-05 |
| TC-CORE-045 | US-CORE-002 | Two fire inputs for one turn with different `seq` | Last `seq` wins, one shot simulated | unit | FR-05 |
| TC-CORE-152 | US-CORE-002 | Turn clock | 20 s, skips on timeout, drift ≤ 1 s | unit | OQ-03 |
| TC-CORE-901 | US-CORE-002 | Four players, equal base delay, then a super shot | Order follows accumulated delay, ties by slot, super shot pushes the shooter back; item and move costs included | unit | FR-02 |
| TC-CORE-902 | US-CORE-005 | Bot's turn starts with three weapons | Fires within 3 s, picks the best simulated weapon, deterministic per seed | unit | NFR-21 |
| TC-CORE-903 | US-CORE-003 | Target with shield 300, hp 1,200, defense 1.15 takes an Inner hit of 500 | Total 435: shield absorbs 300, HP loses 135, shield never goes negative | unit | FR-06 |
| TC-CORE-904 | US-CORE-008 | `mbl-01` walks once then tries twice; `mbl-13` walks twice and runs; one climbs too steep a slope | Energy debited by `moveEnergy` (double for a run), queue by `moveDelay`, distance is the mobile's own `moveDistance`, action count capped at `maxMovesPerTurn`, movement stops at `maxIncline` and at the map bound | unit | FR-03 |
| TC-CORE-905 | US-CORE-007 | Load the twenty mobile records | Schema valid (`gravity 84–128`, `mass 118–169`, `maxHp 900–1200`, `maxShield 0–300`, `power 180–580`, no `density` on a weapon, `trajectory` one of five profiles, `angleMin < angleMax` inside its profile band, `maxMovesPerTurn` 1–2, `moveDistance` 60–110, `moveEnergy` 8–14, `moveDelay` 8–14, `runMultiplier` 1.5–1.9), regen capped at `maxShield`, an out-of-band value rejected | unit | FR-06 |
| TC-CORE-906 | US-CORE-009 | Dual, Blood and Power up | Dual allows a second shot, Blood adds 25 % for one shot, Power up raises the force cap | unit | FR-06 |
| TC-CORE-907 | US-CORE-009 | Energy up 1 and Energy up 2 | Budget +30 / +60 for the turn, delay charged | unit | FR-03 |
| TC-CORE-908 | US-CORE-009 | Change Wind | Wind re-rolled, announced, present in the next snapshot | unit | FR-04 |
| TC-CORE-909 | US-CORE-009 | Teleport and Team Teleport | Caster or whole living team moves; never into terrain | unit | FR-03 |
| TC-CORE-910 | US-CORE-009 | Bunge shot | Projectile returns toward the caster and detonates on the way back | unit | FR-04 |
| TC-CORE-911 | US-CORE-009 | Thunder | A horizontal band at the aim point is struck for the listed damage | unit | FR-06 |
| TC-CORE-912 | US-CORE-007 | Fire `arc`, `flat`, `lob`, `beam`, `cluster` and `piercing` | Each class shows its documented shape; beam resolves instantly; cluster splits into 3 | unit | FR-04 |
| TC-CORE-913 | US-CORE-001 | `bounce` on flat terrain, `piercing` through a hill, `return` off the map | Bounce detonates within 3 bounces at 0.6 restitution; piercing ignores terrain; return comes back once | unit | FR-04 |
| TC-CORE-914 | US-CORE-006 | Blast radius 80 on the mask | Crater of 0.6×80 carved, units regrounded, mask identical on host and peer | unit | FR-06 |
| TC-CORE-915 | US-CORE-010 | Score mode reaches the 12-turn cap | Higher damage total wins | unit | FR-06 |
| TC-CORE-916 | US-CORE-010 | Tag mode, a team finishes its whole turn | `activeTeam` flips and the opposing team acts | unit | FR-02 |
| TC-CORE-917 | US-CORE-010 | Jewel mode: walk over a jewel, then kill a carrier | Jewel carried, then transferred to the killer's team; all jewels ends the match | unit | FR-06 |
| TC-CORE-918 | US-CORE-011 | Map with `force`, map with `gust` | Constant sideways push; 4× wind spike for one turn, announced and reverted | unit | FR-04 |
| TC-CORE-919 | US-CORE-011 | Map with `electric`, `heal` and a tornado | Strike on every third turn for 15; heal zone +10 capped; tornado displaces 60 px without burying | unit | NFR-21 |
| TC-CORE-920 | US-CORE-012 | Load the eleven maps | Schema valid, spawns valid for 8 slots, terrain RLE expands | unit | FR-04 |
| TC-CORE-921 | US-CORE-013 | Profile with +4 attack, another with +20 | First is ×1.04, second clamps at ×1.10; energy and delay caps hold | unit | FR-06 |
| TC-CORE-922 | US-CORE-007 | Super shot used once | Slot 2 reports empty afterwards and cannot be selected | unit | FR-04 |
| TC-CORE-923 | US-CORE-007 | Balance report over all twenty mobiles | Every archetype has exactly two mobiles, the two sit within ±10 % of each other on damage per delay, the roster spread is printed, report regenerates from the CSV | unit | `data/mobiles.md` § 5 |
| TC-CORE-924 | US-CORE-007 | Every mobile fires at its `maxPower` on a flat probe map | Landing distance and hang time match `data/mobiles.md` § 4 within ±1 unit (`mbl-14` 2,058 vs `mbl-03` 1,433, first ground contact), each mobile keeps its own arc at identical power, and a heavier mobile drifts less under wind | unit | FR-04 |
| TC-CORE-925 | US-CORE-007 | `mbl-13` (`mass 118`, `g 84`) and `mbl-03` (`mass 169`, `g 118`) fire the same angle and force | The light/weak-gravity mobile lands further and drifts more under identical wind; swapping their `mass` values swaps the behaviour, proving `mass` is the only wind term | unit | FR-04 |
| TC-CORE-926 | US-CORE-015 | Roll the weather across four rounds with a fixed seed | `turn.round` increments on queue wrap; `magnitude` 0–26 and `sector` 0–11 each roll; wind constant inside a round; same seed replays the same sequence | unit | FR-04 |
| TC-CORE-927 | US-CORE-005 | A bot holding Power up, its best raw shot landing more than the item can fix | It sends the `item` input before the shot, one item only, and pays the item's `delayCost` | unit | NFR-21 |
| TC-CORE-928 | US-CORE-015 | An eight-player mid-round snapshot after a wind roll | The weather rides in the snapshot (`magnitude`, `sector`, `rolledAtRound`), decodes identically, and the state snapshot stays ≤ 800 bytes | unit | FR-04 |
| TC-CORE-929 | US-CORE-013 | A guest with no avatar equipped | No bonus is applied and the match is still playable | unit | FR-06 |
| TC-CORE-930 | US-CORE-013 | An avatar part the profile does not own, or a retired one | It contributes no bonus, and the rest of the profile still applies | unit | NFR-11 |
| TC-CORE-931 | US-CORE-011 | The fog gimmick on a flat map | The visible window halves and the battle state is untouched | unit | `tunables.md` § 6 |
| TC-CORE-932 | US-CORE-009 | An item the player does not own | Rejected without charging the item's delay | unit | `data/items.md` |

## Netplay (NET)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-NET-901 | US-NET-001 | Host opens a peer connection | Exactly two channels: `control` ordered/reliable, `state` unordered with `maxRetransmits: 0` | e2e | ADR-0004 |
| TC-NET-902 | US-NET-002 | Host streams state for one round | A snapshot every 100 ms while a turn is live and every 500 ms when idle; a peer buffering more than 64 KB is skipped; a silent peer for 2 s is reported | e2e | FR-05 |
| TC-NET-903 | US-NET-003 | New host adopts the previous snapshot | `acceptSnapshot` refuses an older `hostGeneration` and a stale `seq`; an accepted snapshot restores players, weather and the turn clock; a snapshot that no longer fits the budget is rejected, not truncated | unit | FR-06 |
| TC-NET-044 | US-NET-004 | Peer sends `snapshot_push` while not host | `error not-host`, `lastSnapshot` unchanged | worker | ADR-0004 |
| TC-NET-067 | US-NET-004 | Fire from a non-active slot | Ignored + `error unsupported-message` | worker | FR-02 |

## Match UI (MATCH)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-MATCH-901 | US-MATCH-001 | Mount the scene with a state | Map, units and turn indicator drawn; no unit jumps backwards between snapshots | e2e | NFR-01 |
| TC-MATCH-151 | US-MATCH-002 | Drag aim and release | One `fire`, angle/force within ±2° / ±3 of the drawn values | e2e | FR-03 |
| TC-MATCH-902 | US-MATCH-002 | A second finger lands mid-pull | The pull is cancelled without firing and the camera gesture takes over | web | FR-03 |
| TC-MATCH-903 | US-MATCH-003 | Snapshot applied | HUD HP, wind and active slot equal the snapshot within 100 ms | web | NFR-02 |
| TC-MATCH-904 | US-MATCH-003 | Active slot changes | Announced once through the polite live region in the active locale | e2e | NFR-16 |
| TC-MATCH-905 | US-MATCH-004 | Skip, and six phrases in one second | Skip resolves the turn; the third phrase onward is dropped locally | e2e | FR-07 |
| TC-MATCH-006 | US-MATCH-005 | Item tray with no items, and a loadout of 12 | Empty state with no dead buttons; the 12th item is refused | e2e | `data/items.md` |
| TC-MATCH-906 | US-MATCH-005 | Select weapon 2, spend the super shot | Active slot changes and the arc redraws by class; the super shot then disables | e2e | FR-03 |
| TC-MATCH-907 | US-MATCH-006 | Tap and hold ◀ ▶, exhaust the move budget, end the turn while held | Unit walks 8 px per 100 ms with live energy, the badge decrements to `0` and disables the control, no stray move after the turn ends, and a touch starting on the pad never becomes an aim pull | e2e | FR-03 |
| TC-MATCH-915 | US-MATCH-002 | Pull `powerDragFull`, then half of it | Ring reads `4.0` and `2.0` ±0.1, `force = power × 25` = 100 and 50, gradient runs clockwise from −90° | web | FR-03 |
| TC-MATCH-916 | US-MATCH-002 | Release at `power 0.2`, `pointercancel` mid-pull, two-finger pan mid-pull | Nothing is sent in any of the three cases, the ring animates back to zero, one hint per case | web | FR-03 |
| TC-MATCH-917 | US-MATCH-006 | Tap ▲ three times, hold ▼ for 1 s, hold ▲ at `angleMax` | Angle rises 3°, falls ~10° while held, stops at the band edge with the control dimmed, chip matches | web | FR-03 |
| TC-MATCH-918 | US-MATCH-007 | Load the scene, pan to each map edge | Window starts 1000 × 600 ±1 % centred on the player; panning stops at the bounds and never shows void | web | FR-03 |
| TC-MATCH-919 | US-MATCH-007 | Pinch in and out past both limits, then release | Zoom stays within `zoomMax` (250 × 150) and `zoomMin` (whole map), scales about the midpoint, keeps the final window | web | FR-03 |
| TC-MATCH-920 | US-MATCH-007 | Zoom from default to whole map and back, reading the ruler each step | Segments go 8 → 16 and back, each labelled with `visibleWidth / segments`, 125 units at both ends | web | FR-03 |
| TC-MATCH-921 | US-MATCH-007 | First tap on a device with and without the Fullscreen API | `requestFullscreen()` called where available; otherwise the page fills the viewport with safe-area insets and no `apple-mobile-web-app-capable` meta | e2e | FR-03 |
| TC-MATCH-922 | US-MATCH-007 | Zoom to `zoomMax` and to `zoomMin` with the pad and ring visible | Pad ring stays 96 px, buttons 60 px, ring radius 64 px, roster unchanged at both zooms | web | NFR-17 |
| TC-MATCH-923 | US-MATCH-003 | Apply `weather` at `m = 0`, `m = 26` and a sector change | Dial draws 12 ticks with long cardinals, arrow at `directionDeg`, numeric 0–26, `0` renders the hollow grey dial, banner appears once per round and dismisses on tap | web | FR-04 |

## Ranked (RANK)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-RANK-110 | US-RANK-001 | Submit as the host | `201`, `match_record` + `match_player` rows written in one transaction | worker | FR-07 |
| TC-RANK-111 | US-RANK-001 | Submit the same match twice | Second `409 match-already-recorded`, no second rating change | worker | `data/matches.md` |
| TC-RANK-112 | US-RANK-001 | Submit as a non-host or non-participant | `403 forbidden`, nothing written | worker | NFR-11 |
| TC-RANK-115 | US-RANK-001 | Payload with two winners or a bad duration | `422 validation_failed` naming the field | worker | `data/matches.md` |
| TC-RANK-116 | US-RANK-001 | Match containing a guest slot | `ranked: false`, no `rating_history` rows | worker | roles |
| TC-RANK-058 | US-RANK-002 | Rated match with four players | Exactly four `rating_history` rows, before/after/delta consistent | worker | NFR-14 |
| TC-RANK-113 | US-RANK-002 | Elo with equal ratings | Δ = ±16 at K = 32 | unit | OQ-28 |
| TC-RANK-114 | US-RANK-002 | K switch at 30 rated matches | K = 16 from the 31st match | unit | OQ-28 |
| TC-RANK-141 | US-RANK-003 | History pagination over three pages | Appends without duplicates or gaps; no other player's data | e2e | `data/matches.md` |
| TC-RANK-104 | US-RANK-004 | 150 rated players listed | Ordered by rating, then rated matches, then id | worker | `data/accounts.md` |
| TC-RANK-144 | US-RANK-004 | Player ranked outside the first page | Own row highlighted, sticky footer shows the rank | e2e | `screens/leaderboard.md` |
| TC-RANK-145 | US-RANK-004 | Player with fewer than 10 rated matches | `Mới` badge on their row | e2e | `screens/leaderboard.md` |
| TC-RANK-146 | US-RANK-004 | Display name containing `<script>` or an emoji | Rendered as escaped text, truncated at 16 characters | e2e | rule 06 § 2 |
| TC-RANK-147 | US-RANK-004 | Leaderboard opened signed out | Renders without redirect and without a `/me` request | e2e | roles |
| TC-RANK-153 | US-RANK-005 | Results, ranked | Deltas shown equal the server values | e2e | `screens/results.md` |
| TC-RANK-154 | US-RANK-005 | Results, guest or bot match | Unranked, no delta, reason stated | e2e | `screens/results.md` |
| TC-RANK-155 | US-RANK-005 | `Chơi lại` after a finished match | Lobby with the same `maxPlayers`, or a new room when the code is closed | e2e | `screens/results.md` |
| TC-RANK-156 | US-RANK-005 | Browser Back from results | Does not re-enter the finished match | e2e | `screens/results.md` |
| TC-RANK-157 | US-RANK-005 | `409 match-already-recorded` during submit | Stored record shown, no retry loop | e2e | `screens/results.md` |

## PWA and i18n (PWA)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-PWA-043 | US-PWA-001 | Cold load network sum | Transferred bytes < 5 MB compressed | e2e | NFR-03 |
| TC-PWA-064 | US-PWA-001 | Offline launch | Shell loads, bot match playable, network actions disabled | e2e | NFR-21 |
| TC-PWA-139 | US-PWA-001 | Match chunk | Contains no Clerk code | e2e | NFR-03 |
| TC-PWA-130 | US-PWA-002 | Every route in both locales at both landscape sizes | No overflow, no missing key, no untranslated string | e2e | NFR-18 |
| TC-PWA-162 | US-PWA-002 | 30 % text expansion fixture in `vi` and `en` | No overflow in the lobby and results layouts | e2e | NFR-18 |
| TC-PWA-063 | US-PWA-003 | Portrait viewport | Rotate notice only, no gameplay input; rotation mid-match keeps state | e2e | NFR-19 |
| TC-PWA-131 | US-PWA-004 | Route change with keyboard focus | Focus moves to the route `h1`, returns to the invoking control on back | e2e | NFR-16 |
| TC-PWA-158 | US-PWA-004 | axe-core on every route, both locales | Zero WCAG 2.2 AA violations | e2e | NFR-16 |
| TC-PWA-159 | US-PWA-004 | 200 % font size on lobby and results | No clipped text, no overlap | e2e | NFR-16 |
| TC-PWA-160 | US-PWA-004 | Computed touch-target sizes on match and lobby | Every target ≥ 44 px, fire/skip ≥ 60 px, gaps ≥ 8 px | e2e | NFR-17 |
| TC-PWA-161 | US-PWA-004 | Keyboard-only tab order on menu, lobby, results | Visible focus, logical order, no trap outside dialogs | e2e | NFR-16 |

## Ops (OPS)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-OPS-118 | US-OPS-001 | Log line for a completed request | JSON with `request_id`, `route`, `status`, `duration_ms`, no token or name | worker | NFR-24 |
| TC-OPS-173 | US-OPS-001 | Failing request log, searched for secrets | No token, cookie, display name or email present | worker | NFR-12 |
| TC-OPS-901 | US-OPS-002 | Daily SLO snapshot job | Four SLI rows with budget and verdict; a breach is flagged and exits non-zero | manual | `08-ops/slo.md` |
| TC-OPS-185 | US-OPS-003 | 50 concurrent rooms load run | No 5xx, p95 API < 400 ms, report written | manual | OQ-33 |
| TC-OPS-902 | US-OPS-004 | Release record completeness | Scope, evidence links, rollback plan and deployed versions present | manual | `07-release/README.md` |

## Manual (two-phone matrix, per release)

| ID | Story | Case | Expected | Device pair |
|----|-------|------|----------|-------------|
| TC-OPS-180 | US-OPS-004 | 1v1 over Wi-Fi, five turns each | 60 FPS, touch feels immediate, no desync (`TC-MATCH-901`, `TC-CORE-020`) | iPhone 12 + Galaxy A52 |
| TC-OPS-181 | US-OPS-004 | 2v2 with one player on cellular | Reconnect inside 20 s works; turns skip, no freeze | Galaxy A52 (LTE) + iPhone 12 |
| TC-OPS-182 | US-OPS-004 | Kill the host browser mid-match | Remaining players continue within 5 s | iPhone 12 (host) + tablet |
| TC-OPS-183 | US-OPS-004 | Full 4v4 to completion | Match ends with a winner, ratings change once | tablet + 3 phones (`OQ-24`) |
| TC-OPS-184 | US-OPS-004 | Install to home screen, airplane mode | Bot match plays offline | any one device |

## Coverage rules

- Every `NFR-…` in the NFR table is named by at least one case here, by a story, or by a row of `08-ops/slo.md`;
  `verify-docs.mjs` warns when one is not.
- A story's Definition of Done requires each acceptance criterion to name a case id; a story that introduces a case adds
  it to the table of its epic.
- A case that cannot run yet (missing environment, for example `TC-OPS-185` before M3) is marked in the release record,
  never deleted.
- A test id must match `TC-[A-Z]{2,6}-\d{3}`; numbers are unique within an epic and are never reused.

## Socket contract and lifecycle (hardening pass 2026-11-05)

Cases added when the socket contract was written down once and the Durable Object was rebuilt against it. They
exist because the same behaviour used to be cited under borrowed ids from other epics (`TC-CORE-914` carried three
unrelated meanings), so every row below names the one thing it proves.

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-FND-131 | US-FND-003 | A direct URL (`/lobby/ABC234`, `/match/ABC234`) renders the shell and the locale toggle | Shell renders without a 404 and the toggle switches VI↔EN | web | `US-FND-003` AC1, AC2, AC5 |
| TC-MATCH-914 | US-MATCH-002 | Drag distance maps to the power ring radius | Radius grows with the pull and stops at the maximum | web | `US-MATCH-002` §4 |
| TC-NET-045 | US-NET-004 | A peer sends `team_assign`; the host sends it after the start | `not-host` while a peer, `invalid-state` once playing; the roster is unchanged | worker | `US-NET-004` §2 roster |
| TC-NET-066 | US-NET-004 | A socket signals itself, then signals a seated member with no socket | `bad-request`, then `peer-not-connected`; no frame is relayed | worker | `US-NET-004` §3 `signal` |
| TC-PWA-152 | US-PWA-003 | The page is squeezed into portrait, then rotated to landscape | Portrait shows the rotate gate with the hint, landscape shows the match | web | `US-PWA-003` AC1, AC2 |
| TC-ROOM-025 | US-MATCH-004 | A preset phrase and a free text are sent, then an empty, unknown-kind or 121-char frame | The two valid frames parse; the three invalid ones are refused with the limit in `detail` | unit | `US-MATCH-004` §4 `chat` |
| TC-ROOM-053 | US-ROOM-001 | A room runs past 24 h from its creation but not from its match start | The cap is measured from the match start; the room survives until then | worker | `room-state.md` expiry |
| TC-ROOM-054 | US-ROOM-002 | Two snapshots are pushed in a row | Only the newest is stored, under its own key, and the older `seq` is dropped | worker | `room-state.md` snapshot |
| TC-ROOM-057 | US-ROOM-004 | Every member of one team loses its socket, then all but one | The team forfeits only when every member is disconnected | worker | `US-ROOM-004` AC3 |
| TC-ROOM-058 | US-NET-002 | The host pushes a snapshot, then replays an older `seq` | Each other member receives it once; the stale push is dropped without an error | worker | `US-NET-002` AC1 |
| TC-ROOM-061 | US-ROOM-005 | The host leaves and the election promotes a peer | `host_changed` hands over the newest snapshot and the bumped generation | worker | `US-ROOM-005` AC2 |
| TC-ROOM-062 | US-ROOM-002 | A member sends `leave` | `peer_left` is announced and the roster shrinks | worker | `US-ROOM-002` §3 |
| TC-ROOM-063 | US-ROOM-002 | A new socket authenticates into a lobby | The others get `peer_joined`; the newcomer gets `room_state` with its own slot | worker | `US-ROOM-002` AC2 |
| TC-ROOM-064 | US-NET-001 | A client sends `ping {at}` | `pong` carries the client's `at` and the host's `now` | worker | `signaling.md` §2 heartbeat |
| TC-ROOM-065 | US-NET-001 | Eleven pings, then twenty-one signals, in one second | The frame past the budget is refused once and the socket closes `4429` | worker | `signaling.md` § Budgets |
| TC-ROOM-070 | US-ROOM-006 | TURN credentials are requested from a Worker with no TURN key | `200` with the public STUN entry and `turn: false` | worker | `US-ROOM-006` AC2 |
| TC-ROOM-129 | US-ROOM-004 | A member reconnects, and a lobby slot is freed | The reconnecting member keeps its slot; the freed slot goes to the next joiner | worker | `US-ROOM-004` AC1 |
| TC-ROOM-146 | US-ROOM-003 | A team is assigned more members than `maxPlayers / 2` | `bad-request`; the roster is unchanged | worker | `US-ROOM-003` §4 capacity |
| TC-ROOM-155 | US-ROOM-001 | A room is created | It starts in the lobby and arms the ten-minute idle alarm | worker | `room-state.md` § Started |
| TC-ROOM-156 | US-ROOM-003 | `team_assign` and `peer_joined` arrive in the lobby | The status stays `lobby` | worker | `workflow-state-machine.md` guard |
| TC-ROOM-157 | US-ROOM-003 | `start_match` succeeds | Slots, teams and status satisfy the playing invariant | worker | `US-ROOM-003` AC4 |
| TC-ROOM-158 | US-NET-002 | A snapshot arrives while playing | The room stays `playing` and exactly one snapshot is stored | worker | `US-NET-002` AC1 |
| TC-ROOM-159 | US-ROOM-004 | Every member's grace window expires | The room becomes `abandoned` | worker | `workflow-state-machine.md` playing→abandoned |
| TC-ROOM-160 | US-ROOM-004 | An abandoned room is left idle, and a second start is attempted | The room is deleted, refuses joins, and cannot be restarted | worker | `workflow-state-machine.md` abandoned |
| TC-ROOM-161 | US-ROOM-003 | The lobby is re-entered once the match is playing | Refused; the room stays `playing` | worker | `workflow-state-machine.md` guards |
| TC-ROOM-707 | US-ROOM-007 | The host picks mode, map, capacity and a loadout; a peer changes one | The host's choice reaches every member; the peer's frame is refused | web | `US-ROOM-007` AC1–AC4 |
