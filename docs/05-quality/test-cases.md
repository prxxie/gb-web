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
| TC-FND-001 | US-FND-002 | AC1 — `GET /api/v1/health` on a fresh worker | `200 {"status":"ok","version":"<sha>"}` | worker | operational — see `08-ops/slo.md` |
| TC-FND-074 | US-FND-001 | AC1 — the layout the docs name exists | `apps/*`, `packages/core`, the three test roots, `tests/e2e`, `tests/meta`, `scripts`; the workspace globs match | unit | `AGENTS.md` § Layout |
| TC-FND-075 | US-FND-001 | AC1 — one Node floor for the whole workspace | Root `engines.node` is `>=22.12` and no package contradicts it | unit | `AGENTS.md` § PROJECT |
| TC-FND-076 | US-FND-001 | AC7 — no planned marker survives | No `(planned — …)` in `AGENTS.md` or `environment-setup.md` | unit | AC7 |
| TC-FND-077 | US-FND-001 | AC2 — typecheck, lint and the suite | `pnpm typecheck`, `pnpm lint`, `pnpm test` each exit 0; every project reports at least one passing test | manual | CI `typecheck · lint · test · build · docs` |
| TC-FND-078 | US-FND-001 | AC6 — a failing test stops a merge | The required check goes red and the pull request reports `mergeStateStatus: BLOCKED` | manual | `evidence/US-FND-001/ci-block.txt` |
| TC-FND-002 | US-FND-001 | AC5 — every env var the code reads has a row in `apps/worker/.dev.vars.example` or `apps/web/.env.example`, and no row holds a secret | Names match the code; the only values allowed are public defaults (`VITE_API_BASE=/api/v1`) | worker | NFR-12 |
| TC-FND-012 | US-FND-001 | AC4 — built web assets scanned for secret values | No match for `SESSION_TOKEN_SECRET`, `TURN_KEY_API_TOKEN` | web | NFR-12 |
| TC-FND-018 | US-FND-001 | AC3 — `packages/core` imports no DOM, Phaser or network module | Static import scan is empty | unit | NFR-22 |
| TC-FND-071 | US-FND-002 | AC2 — a route throws `validation_failed` | `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, `request_id`, fields under `errors[]` | worker | `api/README.md` |
| TC-FND-072 | US-FND-002 | AC3 — a route throws an unexpected `Error` | `500` `…/internal`, no stack trace, no SQL, same `request_id` as the log line | worker | NFR-24 |
| TC-FND-079 | US-FND-003 | AC5 note — every API call on a route fails | The route still renders its `h1` and a translated sentence; no `TypeError`, `Failed to fetch` or empty screen reaches the DOM | e2e | NFR-16 |
| TC-FND-073 | US-FND-002 | AC5 — an unknown route | `404` `not-found` with `instance`, no crash, `ROOMS` still bound | worker | `api/README.md` |
| TC-FND-070 | US-FND-002 | AC6 — response shapes for all endpoints match `openapi.yaml` | Match `openapi.yaml` (schemathesis or explicit fixtures) | worker | `api/README.md` |
| TC-FND-100 | US-FND-002 | AC4 — migrations apply to an empty D1 | Schema equals `data/README.md` | worker | ADR-0003 |
| TC-FND-901 | US-FND-004 | Open a pull request touching `apps/web` | Pages preview + `-preview` worker URLs and the commit sha appear in the PR comment | manual | NFR-13 (deploy hygiene) |
| TC-FND-902 | US-FND-004 | Rehearse the documented rollback on preview | Previous worker and Pages build serve again within 5 min; `/health` reports the previous sha | manual | deployment.md |

## Accounts (AUTH)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-AUTH-057 | US-AUTH-001 | AC2 — session token used after 60 min | Session token used after 60 min | `401 unauthenticated`; client refreshes at 55 min | worker | OQ-27 |
| TC-AUTH-065 | US-AUTH-001 | AC3 — guest is refused the account surface | Guest calls `/me`, `start_match`, `team_assign` | `401`/`403`, room state unaffected | worker | NFR-11 |
| TC-AUTH-074 | US-AUTH-001 | AC1 — guest and account minting | `POST /sessions` as guest and as registered | Correct `subject.kind`, 60-min expiry, `wsUrl` present | worker | FR-01 |
| TC-AUTH-135 | US-AUTH-001 | AC4 — guest path from the main menu | Guest path from the main menu | No sign-in prompt, room created | e2e | roles |
| TC-AUTH-151 | US-AUTH-002 | AC1 — an account session is minted from a Clerk JWT | `201`, `subject.kind` is `account`, the session `sub` is the internal `accountId`, never Clerk's `sub` | worker | `api/accounts.md` |
| TC-AUTH-152 | US-AUTH-002 | AC2 — a first-ever sign-in | Exactly one `account` and one `profile` row, `rating` 1200, `rated_matches` 0, generated `display_name` | worker | `data/accounts.md` |
| TC-AUTH-153 | US-AUTH-002 | AC3 — a JWT signed by an unknown key, expired, or with a foreign `azp` | `401 unauthenticated` and nothing written | worker | NFR-11 |
| TC-AUTH-154 | US-AUTH-002 | AC4 — the JWKS endpoint is unreachable | A cached key still verifies; with no cache the answer is `503` with `retryAfterSeconds`, never `500` | worker | `api/README.md` |
| TC-AUTH-155 | US-AUTH-002 | AC7 — an unauthenticated call to a protected endpoint | `401` with the standard problem body and no redirect | worker | NFR-11 |
| TC-AUTH-156 | US-AUTH-002 | AC1 (client) — the sign-in replaces the guest session | After Clerk reports a session, `upgradeToAccount` runs and the adopted session has `kind: account` | web | `screens/signin.md` |
| TC-AUTH-137 | US-AUTH-002 | AC5 — guest escape from the sign-in screen | Returns to `/` without an error | e2e | roles |
| TC-AUTH-138 | US-AUTH-002 | AC6 — `returnTo=https://evil.example` on sign-in | Ignored; lands on `/` | e2e | NFR-11 |
| TC-AUTH-150 | US-AUTH-003 | AC1 — a name saved unchanged | `200`, `display_name_key` unchanged, no other profile column written | worker | `data/accounts.md` |
| TC-AUTH-101 | US-AUTH-003 | AC2 — duplicate `display_name_key` after normalisation | `409 display-name-taken`, previous value kept | worker | `data/accounts.md` |
| TC-AUTH-102 | US-AUTH-003 | AC3 — display name of 1 or 17 characters, or unknown avatar | `422 validation_failed` naming the field | worker | `data/accounts.md` |
| TC-AUTH-144 | US-AUTH-003 | AC5 — avatar picker saves through `PATCH /me` | Pick `avatar-09` → one `PATCH {avatarId}` → `GET /me` returns it after a remount | web | `screens/profile.md` |
| TC-AUTH-145 | US-AUTH-003 | AC6 — a display name is text, never markup (boundary) | `<script>`, `<b>&</b>`, newline, tab, NUL → `422` naming `displayName`, row unchanged | worker | AC6 |
| TC-AUTH-148 | US-AUTH-003 | AC6 — a stored markup name renders as characters | Input value and `textContent` match; no `<b>` element and no `<b>` in `innerHTML` | web | AC6 |
| TC-AUTH-146 | US-AUTH-003 | AC7 — a rename reaches the room over `auth` | Lobby mounted, identity edited → exactly one `auth` frame with the new name, peers get the `room_state` that carries it | web | `US-AUTH-003` § 5 |
| TC-AUTH-149 | US-AUTH-003 | AC5 — the picked avatar shows in the lobby roster | Roster cell reads the member's `avatarId` and changes on the next `room_state`, no reload | web | AC5 |
| TC-AUTH-147 | US-AUTH-003 | AC5/AC7 — the edited identity lands in the stored session | `PATCH /me` `200` → `gbw.session` subject updated; `409` → unchanged | web | AC5/AC7 |
| TC-AUTH-140 | US-AUTH-003 | AC4 — profile name saved, then a `409` | Optimistic value reverts with an inline field error | web | `data/accounts.md` |
| TC-AUTH-143 | US-AUTH-003 | Guest opens `/profile` | Redirect to `/sign-in` | e2e | roles |
| TC-AUTH-069 | US-AUTH-004 | AC2 — `DELETE /me` during a live room | `DELETE /me` during a live room | `409`, nothing deleted | worker | NFR-13 |
| TC-AUTH-075 | US-AUTH-004 | AC6 — any response for another account | Any response for another account | Contains no `accountId`/`guestId`/email | worker | NFR-13 |
| TC-AUTH-103 | US-AUTH-004 | AC4 — the purge after thirty days | Delete an account, then run the purge | Rows anonymised, Clerk user deleted, `rating_history` kept | worker | NFR-13 |
| TC-AUTH-104 | US-CORE-013 | Equipped avatar part the account no longer owns | Stripped server-side at loadout validation, bonus not applied | worker | NFR-11 |
| TC-AUTH-160 | US-AUTH-004 | AC1 — `DELETE /me` on an account outside a room | `204` with no body; the Clerk user is deleted before the row is marked | worker | `accounts.md` § DELETE /me |
| TC-AUTH-161 | US-AUTH-004 | AC3 — a still-valid JWT for a deleted account | `401 unauthenticated` on every route, and a second `DELETE` does nothing | worker | `accounts.md` |
| TC-AUTH-162 | US-AUTH-001 | AC6 — a guest session after the tab closes | The token is in `sessionStorage` only; `localStorage` stays empty | web | NFR-12 |
| TC-AUTH-163 | US-AUTH-001 | AC5 — a guest response body | No email, no `accountId`, no Clerk id anywhere in the JSON | worker | NFR-13 |
| TC-AUTH-142 | US-AUTH-004 | AC5 — delete flow on the profile screen | Delete flow on the profile screen | Typed confirmation → signed out, redirect, no further access | e2e | NFR-13 |

## Rooms (ROOM)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-ROOM-071 | US-ROOM-001 | AC3 — `POST /rooms` with `maxPlayers: 3` | `422 validation_failed` | worker | FR-01 |
| TC-ROOM-072 | US-ROOM-001 | AC4 — 11 rooms created in one minute from one IP | The 11th is `429`, the first 10 succeed | worker | NFR-25 |
| TC-ROOM-073 | US-ROOM-001 | AC5 — `GET /rooms/{code}` for a closed room | `410 room-closed` | worker | FR-01 |
| TC-ROOM-120 | US-ROOM-001 | AC1 — room code format and collision retry | Matches `^[A-HJ-NP-Z2-9]{6}$`, retried on collision, no duplicate room | worker | FR-01 |
| TC-ROOM-133 | US-ROOM-001 | AC7 — room-code input | Rejects `I`, `O`, `1`, `0`; enables join at 6 characters | e2e | FR-01 |
| TC-ROOM-134 | US-ROOM-001 | AC6 — create vs join from the main menu | Host lands in the lobby with a copy control, peer joins the same room | e2e | FR-01 |
| TC-ROOM-136 | US-ROOM-001 | AC5 — join a 404/410 code | Banner shown, stays on `/` | e2e | FR-01 |
| TC-ROOM-150 | US-ROOM-001 | AC6 — copy-code control | Clipboard equals the code | e2e | `screens/lobby.md` |
| TC-ROOM-168 | US-CORE-012 | `setRoomSettings` with a new map and mode, then a capacity below the seated members | The settings patch lands and keeps the other fields; the shrink is refused `below-seated` | unit | FR-05 |
| TC-ROOM-169 | US-ROOM-005 | AC3 — election exhausts its candidates | Every socket gone: the room is `abandoned`, never hostless | worker | `apps/worker/src/room-do.ts` |
| TC-ROOM-170 | US-ROOM-001 | AC2 — code generator keeps returning a taken code | Five attempts, then `503 unavailable` with `Retry-After: 5` | worker | FR-01 |
| TC-ROOM-174 | US-ROOM-004 | A socket dies with a transient close code | Reopened after 500 ms, `onReconnected` fires once | web | NFR-07 |
| TC-ROOM-175 | US-ROOM-004 | A socket is closed with `4401` | No retry; `onFatal(4401)` | web | NFR-07 |
| TC-ROOM-176 | US-ROOM-004 | Transient drops keep failing for 21 s | Retries stop at the end of the grace window | web | NFR-07 |
| TC-ROOM-177 | US-ROOM-004 | The page unmounts while the socket is dead | The retry loop stops with it | web | NFR-07 |
| TC-ROOM-186 | US-ROOM-004 | AC6 — both seats of one team leave mid-match | The room ends `abandoned`, `POST /matches` gets `abandoned: true` and winner A, the broadcast says `win` for A and `abandon` for the B seats, and the record row says why | worker | `US-ROOM-004` AC6 |
| TC-ROOM-183 | US-ROOM-003 | AC1 — `team_assign` fan-out | Every socket, host included, receives exactly one `room_state` carrying A/A/B/B | worker | `api/signaling.md` |
| TC-ROOM-184 | US-ROOM-004 | AC2 — reconnect 19 s into the grace window | The returning socket keeps slot 3 and team B and is re-sent `snapshot_state` with its 70 HP | worker | NFR-07 |
| TC-ROOM-185 | US-ROOM-004 | AC3 — grace window runs out | The seat flips to `disconnected`, peers hear `peer_left {reason:"disconnected"}`, the next `room_state` shows it | worker | NFR-07 |
| TC-ROOM-182 | US-ROOM-005 | AC6 — migration end to end on two sockets | Host socket killed mid-match: the survivor is promoted within 5 s with `hostGeneration` 2 and still pings | e2e | NFR-06 |
| TC-ROOM-151 | US-ROOM-007 | Host selects mode, map and capacity; a non-host tries | Host writes, member is rejected, loadout caps at 11 items across two pages | e2e | `screens/lobby.md` |
| TC-ROOM-153 | US-ROOM-007 | Two players pick the same mobile, then a guest picks one | Both are accepted in the same room, every mobile appears once in the grid, the choice survives a reload | e2e | `data/mobiles.md` |
| TC-ROOM-123 | US-ROOM-001 | AC8 — idle room for 10 minutes | Storage deleted, code reusable after 60 s | worker | `data/room-state.md` |
| TC-ROOM-121 | US-ROOM-002 | AC2 — `auth` after 5 s, or a bad token | Close `4401`; no member created | worker | `api/signaling.md` |
| TC-ROOM-122 | US-ROOM-002 | AC3 — ninth join to an 8-slot room | Close `4409`, roster unchanged | worker | FR-01 |
| TC-ROOM-126 | US-ROOM-002 | AC2 — any message before `auth` | Close `4401` | worker | `api/signaling.md` |
| TC-ROOM-127 | US-ROOM-002 | AC6 — ping/pong liveness | Three missed pings → `connectionState: "grace"` | worker | NFR-07 |
| TC-ROOM-128 | US-ROOM-002 | AC5 — `leave` then rejoin in `lobby` | Slot reused, no duplicate member | worker | `data/room-state.md` |
| TC-ROOM-068 | US-ROOM-002 | Second socket for the same subject | Replaces the first, no duplicate member | worker | NFR-07 |
| TC-ROOM-147 | US-ROOM-002 | Two contexts in the same room | Identical roster, slots and teams | e2e | FR-01 |
| TC-ROOM-066 | US-ROOM-003 | AC2 — non-host sends `start_match` or `team_assign` | `error not-host`, roster unchanged | worker | NFR-11 |
| TC-ROOM-148 | US-ROOM-003 | Start gating | Disabled until every slot is filled, teams equal and non-empty | e2e | `workflow-state-machine.md` |
| TC-ROOM-162 | US-ROOM-003 | AC5 — illegal state transitions in `playing`/`ended` | Rejected with no side effects | worker | `workflow-state-machine.md` |
| TC-ROOM-164 | US-ROOM-003 | AC4 — `start_match` in a lobby that is not full | `room-not-full` | worker | `workflow-state-machine.md` |
| TC-ROOM-165 | US-ROOM-003 | AC4 — `start_match` with unbalanced teams | `teams-not-balanced` | worker | `workflow-state-machine.md` |
| TC-ROOM-163 | US-NET-004 | Every documented client frame, and one field the frame does not document | Each documented frame parses; an unknown `t` is `unsupported-message`; an undocumented field is `bad-request` naming it; an 8 KB sdp is `payload-too-large` | unit | `api/signaling.md` § 2 |
| TC-ROOM-167 | US-ROOM-007 | AC4 — a lobby loadout of eleven items, then a twelfth | Eleven are kept and the twelfth is refused | worker | `data/items.md` |
| TC-ROOM-046 | US-ROOM-004 | Reconnect within the 20 s grace | Slot, team and HP restored from `lastSnapshot` | e2e | NFR-07 |
| TC-ROOM-047 | US-ROOM-004 | Grace countdown on the match screen | Overlay counts 20 → 0, then `disconnected` | e2e | NFR-07 |
| TC-ROOM-055 | US-ROOM-004 | Kill one peer during a 2v2 | The other three keep playing; the match completes | e2e | NFR-08 |
| TC-ROOM-056 | US-ROOM-004 | One player reconnects mid-match | Their view matches the host's state (HP, turn, wind) | e2e | NFR-07 |
| TC-ROOM-059 | US-ROOM-004 | AC4, AC6 — forfeit rules | Loss only when every member of a team is `disconnected`; the other three keep playing | worker | NFR-07 |
| TC-ROOM-048 | US-ROOM-005 | AC1, AC7 — host socket dies in `playing`, and again after the first promotion | Longest-connected peer becomes host, `hostGeneration` +1 | worker | NFR-06 |
| TC-ROOM-049 | US-ROOM-005 | AC6 — migration end to end | Playable again ≤ 5 s from the failure | e2e | NFR-06 |
| TC-ROOM-124 | US-ROOM-005 | `snapshot_push` above 8 KB | Rejected, previous snapshot kept | worker | NFR-04 |
| TC-ROOM-205 | US-CORE-010 | AC7 — `POST /rooms` with a mode outside `solo` / `score` / `tag` / `jewel` | 422 `validation`, `errors[].field` names `mode` | worker | FR-04  |
| TC-ROOM-149 | US-ROOM-005 | AC5 — host leaves the lobby | Banner shown, earliest joiner promoted | e2e | NFR-06 |
| TC-ROOM-050 | US-ROOM-006 | AC1 — signaling relay | SDP passed through byte-identical, never stored | worker | NFR-09 |
| TC-ROOM-051 | US-ROOM-006 | AC3 — `GET /turn-credentials` | Two servers, `ttlSeconds: 3600`, nothing logged | worker | NFR-10 |
| TC-ROOM-052 | US-ROOM-006 | Client storage after a match | No ICE credential or TURN token in `localStorage`/`sessionStorage` | e2e | NFR-10 |
| TC-ROOM-125 | US-ROOM-006 | AC2 — `signal` over 8 KB or to a non-member | Error, nothing relayed | worker | NFR-09 |

## Match core (CORE)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-CORE-011 | US-CORE-001 | Two tunables files produce different trajectories | Trajectories differ; a recorded match carries its `rulesetVersion` | unit | NFR-23 |
| TC-CORE-020 | US-CORE-001 | AC1, AC2, AC8 — the golden `mbl-01` sample, the gravity step and run-to-run identity | `mbl-01` shot 1 at 45°, force 98, no wind | Lands at 3,680 units after 8.6 s, each position inside the golden-sample ±0.5 units band; gravity 100 u/s² adds exactly 5 u/s per step | unit | FR-04 |
| TC-CORE-021 | US-CORE-001 | AC4b — a sector (not just a magnitude) changes the arc | Wind +max pushes the projectile downwind | Δx increases monotonically with wind | unit | FR-04 |
| TC-CORE-022 | US-CORE-001 | AC5 — an angle outside the window is clamped, never rejected | Force and angle out of the mobile's own window (`mbl-05` 25°, `mbl-15` 50°, `mbl-13` −18°) | Clamped to that mobile's `angleMin…angleMax` and `0…maxPower`, never `NaN`, and two mobiles with the same profile clamp differently | unit | FR-03 |
| TC-CORE-023 | US-CORE-001 | AC4 — drift follows `½·a·t²`, is linear in the magnitude and is the same for every mobile | The same shot in calm, in wind +26 and in wind −26, on two mobiles with different windows | The landing drift equals `½ · windCoefficient · magnitude · t²` within 5 %, doubles when the magnitude doubles, mirrors for the other direction, and is identical across mobiles because the wind has no mass term | unit | FR-04 |
| TC-CORE-024 | US-CORE-003 | AC1, AC5, AC6 — power 400 at 20 / 50 / 79 / 81 units inside a radius-80 blast, and the tier table | Inner 400, Mid 240, Outer 120, nothing beyond the radius; tiers at 0.4 R and 0.7 R | unit | FR-06  |
| TC-CORE-025 | US-CORE-003 | AC4 — a unit at hp 100 takes 435 | HP floored at 0, player marked `eliminated` | unit | FR-06  |
| TC-CORE-026 | US-CORE-003 | Target with `defense 1.15` takes an Inner hit of 500 | Damage is divided by `defense` and rounded: 435 | unit | FR-06 |
| TC-CORE-028 | US-CORE-001 | Same seed and inputs twice | Identical state hash after 200 steps | unit | NFR-22 |
| TC-CORE-029 | US-CORE-001 | AC3 — force 0 drops the shell inside the flight budget | Projectile leaves `mapBounds` and never lands | Turn resolves as a miss after `maxFlightMs`, no error | unit | FR-04 |
| TC-CORE-041 | US-CORE-004 | AC1 — encode 8 players in Jewel mode with 6 jewels, then the same match with `includeTerrain` | ≤ 800 bytes and no mask by default, decodes identically; the mask-bearing frame is larger but stays under the 8 KB socket cap and decodes to the host's heights | unit | FR-05  |
| TC-CORE-042 | US-CORE-004 | AC6 — a snapshot payload above `snapshotHardLimitBytes` | refused at the hard limit (the socket-level `snapshot-too-large` rejection is `TC-ROOM-124`) | unit | FR-05  |
| TC-CORE-940 | US-CORE-004 | AC2 — encode the same state twice, then apply it twice | byte-identical, so key order and rounding are stable; a second apply is a no-op | unit | FR-05  |
| TC-CORE-941 | US-CORE-004 | AC3, AC4 — take `seq 41` after `39`, then `39` after `41`, then a snapshot from an older `hostGeneration` | a newer sequence wins without needing `40`; an older sequence and an older generation are refused | unit | FR-05  |
| TC-CORE-942 | US-CORE-004 | AC5 — apply a decoded snapshot onto the host's state | shields, energy, delay queue, weapon slot, scores and mode state match the host; the turn and weather ride in the snapshot itself | unit | FR-05  |
| TC-CORE-040 | US-CORE-004 | Apply the same snapshot twice | Second apply is a no-op; key order and rounding stable | unit | FR-05 |
| TC-CORE-045 | US-CORE-002 | AC5 — out-of-order `seq` means only the higher one counts | Last `seq` wins, one shot simulated | unit | FR-05 |
| TC-CORE-152 | US-CORE-002 | AC4 — the clock expires and the queue advances exactly once | 20 s, skips on timeout, drift ≤ 1 s | unit | OQ-03 |
| TC-CORE-901 | US-CORE-002 | AC1, AC2, AC3 — equal delays tie on slot, the super shot costs +200 and an item's cost counts before sorting | Order follows accumulated delay, ties by slot, super shot pushes the shooter back; item and move costs included | unit | FR-02 |
| TC-CORE-936 | US-CORE-002 | AC6 — an eliminated slot is skipped but keeps its accumulated delay | Four players, slot 2 eliminated, turn ends | The queue skips slot 2 and its delay is untouched | unit | FR-04 |
| TC-CORE-937 | US-CORE-002 | AC7 — the delay table that produced the order rides on `match_end` | A table parses and comes back unchanged; a fractional, negative or over-long one is `bad-request` naming `delayTable`; a frame without one still parses | unit | FR-02 |
| TC-CORE-939 | US-CORE-002 | AC7 — the table is stored with the record it explains | `POST /matches` writes `delay_table` in slot order, stores `[]` when the client sent none, and answers 422 for a fractional or negative delay without writing a row | worker | FR-02 |
| TC-CORE-902 | US-CORE-005 | AC1, AC2, AC3 — Bot's turn starts with three weapons | Fires within 3 s, picks the best simulated weapon, deterministic per seed | unit | NFR-21 |
| TC-RANK-116 | US-RANK-001 | AC5, AC6 — a ruleset the server does not run, or an abandoned match | `201` with `ranked: false` and the reason on the wire (`ruleset_mismatch` / `abandoned`), `ranked_reason` stored, no `rating_history` rows, every `result` is `abandon` for an abandoned match | worker | roles |
| TC-CORE-903 | US-CORE-003 | AC2 — target with shield 300, hp 1,200, defense 1.15 takes an Inner hit of 500 | Total 435: shield absorbs 300, HP loses 135, shield never goes negative | unit | FR-06  |
| TC-CORE-904 | US-CORE-008 | AC1, AC2, AC3, AC4, AC7, AC8 — `mbl-01` walks once then tries twice; `mbl-13` walks twice and runs; one climbs too steep a slope | Energy debited by `moveEnergy` (double for a run), queue by `moveDelay`, distance is the mobile's own `moveDistance`, action count capped at `maxMovesPerTurn`, movement stops at `maxIncline` and at the map bound | unit | FR-03 |
| TC-CORE-914 | US-CORE-006 | AC1, AC2, AC3 — blast radius 80 on the mask | Crater of 0.6x80 carved, units regrounded, mask identical on host and peer | unit | FR-06 |
| TC-CORE-948 | US-CORE-006 | AC4 — the same blast on host and peer | Two independently carved masks serialise byte-identical and the RLE round-trips | unit | FR-06 |
| TC-CORE-949 | US-CORE-006 | AC5 — a unit fully buried by terrain | It can still fire but cannot move until the terrain is opened | unit | FR-06 |
| TC-CORE-950 | US-CORE-006 | AC6 — a `piercing` shot meets a ridge | It crosses the ridge that stops an arc shot | unit | FR-06 |
| TC-CORE-951 | US-CORE-008 | AC5 — a crater opens under the walking unit | It falls to the new ground instead of floating | unit | FR-03 |
| TC-ROOM-206 | US-CORE-008 | AC6 — a `move` from a peer the host did not make active | Nothing is relayed; the active player's move still reaches the host | worker | FR-03 |
| TC-CORE-905 | US-CORE-007 | AC1, AC8 — the twenty records load inside the documented clamps, `1000`-scale values are kept as-is | Schema valid (`gravity 84–128`, `mass 118–169`, `maxHp 900–1200`, `maxShield 0–300`, `power 180–580`, no `density` on a weapon, `trajectory` one of five profiles, `angleMin < angleMax` inside its profile band, `maxMovesPerTurn` 1–2, `moveDistance` 60–110, `moveEnergy` 8–14, `moveDelay` 8–14, `runMultiplier` 1.5–1.9), regen capped at `maxShield`, an out-of-band value rejected | unit | FR-06 |
| TC-CORE-906 | US-CORE-009 | AC1, AC2 — Dual, Blood and Power up | Dual is used, then Blood, then Power up, each on one shot | Dual keeps the turn for a second shot on the same weapon; Blood costs 8 % of the caster's health and adds 33 % damage to that one shot; Power up adds 33 % damage without touching the arc; every cost clears after the shot | unit | FR-09 |
| TC-CORE-907 | US-CORE-009 | AC3 — Energy up 1 and Energy up 2 | A wounded caster uses each item | The small one restores 10 % of the bar and the large one 25 %, never past `maxHp`, and the movement budget is untouched | unit | FR-09 |
| TC-CORE-908 | US-CORE-009 | AC4 — Change Wind | Wind re-rolled, announced, present in the next snapshot | unit | FR-04  |
| TC-CORE-909 | US-CORE-009 | AC5 — Teleport and Team Teleport | A caster uses each, and a second copy from the right edge | Teleport moves 150 px and stays inside the map; Team Teleport swaps the caster with the living team mate on the lowest health and leaves the rest of the field where it was | unit | FR-09 |
| TC-CORE-910 | US-CORE-009 | AC6 — Bunge shot | Two identical shots, one armed with the item | The armed shot carves visibly more terrain samples than the plain one (25 % more radius) and lands at the same point: the item changes the ground, not the flight | unit | FR-09 |
| TC-CORE-911 | US-CORE-009 | AC7 — Thunder | A horizontal band at the aim point is struck for the listed damage | unit | FR-06  |
| TC-CORE-912 | US-CORE-007 | AC2 — the chosen `weaponSlot` flies its own class, power and radius | Each class shows its documented shape; beam resolves instantly; cluster splits into 3 | unit | FR-04 |
| TC-CORE-913 | US-CORE-001 | AC7 — a bounce detonates no later than the third bounce | `bounce` on flat terrain, `piercing` through a hill, `return` off the map | Bounce detonates within 3 bounces at 0.6 restitution; piercing ignores terrain; return comes back once | unit | FR-04 |
| TC-CORE-945 | US-CORE-012 | AC5 — a corrupt terrain RLE token and a mask of the wrong length | Both throw (`corrupt terrain RLE`, `terrain length mismatch`); a sound mask still round-trips | unit | FR-06  |
| TC-CORE-946 | US-CORE-005 | AC5 — the human's 20 s clock runs out in a bot match | The turn passes to the bot, which fires a legal shot inside its own envelope without the human's socket | unit | FR-07  |
| TC-CORE-943 | US-CORE-003 | AC3 — a `mbl-01` slot starts its turn at shield 10, and again at 145 | Shield rises by its own `shieldRegen` (20) to 30, and is capped at `maxShield` (150); a slot that is not starting keeps its shield | unit | FR-06  |
| TC-CORE-944 | US-CORE-003 | AC7 — `mbl-19` (electric) and `mbl-01` (explosion) fire the same shot | The effect never enters the damage formula, and the mobile's `effect` travels with it (`electric`) | unit | FR-06  |
| TC-CORE-027 | US-CORE-003 | Blast hits a teammate; last player of a team reaches 0 | Friendly fire damages; match ends with the other team as winner | unit | OQ-02 |
| TC-CORE-915 | US-CORE-010 | AC2 — Score mode reaches the 12-turn cap | Higher damage total wins | unit | FR-06 |
| TC-CORE-916 | US-CORE-010 | AC3 — Tag mode, a team finishes its whole turn | `activeTeam` flips and the opposing team acts | unit | FR-02 |
| TC-CORE-917 | US-CORE-010 | AC4, AC5 — Jewel mode: walk over a jewel, then kill a carrier | Jewel carried, then transferred to the killer's team; all jewels ends the match | unit | FR-06 |
| TC-CORE-918 | US-CORE-011 | AC1, AC2, AC4 — Map with `force`, map with `gust` | Constant sideways push; 4× wind spike for one turn, announced and reverted | unit | FR-04 |
| TC-CORE-919 | US-CORE-011 | AC3, AC6, AC8 — Map with `electric`, `heal` and a tornado | Strike on every third turn for 150; heal zone (200 units around x 1000) restores 100 capped at `maxHp`, a unit outside it gains nothing; tornado displaces 60 px without burying | unit | NFR-21 |
| TC-CORE-920 | US-CORE-012 | AC1, AC2 — Load the eleven maps | Schema valid, spawns valid for 8 slots, terrain RLE expands | unit | FR-04 |
| TC-CORE-957 | US-CORE-012 | AC3 — a map with gimmicks | The listed gimmick runs in the match and the lobby reads the same list | unit | FR-04 |
| TC-CORE-958 | US-CORE-012 | AC6 — the same map and seed twice | Terrain, opening wind and the gimmick schedule match | unit | FR-04 |
| TC-ROOM-207 | US-CORE-012 | AC4 — the host changes the map and mode | The settings land on the room and `match_started` carries them to every peer | worker | FR-04 |
| TC-CORE-921 | US-CORE-013 | AC1, AC2, AC5 — Profile with +4 attack, another with +20 | First is ×1.04, second clamps at ×1.10; energy and delay caps hold | unit | FR-06 |
| TC-CORE-922 | US-CORE-007 | AC3 — the super shot needs a full gauge | Fire the SS with an empty gauge, then with a full one, then refill it | The empty-gauge shot is refused (`super-shot-not-charged`), the full-gauge shot fires and drops the gauge to 0, and a refilled gauge allows a second SS in the same match | unit | FR-04 |
| TC-CORE-923 | US-CORE-007 | AC4 — a balance report over the twenty records; the loader refuses an out-of-range value | Every archetype has exactly two mobiles, the two sit within ±10 % of each other on damage per delay, the roster spread is printed, report regenerates from the CSV | unit | `data/mobiles.md` § 5 |
| TC-CORE-924 | US-CORE-007 | AC6, AC7 — two players may share a mobile; every mobile lands where the flat-probe table says | Every mobile fires at its `maxPower` on a flat probe map | Landing distance and hang time match `data/mobiles.md` § 4 within ±1 unit (`mbl-14` 2,058 vs `mbl-03` 1,433, first ground contact), each mobile keeps its own arc at identical power, and a heavier mobile drifts less under wind | unit | FR-04 |
| TC-CORE-935 | US-CORE-001 | AC6 — lower gravity means a flatter, longer arc | `mbl-13` (`g 84`) lands past `mbl-03` (`g 118`) at the same angle and force: 2,024 vs 1,433 units | unit | FR-04 |
| TC-CORE-925 | US-CORE-007 | AC7 — the wind push is the weather's alone: no mass term, no vertical component | The wind acceleration at magnitude 26, and the same shot on several mobiles | `ax = 0.8 × 26 = 20.8 u/s²`, `ay = 0` for both directions, half the coefficient is half the push, and every mobile drifts by exactly the same amount | unit | FR-04 |
| TC-CORE-938 | US-CORE-007 | AC5 — the `rulesetVersion` rides in `match_started` and survives the snapshot | `match_started` carries the version to every member and a snapshot applies the same one | unit | FR-04 |
| TC-CORE-933 | US-CORE-003 | AC6 — the weapon-type matchup | The armour matrix, and one blast told two different armour classes | Every damage type has exactly one class it beats (`≥1.15`) and one it is soft against (`≤0.95`), every row averages 1 ± 0.05, every class is countered and soft to something, an unknown side is neutral, and the same blast does more damage to the class its type counters | unit | FR-04 |
| TC-CORE-926 | US-CORE-015 | AC1, AC2, AC3, AC4, AC7 — Roll the weather across four rounds with a fixed seed | `turn.round` increments on queue wrap; `magnitude` 0–26 and `sector` 0–11 each roll; wind constant inside a round; same seed replays the same sequence | unit | FR-04 |
| TC-CORE-927 | US-CORE-005 | AC4 — A bot holding Power up | The target sits inside the blast with a bar under one boosted shot, then a healthy target, then an empty bag | The bot spends Power up on the finisher and fires anyway on the healthy target, the empty bag and the failed coin flip | unit | FR-05 |
| TC-CORE-947 | US-CORE-005 | AC6 — a finished bot match | `isRanked` refuses a bot seat, so the match never reaches the leaderboard | unit | FR-07 |
| TC-CORE-928 | US-CORE-015 | AC8 — An eight-player mid-round snapshot after a wind roll | The weather rides in the snapshot (`magnitude`, `sector`, `rolledAtRound`), decodes identically, and the state snapshot stays ≤ 800 bytes | unit | FR-04 |
| TC-CORE-959 | US-CORE-015 | AC5 — `magnitude = 0` | A legal calm roll: `isCalm` true, the dial reads `calm`, no wind term | unit | FR-02 |
| TC-CORE-960 | US-CORE-015 | AC6 — `magnitude 26`, `sector 0`, a full-force shot | The landing point moves 100-160 units downwind (about one ruler division) | unit | FR-02 |
| TC-CORE-929 | US-CORE-013 | AC3 — A guest with no avatar equipped | No bonus is applied and the match is still playable | unit | FR-06  |
| TC-CORE-930 | US-CORE-013 | AC4 — An avatar part the profile does not own, or a retired one | It contributes no bonus, and the rest of the profile still applies | unit | NFR-11  |
| TC-CORE-931 | US-CORE-011 | AC7 — the fog gimmick on a flat map | The visible window halves and the battle state is untouched | unit | `tunables.md` § 6 |
| TC-CORE-955 | US-CORE-011 | AC5 — a map with `return` | An off-map shot comes back instead of despawning | unit | `tunables.md` § 6 |
| TC-CORE-932 | US-CORE-009 | AC8 — An item the player does not own | Rejected without charging the item's delay | unit | `data/items.md`  |
| TC-CORE-953 | US-CORE-009 | AC9 — any item | Its `delayCost` is charged and the queue stays on the user until they fire or skip | unit | FR-03 |

## Netplay (NET)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-NET-901 | US-NET-001 | AC1, AC2, AC3, AC4 — host opens a peer connection against a stand-in `RTCPeerConnection`; a peer receives `control` then `state` | Exactly two channels: `control` `{ordered: true}`, `state` `{ordered: false, maxRetransmits: 0}`; a half-arrived pair wires nothing, so no snapshot rides on `control`; `host_hello {hostGeneration, seq}` goes out on each new control channel; snapshots wait for the last peer or 5 s, whichever first | web | ADR-0004 |
| TC-NET-905 | US-NET-002 | AC1, AC2, AC4, AC5, AC6, AC7 — a peer's input frame, a resent `seq`, the publish rate, the drop threshold and the payload's weight | The frame carries turn, seq, angle, force, facing and the weapon slot and a skip carries no ballistic field; a `seq` at or below the last one applied is dropped; 10 Hz in a turn, 2 Hz once it is over; the terrain mask never leaves the host and eight players weigh 1319 B, so AC7's 800 B is still open | web | FR-05 |
| TC-NET-906 | US-NET-002 | AC1, AC3 — the page's half: a peer's shot goes on `control`, the host's own shot is applied and published | A peer's release sends exactly one `input` frame and publishes nothing; the host's release broadcasts one snapshot and sends no `input`; the applied state comes back through `resyncFromSnapshot` | web | FR-05 |
| TC-NET-908 | US-NET-003 | AC1, AC3, AC6 — the promoted host adopts the last snapshot | An adopted snapshot at `seq` 87 restores its players and publishes `seq` 88 at the message's generation; `deadlineAt` is preserved; a `null` snapshot restarts at `seq` 1; a snapshot from the generation just left is dropped | web | FR-06, NFR-06 |
| TC-NET-909 | US-NET-003 | AC2, AC4 — authority follows the election | A peer promoted by `host_changed` publishes the adopted snapshot (88) on the mesh and the socket — the push the DO replays to a graced member; the demoted host stops publishing and sends its release as an `input` frame | web | FR-06 |
| TC-NET-910 | US-NET-003 | AC5 — migration on two devices | Force-close the host tab during a match: the surviving tab plays on within 5 s of the socket close, with the same turn and HP, measured on a stopwatch from the close | manual | NFR-06 |
| TC-NET-907 | US-NET-002 | AC7 — the DO accepts the packed `snapshot_push`, stores the expanded object and relays packed | A packed push stores a readable `Snapshot` (`seq`, per-player `hp`); an expanded push still works; the relayed `snapshot_state` is packed (`s`/`p`, no `players`) and under 800 B | worker | FR-05 |
| TC-NET-904 | US-NET-001 | AC1, AC3, AC5, AC6 — two real browsers join a room and play | Seven links at eight players and never more, both channels open in `about:webrtc`, the first snapshot lands after the last peer connects, and every link closes when the match ends | manual | ADR-0004 |
| TC-NET-902 | US-NET-002 | Host streams state for one round | A snapshot every 100 ms while a turn is live and every 500 ms when idle; a peer buffering more than 64 KB is skipped; a silent peer for 2 s is reported | e2e | FR-05 |
| TC-NET-903 | US-NET-003 | New host adopts the previous snapshot | `acceptSnapshot` refuses an older `hostGeneration` and a stale `seq`; an accepted snapshot restores players, weather and the turn clock; a snapshot that no longer fits the budget is rejected, not truncated | unit | FR-06 |
| TC-NET-044 | US-NET-004 | AC1 — Peer sends `snapshot_push` while not host | `error not-host`, `lastSnapshot` unchanged | worker | ADR-0004 |

## Match UI (MATCH)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-CORE-016 | US-CORE-010 | `room_settings` with mode `royale`, then with `mapId` `map-99` | Both refused `bad-request` naming the field, so an unknown mode never reaches `createMatch` | unit | FR-05 |
| TC-CORE-961 | US-CORE-010 | AC1 — mode `solo`, one team wiped | The match ends and the surviving team wins | unit | FR-06 |
| TC-CORE-962 | US-CORE-010 | AC6 — the result screen after a finished match | Names the mode and the condition that ended it, in the player's language | web | NFR-18 |
| TC-MATCH-901 | US-MATCH-001 | AC1 — mount the scene with a state | Map, units and turn indicator drawn; the ruler's division count matches `clamp(round(8 × visibleWidth / 1000), 8, 16)` with one ~125-unit division each | e2e | NFR-01 |
| TC-MATCH-151 | US-MATCH-002 | Drag aim and release | One `fire`, angle/force within ±2° / ±3 of the drawn values | e2e | FR-03 |
| TC-MATCH-902 | US-MATCH-002 | A second finger lands mid-pull | The pull is cancelled without firing and the camera gesture takes over | web | FR-03 |
| TC-MATCH-903 | US-MATCH-003 | AC1 — snapshot applied | HUD HP, wind and active slot equal the snapshot within 100 ms | web | NFR-02 |
| TC-MATCH-930 | US-MATCH-003 | AC11 — the four-way pad hangs on the active mobile, clamped inside the viewport, and the corner cluster is the fallback | web | FR-01, NFR-17 |
| TC-MATCH-931 | US-MATCH-003 | AC10 — the wind banner is shown once per `rolledAtRound`, lasts 1.5 s, dismisses on a tap | web | NFR-05, NFR-16 |
| TC-MATCH-932 | US-MATCH-003 | AC2 — the clock reads whole seconds from `deadlineAt` and never above `turnDurationMs` | web | FR-03 |
| TC-MATCH-950 | US-MATCH-003 | AC2 — the readout actually counts down | `apps/web/tests/match-wiring.test.tsx`: with the page mounted, the clock's text moves on its own within a second — a derived readout with no tick stayed frozen at `20s` | web | FR-03 |
| TC-MATCH-933 | US-MATCH-003 | AC1, AC5, AC8 — every seat shows HP, shield and delay (absolute for the active seat, signed for the rest); a wreck shows `0` and the marker | web | FR-01, FR-04 |
| TC-MATCH-904 | US-MATCH-003 | AC3 — active slot changes | Announced once through the polite live region in the active locale | e2e | NFR-16 |
| TC-MATCH-923 | US-MATCH-003 | AC6, AC9 — apply `weather` at `m = 0`, `m = 26` and a sector change | Dial draws 12 ticks with long cardinals, arrow at `directionDeg`, numeric 0–26, `0` renders the hollow grey dial, banner appears once per round and dismisses on tap | web | FR-04 |
| TC-MATCH-905 | US-MATCH-004 | AC1, AC2, AC4 — skip, and six phrases in one second | Skip sends one `skip` input and no chat; skip is disabled outside the turn; the third phrase onward is dropped locally | web | FR-07 |
| TC-MATCH-947 | US-MATCH-004 | AC3, AC6, AC7 — a phrase is an id, and its banner lasts 3 s (emote 1.5 s) | The frame carries `{kind, id}` and no `text`; the receiver translates the id into its own locale; an id outside the catalogue renders nothing and is reported once | web | FR-07 |
| TC-MATCH-948 | US-MATCH-004 | AC3, AC6 — the banner's place | The phrase hangs over the speaker's own chip and nowhere else, and is gone once the toast expires | web | FR-07 |
| TC-MATCH-949 | US-MATCH-004 | AC3, AC5, AC6, AC7 — a phrase from a peer, and a phrase from the host | Only the id crosses `control`; the receiver shows its own locale's string above the sender's chip; the host fans a peer's phrase out to the other peers and never back to the sender; a frame carrying free text is dropped | web | FR-07 |
| TC-CORE-963 | US-MATCH-004 | AC5, AC7 — the catalogue is the wire contract | Twelve phrases and eight emotes, each id once, no id in both kinds, and an id is accepted only for its own kind | unit | FR-07 |
| TC-MATCH-006 | US-MATCH-005 | AC4, AC5, AC6 — item tray with no items, and a loadout of 12 | Empty state with no dead buttons; the 12th item is refused | e2e | `data/items.md` |
| TC-MATCH-934 | US-MATCH-003 | AC4 — every HUD target at 844×390 | tap floors and gaps: ≥ 44×44 for every control, 60×60 for fire and skip, ≥ 8 px between them, measured by the `TC-PWA-160` sweep | manual | NFR-17 — run by `TC-PWA-160`, recorded in `evidence/US-MATCH-003/README.md` |
| TC-MATCH-935 | US-MATCH-003 | AC7 — the HUD at 200 % text size | no number clipped and the canvas keeps its aspect at 844×390 with the browser text size doubled | manual | NFR-17 — run by `TC-PWA-159`, recorded in `evidence/US-MATCH-003/README.md` |
| TC-MATCH-936 | US-MATCH-002 | AC1, AC2, AC3, AC4, AC5, AC6, AC8 — one release becomes exactly one `fire`; the ring is a gradient arc from −90° · unit | `apps/web/tests/aim-fire.test.tsx` (TC-MATCH-936) |
| TC-MATCH-937 | US-MATCH-002 | AC7, AC8 — aiming is refused out of turn, when wrecked and after one shot · unit | `apps/web/tests/aim-fire.test.tsx` (TC-MATCH-937) |
| TC-MATCH-938 | US-MATCH-002 | AC2 — the ring and the number update within 16 ms of a pointer move · manual | device trace at UAT (iPhone 12, Galaxy A52) |
| TC-MATCH-939 | US-MATCH-006 | AC5, AC7, AC8 — ▲ dims at `angleMax` and ▼ at `angleMin`; a hold stops when the turn ends · unit | `apps/web/tests/direction-pad.test.tsx` (TC-MATCH-939) |
| TC-MATCH-906 | US-MATCH-005 | AC1, AC2, AC3 — select weapon 2 (slot 1), spend the super shot | The pressed slot changes and the caller receives that slot; the super shot then disables | web | FR-03 |
| TC-MATCH-941 | US-MATCH-005 | AC2 — the aim aid follows the selected slot | The aid reports that slot and its blast radius, and carries the angle and force the fire input carries | web | FR-03 |
| TC-MATCH-942 | US-MATCH-005 | AC7 — the loadout read by a screen reader | Each tray item names itself with its quantity and delay cost, and a spent item still reads `×0` | web | NFR-16 |
| TC-MATCH-943 | US-MATCH-005 | AC2 — the aim aid on a real screen | One finger pulls: the dots follow that weapon's flight and the ring at the landing point is its blast radius | manual | FR-03 |
| TC-MATCH-944 | US-MATCH-005 | AC2 — the strip's slot and the pad's nudge reach the renderer | The mocked scene receives `setWeaponSlot(1)` after the strip tap and `setAimDelta(1)` after the pad's ▲ | web | FR-03, NFR-02 |
| TC-MATCH-907 | US-MATCH-006 | AC1, AC2, AC3, AC6, AC8 — Tap and hold ◀ ▶, exhaust the move budget, end the turn while held | Unit walks 8 px per 100 ms with live energy, the badge decrements to `0` and disables the control, no stray move after the turn ends, and a touch starting on the pad never becomes an aim pull | e2e | FR-03 |
| TC-MATCH-915 | US-MATCH-002 | Pull `powerDragFull`, then half of it | Ring reads `4.0` and `2.0` ±0.1, `force = power × 25` = 100 and 50, gradient runs clockwise from −90° | web | FR-03 |
| TC-MATCH-916 | US-MATCH-002 | Release at `power 0.2`, `pointercancel` mid-pull, two-finger pan mid-pull | Nothing is sent in any of the three cases, the ring animates back to zero, one hint per case | web | FR-03 |
| TC-MATCH-917 | US-MATCH-006 | AC4, AC5 — Tap ▲ three times, hold ▼ for 1 s, hold ▲ at `angleMax` | Angle rises 3°, falls ~10° while held, stops at the band edge with the control dimmed, chip matches | web | FR-03 |
| TC-MATCH-918 | US-MATCH-007 | AC2, AC4 — Load the scene on a 5:3 screen and on a 2.7:1 phone, pan to each map edge | Window is 1000 × 600 ±1 % on 5:3 and keeps its 600 units of height with the width following the aspect on a wider screen (so nothing is cropped and the shooter's feet sit 70 % down the frame); panning stops at the bounds and never shows void | web | FR-03 |
| TC-MATCH-919 | US-MATCH-007 | AC3, AC7 — Pinch in and out past both limits, then release | Zoom stays within `zoomMax` (250 × 150) and `zoomMin` (whole map), scales about the midpoint, keeps the final window | web | FR-03 |
| TC-MATCH-920 | US-MATCH-007 | AC5, AC8 — Zoom from default to whole map and back, reading the ruler each step | Segments go 8 → 16 and back, each labelled with `visibleWidth / segments`, 125 units at both ends | web | FR-03 |
| TC-MATCH-921 | US-MATCH-007 | AC1 — First tap on the canvas, with and without the Fullscreen API | `requestFullscreen()` is asked once on the first pointer-down where the API exists, never at mount; a missing API or a refusal (iPhone Safari) leaves the page usable and the layout fills the viewport; a real device with and without the API is `TC-MATCH-945` | web | FR-03 |
| TC-MATCH-922 | US-MATCH-007 | AC6 — Zoom to `zoomMax` and to `zoomMin` with the pad and ring visible | Pad ring stays 96 px, buttons 60 px, ring radius 64 px, roster unchanged at both zooms | web | NFR-17 |
| TC-MATCH-945 | US-MATCH-007 | AC1 — first tap on an iPhone Safari and on an Android device | iPhone fills the viewport with safe-area insets and no `apple-mobile-web-app-capable` meta; Android asks once and hides the browser bar | manual | FR-03 |
| TC-MATCH-946 | US-MATCH-007 | AC3, AC7 — two real fingers: pinch past both limits, pan to each edge, release | The window keeps its place after the fingers lift (no snap-back), the ruler reads 125 units per division at both ends, and nothing is sent to the host | manual | FR-03 |
| TC-MATCH-924 | US-MATCH-001 | AC2 — two snapshots 100 ms apart, read at 0, ¼, ½, ¾ and 1 of the blend | A unit sits halfway at half the interval, never moves backwards or off its segment, `hp`/`facing`/`eliminated` come from the newest snapshot, an eliminated unit snaps to where it died, and the first frame after a mount starts where the state says | web | FR-01, NFR-01 |
| TC-MATCH-925 | US-MATCH-001 | AC6 — one mobile at HP 0 in a three-mobile roster | It keeps its cell and its order, is labelled `match.eliminated` instead of printing its hp, and only the active slot carries `match__player--active` | web | NFR-17 |
| TC-MATCH-926 | US-MATCH-001 | AC7 — the state goes `ended` while the renderer is mounted | `destroy()` is called, the `gbw.result` payload is written once (with `winCondition`) and the route lands on the results screen; the clock and the bot stop on `status !== "playing"` | web | `NFR-03` |
| TC-MATCH-927 | US-MATCH-001 | AC3 — eight mobile players, 30 s, iPhone 12 + Galaxy A52 in landscape | The scene holds 60 FPS ±5 with the HUD live; the procedure is in `docs/05-quality/evidence/US-MATCH-001/README.md` and has not been run on a device yet (`TC-OPS-180` is the `US-OPS-004` FPS case) | manual | `NFR-01` |
| TC-MATCH-928 | US-MATCH-001 | AC4 — an 844 × 390 landscape viewport | The canvas fills the viewport behind the overlay HUD and the page never scrolls sideways (`TC-FND-133`), the camera window takes the canvas aspect with its height fixed (`TC-MATCH-918`), and the active mobile's feet sit 70 % down the frame | web | `NFR-17` |
| TC-MATCH-929 | US-MATCH-001 | AC5 — a portrait device | The scene does not start and the rotate notice from `US-PWA-003` is shown instead (`TC-PWA-063` covers the gate itself) | manual | `NFR-17` |


## Ranked (RANK)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-RANK-110 | US-RANK-001 | AC1 — the host submits a finished match | `201`; one `match_record` with its `match_player` rows in a single `batch()`, and the response's `ratings[]` is exactly `{accountId, before, after, delta}` | worker | FR-07 |
| TC-RANK-111 | US-RANK-001 | AC2 — the same `matchId`, or the same `Idempotency-Key`, arrives twice | `409 match-already-recorded` with no second row and no second rating change; the key replays the first `201` instead | worker | `data/matches.md` |
| TC-RANK-117 | US-RANK-001 | AC2 — the same room and start time submitted under a new `matchId` | `409` whose error names the match already stored; one `match_record`, four `rating_history` rows | worker | `data/matches.md` |
| TC-RANK-112 | US-RANK-001 | AC3 — a participant who is not the room's host submits | `403 not-host`, nothing written; the room's own `/state` is what names the host | worker | NFR-11 |
| TC-RANK-118 | US-RANK-001 | AC3 — a real room: host mints it, a peer takes the second seat and submits | `403 not-host` and an empty `match_record`, while the same payload from the host lands | worker | NFR-11 |
| TC-RANK-115 | US-RANK-001 | AC4 — a payload the contract refuses | `422 validation` naming the field: short duration, one player, uneven teams, `hits > shotsFired`, a duplicated slot, a `winnerTeam` outside `A`/`B`, a guest token | worker | `data/matches.md` |
| TC-RANK-119 | US-RANK-001 | AC5 — a team with no account (two guests) | `ranked: false`, `rankedReason: "guest"`, `ratings: []`, `ranked_reason` stored, `match_player` rows only for the signed-in team with `rating_before`/`rating_after` NULL, no `rating_history` | worker | roles |
| TC-RANK-121 | US-RANK-001 | § 5 — damage above 100 × shots fired | Stored as sent (`201`), and exactly one `implausible_stats` warn line naming the slots and the room (`OQ-30`) | worker | OQ-30 |
| TC-RANK-120 | US-RANK-001 | AC7 — two submissions race for one room | One `201` and one `409`, exactly one `match_record` and four `rating_history` rows — the unique index decides, not a read the other call can pass | worker | `data/matches.md` |
| TC-RANK-058 | US-RANK-002 | AC5 — a bot seat, an abandoned match, a stale ruleset | `isRanked()` is false for each and true only for a clean match; the route side of AC5 is `TC-RANK-116` | worker | NFR-14 |
| TC-RANK-113 | US-RANK-002 | AC1, AC2 — Elo with equal ratings, and a 1400 team against a 1200 team | Δ = ±16 at K = 32 on equal teams; `expectedScore` uses the opponent average; a draw moves neither side; `delta` is always an integer | unit | OQ-28 |
| TC-RANK-114 | US-RANK-002 | AC3 — K switch once `rated_matches` reaches 30 | K = 16 from the next match after that point, and a settled player's delta uses their own K, not the opponent's | unit | OQ-28 |
| TC-RANK-158 | US-RANK-002 | AC2 — team A averages 1400, team B 1200 | A gains `+8` and B loses `-8`; the stored rows read `1400 → 1408` and `1200 → 1192`, and both profiles carry the same value | worker | `data/matches.md` |
| TC-RANK-159 | US-RANK-002 | AC3 — one player at 30 rated matches beside a newcomer | The settled winner moves `+8` while the newcomer on the same team moves `+16`, and `rated_matches` becomes 31 | worker | OQ-28 |
| TC-RANK-160 | US-RANK-002 | AC4 — a 1v1 at 3999 won, and a 1v1 at 3 lost | `rating_after` clamps to `4000` with `delta: 1`, and to `0` with `delta: -3`, so `rating_before + delta = rating_after` at both edges | worker | `data/matches.md` |
| TC-RANK-161 | US-RANK-002 | AC6 — a second `rating_history` row for one `(account_id, match_id)`, then a replay of the recorded match | The insert is refused by `UNIQUE (account_id, match_id)`; the replay is `409` and leaves four history rows and the same four ratings | worker | `data/matches.md` |
| TC-RANK-162 | US-RANK-002 | AC7 — a 2v2 with a guest on team B, team B rated 1000 against team A's 1200 | `ranked: true`; each side averages its own registered seats, so the three players move `+8/+8/−8` (a guest counted at 1200 would make it ±12), and the guest seat gets no `rating_history` and no `match_player` row | worker | roles |
| TC-RANK-141 | US-RANK-003 | AC1 — thirty matches read with `?limit=20` | `200` with 20 items newest first (`match-0029` … `match-0010`), a `next_cursor` and `has_more: true`; the caller's own row only | worker | `data/matches.md` |
| TC-RANK-142 | US-RANK-003 | AC2 — the returned cursor is followed | The second page holds the remaining 10 in order, `has_more: false`, `next_cursor: null`, no repeat and no gap across 20 + 10 | worker | `data/matches.md` |
| TC-RANK-143 | US-RANK-003 | AC3 — the caller lost a rated match | The item carries `result: "loss"`, `playerCount: 4`, the caller's own damage and a negative `ratingDelta`, with `ranked: true` and `rankedReason: null` | worker | FR-07 |
| TC-RANK-148 | US-RANK-003 | AC4 — an unranked row | `ranked: false`, `rankedReason: "ruleset_mismatch"`, `ratingDelta: null` — no rating number on the wire | worker | `data/matches.md` |
| TC-RANK-149 | US-RANK-003 | AC5 — the whole response body, not just the item | No other account id and no other player's rating anywhere in the JSON; `opponents[]` entries are exactly `{displayName, team}` | worker | NFR-13 |
| TC-RANK-150 | US-RANK-003 | AC6 — `?accountId=` is supplied | The parameter is ignored: the caller still reads their own row (their team, their damage) | worker | NFR-13 |
| TC-RANK-151 | US-RANK-003 | § 5 — a cursor the server did not mint | `400 bad-request`, never a page and never a 500 | worker | `matches.md` |
| TC-RANK-152 | US-RANK-003 | AC3, AC4 — the row the profile screen prints | `apps/web/tests/profile.test.tsx`: result label, `2v2`, the opponents' names, `240 dmg`, `+16`; an unranked row prints `—` and why, never `+0` | web | `screens/profile.md` |
| TC-RANK-104 | US-RANK-004 | AC1, AC2 — 150 rated players, then two with an equal rating and an equal rated match count | `?limit=100` answers 100 items ordered by rating, then rated matches, then account id, with page two continuing at rank 21, and the tie-break lands `acct-aaa` before `acct-bbb` on every request; a deleted account and an unrated account are absent; an unreadable cursor is `422`, never a `500` | worker | `data/accounts.md` |
| TC-RANK-144 | US-RANK-004 | AC3 — a signed-in player ranked 42nd of 50, and one ranked on the fetched page | `you` is `{rank: 42, rating}` on the wire; the screen tints the on-page row with `aria-current`, and for the off-page caller shows a sticky footer reading `#42` with the rating and no tinted row | worker, e2e | `screens/leaderboard.md` |
| TC-RANK-145 | US-RANK-004 | AC4 — 9 rated matches beside 10 | `Mới` on the 9 only, in both the unit render and the browser | web, e2e | `screens/leaderboard.md` |
| TC-RANK-146 | US-RANK-004 | AC5 — a name containing `<b>`, and a 20-grapheme name | The markup prints as characters (no element is built from it) and the long name is clipped to 16 graphemes plus `…`; a ZWJ emoji sequence survives whole | web, e2e | rule 06 § 2 |
| TC-RANK-147 | US-RANK-004 | AC7 — signed out, and with a token the server cannot read | The list renders with no redirect and no `/api/v1/me` request, and the footer is absent; on the wire `you` is `null` and the page is still `200` | worker, e2e | roles |
| TC-RANK-163 | US-RANK-004 | AC6 — two anonymous requests within 30 s, and a request that carries a session | The anonymous pair carries `Cache-Control: public, max-age=30` and `Vary: authorization, x-session-token` and is equal field for field (`request_id` is per-request by design); the signed-in read answers `private, no-store`, so no cache may keep a page that names a rank | worker | `matches.md` |
| TC-RANK-164 | US-RANK-004 | AC1, § 5 — the first read fails and the retry succeeds; a board with no ranked player | The failure prints `Không tải được bảng xếp hạng.` with a `Thử lại` button, the retry refetches the first page (no cursor) and clears the message; the empty board prints the empty copy with a link back to `/` | web | `screens/leaderboard.md` |
| TC-RANK-153 | US-RANK-005 | AC1, AC3 — a ranked result | Deltas shown equal the server values | e2e | `screens/results.md` |
| TC-RANK-154 | US-RANK-005 | AC2, AC7 — a guest or bot result | Unranked, no delta, reason stated | e2e | `screens/results.md` |
| TC-RANK-155 | US-RANK-005 | AC4 — `Chơi lại` after a finished match | Lobby with the same `maxPlayers`, or a new room when the code is closed | e2e | `screens/results.md` |
| TC-RANK-156 | US-RANK-005 | AC5 — browser Back from results | Does not re-enter the finished match (`web`: the handover replaces its own history entry) | web | `screens/results.md` |
| TC-RANK-157 | US-RANK-005 | AC6 — `409 match-already-recorded` during submit | Stored record shown, no retry loop | e2e | `screens/results.md` |

## PWA and i18n (PWA)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-PWA-043 | US-PWA-001 | AC1 — the worker installs and precaches the shell and the match | `tests/e2e/pwa-prod.spec.ts` on a production build: `navigator.serviceWorker.ready` reports the root scope, the cache holds `index.html`, a `.css`, the `MatchPage-*` chunk and the manifest, and the served bytes stay under the budget | e2e | NFR-21 |
| TC-PWA-044 | US-PWA-001 | AC2 — the cold load stays under the transfer budget and fetches no match chunk | `tests/e2e/pwa-prod.spec.ts`: summed `transferSize` of the cold load < 5 MB, no `MatchPage-*` request before the bot button is tapped, and clicking it is what fetches the chunk | e2e | NFR-03 |
| TC-PWA-045 | US-PWA-001 | AC5 — the update is offered once, and never mid-match | `apps/web/tests/update-prompt.test.tsx`: hidden until a build waits, "Cập nhật" applies it, dismissal applies nothing, `/match/:code` suspends it | web | NFR-21 |
| TC-PWA-046 | US-PWA-001 | AC6 — iOS opens a normal tab | `tests/e2e/pwa-shell.spec.ts`: the served HTML carries no `apple-mobile-web-app-capable`, and keeps `viewport-fit=cover`, the manifest link and the viewport | e2e | NFR-13 |
| TC-PWA-047 | US-PWA-001 | AC7 — the manifest is installable | `tests/e2e/pwa-shell.spec.ts`: name, short name, `display: fullscreen`, `orientation: landscape`, theme colour and the 192/512 icons, with both icons really served as PNG | e2e | NFR-21 |
| TC-PWA-064 | US-PWA-001 | AC3 — with the network off the menu renders and a bot match plays | `tests/e2e/pwa-offline.spec.ts` (menu and disabled server actions) and `tests/e2e/pwa-prod.spec.ts` on a production build: reload offline, "Play bot" reaches the battlefield, the turn clock runs and a pull charges power — all with `context.setOffline(true)` | e2e | NFR-21 |
| TC-PWA-139 | US-PWA-001 | AC4 — the match chunk carries no Clerk code | `tests/e2e/bundle.spec.ts`: no script served after a bot match contains Clerk | e2e | NFR-03 |
| TC-PWA-130 | US-PWA-002 | Every route in both locales at both landscape sizes | No overflow, no missing key, no untranslated string | e2e | NFR-18 |
| TC-PWA-162 | US-PWA-002 | 30 % text expansion fixture in `vi` and `en` | No overflow in the lobby and results layouts | e2e | NFR-18 |
| TC-PWA-063 | US-PWA-003 | AC3, AC4, AC5, AC6 — the portrait notice, the tablet-height floor, a rotation mid-match and a tall desktop window | Rotate notice with only the locale toggle; the battlefield keeps over 500 px at 1024 × 768; rotation keeps the canvas and the turn clock; 820 × 1180 also gets the notice | e2e | `US-PWA-003` AC3, AC4, AC5, AC6; NFR-19 |
| TC-PWA-190 | US-PWA-004 | AC7 — focus moves into the mounted route | The route's `h1` takes focus on mount, and again on the next navigation | web | NFR-16 |
| TC-PWA-131 | US-PWA-004 | Route change with keyboard focus | Focus moves to the route `h1` on every navigation, including back — never stays on the control that is gone | e2e | NFR-16 |
| TC-PWA-158 | US-PWA-004 | axe-core on every route, both locales | Zero WCAG 2.2 AA violations | e2e | NFR-16 |
| TC-PWA-159 | US-PWA-004 | 200 % font size on lobby and results | No clipped text, no overlap | e2e | NFR-16 |
| TC-PWA-160 | US-PWA-004 | Computed touch-target sizes on match and lobby | Every target ≥ 44 px, fire/skip ≥ 60 px, gaps ≥ 8 px | e2e | NFR-17 |
| TC-PWA-161 | US-PWA-004 | Keyboard-only tab order on menu, lobby, results | Visible focus, logical order, no trap outside dialogs | e2e | NFR-16 |

## Ops (OPS)

| ID | Story | Case | Expected | Level | Covers |
|----|-------|------|----------|-------|--------|
| TC-OPS-118 | US-OPS-001 | Log line for a completed request | JSON with `request_id`, `route`, `status`, `duration_ms`, no token or name | worker | NFR-24 |
| TC-OPS-173 | US-OPS-001 | Failing request log, searched for secrets | No token, cookie, display name or email present | worker | NFR-12 |
| TC-OPS-901 | US-OPS-002 | Every SLO in `slo.md` becomes a snapshot row | Four rows, each naming its `NFR-nn` | unit | `scripts/slo-snapshot.mjs` |
| TC-OPS-903 | US-OPS-002 | A metric the source cannot answer | The row reads `no data` and the file is a breach | unit | `08-ops/slo.md` § 2 |
| TC-OPS-904 | US-OPS-002 | A clean day and a breaching day | Clean exits 0; a breach marks only its own row and exits non-zero | unit | `08-ops/slo.md` |
| TC-OPS-905 | US-OPS-002 | A target that cannot be read | Counted as a breach, never as an assumed pass | unit | `08-ops/slo.md` |
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
| TC-FND-132 | US-FND-003 | AC4 — a `500` with a `request_id` | The banner shows the translated line and `Mã lỗi: <id>`, with no body, SQL or stack | web | NFR-24 |
| TC-FND-134 | US-FND-003 | AC3 — `en` survives a reload | The stored `gbw.locale` wins on the next start and the choice is written back under the same key | web | AC3 |
| TC-FND-133 | US-FND-003 | AC6 — 844×390 and 1024×768 | No horizontal scroll and every control at least 44 px outside the canvas | e2e | NFR-17 |
| TC-FND-131 | US-FND-003 | AC1, AC2, AC5 — a direct URL (`/lobby/ABC234`, `/match/ABC234`) renders the shell and the locale toggle | Shell renders without a 404 and the toggle switches VI↔EN | web | `US-FND-003` AC1, AC2, AC5 |
| TC-MATCH-914 | US-MATCH-002 | Drag distance maps to the power ring radius | Radius grows with the pull and stops at the maximum | web | `US-MATCH-002` §4 |
| TC-MATCH-190 | US-MATCH-008 | AC1 — the match page fits the size rule | `apps/web/src/routes/MatchPage.tsx` ≤ 400 lines and no file under `apps/web/src/routes/` > 500, asserted by `tests/meta/file-size.test.ts` | web | NFR-16 |
| TC-MATCH-191 | US-MATCH-008 | AC2 — the split changes no behaviour | The whole Vitest and Playwright suites pass with no edit to an assertion | web | NFR-16 |
| TC-MATCH-911 | US-MATCH-002 | AC1 — one finger, two meanings | Press and drag on the battlefield without holding, then press, hold past `HOLD_MS` and drag | A press that travels more than `HOLD_SLOP_PX` before the hold fires pans the window and never fires (power stays `0.00`); a press held still arms the pull, prints the ring and the power number, and fires on release; once armed the finger aims and the camera stops | web | FR-02 |
| TC-MATCH-910 | US-FND-003 | AC1 — the shell bar on a game route | Open a bot match in landscape | `.shell__bar` is absent, the canvas starts at y=0 and is as tall as the viewport, exactly one `locale-toggle` exists inside the match HUD with a ≥44 px tap target that a hit test resolves to it, and tapping it switches the language without leaving the match | e2e | FR-01 |
| TC-MATCH-909 | US-MATCH-007 | AC1 — fullscreen keeps the HUD | Pull once in a bot match, then hit-test the aim-aid control | The first pull may enter fullscreen, the fullscreen element contains the HUD (`.match`, never the bare canvas), and `elementFromPoint` at the aid's centre is the aid button | e2e | FR-06 |
| TC-MATCH-908 | US-MATCH-005 | AC2 — the trajectory aid is opt-in | Open a bot match on a fresh device, toggle the aid, reload | The `aim-aid` control reports `aria-pressed=false` at first, flips to `true` on tap, still reports `true` after a reload, and flips back | e2e | FR-06 |
| TC-MATCH-900 | US-MATCH-003 | AC10 — the live region reports the shot, not only the turn | After a fired pull the polite region contains a shot sentence (`match.announce.hit`/`miss`), not the turn announcement it opened with | e2e | NFR-17 |
| TC-NET-045 | US-NET-004 | A peer sends `team_assign`; the host sends it after the start | `not-host` while a peer, `invalid-state` once playing; the roster is unchanged | worker | `US-NET-004` §2 roster |
| TC-NET-066 | US-NET-004 | A socket signals itself, then signals a seated member with no socket | `bad-request`, then `peer-not-connected`; no frame is relayed | worker | `US-NET-004` §3 `signal` |
| TC-NET-067 | US-NET-004 | AC2 — Fire from a non-active slot | Ignored + `error unsupported-message` | worker | FR-02 |
| TC-NET-011 | US-NET-004 | AC6 — A peer sends `snapshot_push` while not host | One structured line carries `request_id`, `room_code`, `code: not-host` and the authenticated `player_id`, and no part of the payload | worker | NFR-24 |
| TC-NET-015 | US-NET-004 | AC3 — A socket that never sent `auth` sends `snapshot_push` | Closed with 4401, and the roster is exactly as it was | worker | `api/signaling.md` § 2 |
| TC-NET-016 | US-NET-004 | AC5 — A frame carries a `playerId` that is not the sender's | The socket's authenticated identity wins; the claim is ignored | worker | NFR-11 |
| TC-NET-012 | US-NET-004 | AC4 — A peer receives a snapshot from the host that lost the election | Dropped and counted in the `rejected_snapshot` counter; the current host's snapshot still lands | web | ADR-0004 |
| TC-NET-013 | US-NET-004 | AC4 — A support check reads the counter after a reported flicker | The count matches the drops the client actually made | manual | NFR-24 |
| TC-PWA-152 | US-PWA-003 | AC1, AC2 — the page is squeezed into portrait, then rotated to landscape | Portrait shows the rotate gate with the hint, landscape shows the match | web | `US-PWA-003` AC1, AC2 |
| TC-ROOM-025 | US-MATCH-004 | A preset phrase and a free text are sent, then an empty, unknown-kind or 121-char frame | The two valid frames parse; the three invalid ones are refused with the limit in `detail` | unit | `US-MATCH-004` §4 `chat` |
| TC-ROOM-053 | US-ROOM-001 | A room runs past 24 h from its creation but not from its match start | The cap is measured from the match start; the room survives until then | worker | `room-state.md` expiry |
| TC-ROOM-054 | US-ROOM-002 | Two snapshots are pushed in a row | Only the newest is stored, under its own key, and the older `seq` is dropped | worker | `room-state.md` snapshot |
| TC-ROOM-057 | US-ROOM-004 | Every member of one team loses its socket, then all but one | The team forfeits only when every member is disconnected | worker | `US-ROOM-004` AC3 |
| TC-ROOM-058 | US-NET-002 | The host pushes a snapshot, then replays an older `seq` | Each other member receives it once; the stale push is dropped without an error | worker | `US-NET-002` AC1 |
| TC-ROOM-061 | US-ROOM-005 | AC2 — the host leaves and the election promotes a peer | `host_changed` hands over the newest snapshot and the bumped generation | worker | `US-ROOM-005` AC2 |
| TC-ROOM-062 | US-ROOM-002 | A member sends `leave` | `peer_left` is announced and the roster shrinks | worker | `US-ROOM-002` §3 |
| TC-ROOM-063 | US-ROOM-002 | AC1 — a new socket authenticates into a lobby | The others get `peer_joined`; the newcomer gets `room_state` with its own slot | worker | `US-ROOM-002` AC2 |
| TC-ROOM-064 | US-NET-001 | A client sends `ping {at}` | `pong` carries the client's `at` and the host's `now` | worker | `signaling.md` §2 heartbeat |
| TC-ROOM-065 | US-NET-001 | Eleven pings, then twenty-one signals, in one second | The frame past the budget is refused once and the socket closes `4429` | worker | `signaling.md` § Budgets |
| TC-ROOM-070 | US-ROOM-006 | AC3 — TURN credentials are requested from a Worker with no TURN key | `200` with the public STUN entry and `turn: false` | worker | `US-ROOM-006` AC2 |
| TC-ROOM-129 | US-ROOM-004 | A member reconnects, and a lobby slot is freed | The reconnecting member keeps its slot; the freed slot goes to the next joiner | worker | `US-ROOM-004` AC1 |
| TC-ROOM-146 | US-ROOM-003 | AC6 — a team is assigned more members than `maxPlayers / 2` | `bad-request`; the roster is unchanged | worker | `US-ROOM-003` §4 capacity |
| TC-ROOM-155 | US-ROOM-001 | A room is created | It starts in the lobby and arms the ten-minute idle alarm | worker | `room-state.md` § Started |
| TC-ROOM-156 | US-ROOM-003 | `team_assign` and `peer_joined` arrive in the lobby | The status stays `lobby` | worker | `workflow-state-machine.md` guard |
| TC-ROOM-157 | US-ROOM-003 | AC3 — `start_match` succeeds | Slots, teams and status satisfy the playing invariant | worker | `US-ROOM-003` AC4 |
| TC-ROOM-158 | US-NET-002 | A snapshot arrives while playing | The room stays `playing` and exactly one snapshot is stored | worker | `US-NET-002` AC1 |
| TC-ROOM-159 | US-ROOM-004 | Every member's grace window expires | The room becomes `abandoned` | worker | `workflow-state-machine.md` playing→abandoned |
| TC-ROOM-160 | US-ROOM-004 | An abandoned room is left idle, and a second start is attempted | The room is deleted, refuses joins, and cannot be restarted | worker | `workflow-state-machine.md` abandoned |
| TC-ROOM-161 | US-ROOM-003 | The lobby is re-entered once the match is playing | Refused; the room stays `playing` | worker | `workflow-state-machine.md` guards |
| TC-ROOM-190 | US-ROOM-001 | AC8 — a room left idle for eleven minutes | The alarm deletes the record and a cold object accepts the six characters again | worker | `room-state.md` § expiry |
| TC-ROOM-191 | US-ROOM-005 | AC3 — the promoted host never becomes live | One retry with the next candidate, then `abandoned`; never hostless | worker | `US-ROOM-005` AC3 |
| TC-ROOM-192 | US-ROOM-006 | AC6 — a signal to a member that left | `peer-not-connected`; the sender stays connected and still pings | worker | `signaling.md` §2 `signal` |
| TC-ROOM-193 | US-ROOM-003 | AC4 — the start button as the roster changes | Disabled until every slot is filled and the teams are equal; enabled on 2A/2B | web | `US-ROOM-003` AC4 |
| TC-ROOM-166 | US-ROOM-003 | AC3 — `match_started` after a host start | Carries the chosen mode, map and each assignment's loadout | worker | `api/signaling.md` § 3 |
| TC-ROOM-194 | US-ROOM-005 | AC4 — the replaced host returns inside grace | Seated as a plain player; its `snapshot_push` is `not-host` and stores nothing | worker | `US-ROOM-005` AC4 |
| TC-ROOM-195 | US-ROOM-002 | AC4 — two clients in one room | Both are handed the same roster, slots and teams | worker | `US-ROOM-002` AC4 |
| TC-ROOM-196 | US-ROOM-006 | AC4 — a full mesh handshake and traffic | No ICE credential, TURN username or token in `localStorage`, `sessionStorage` or cookies | web | NFR-10 |
| TC-ROOM-197 | US-ROOM-006 | AC5 — the offer exchange after `match_started` | One answer per offer, on the connection the host already opened | web | `US-ROOM-006` AC5 |
| TC-ROOM-198 | US-ROOM-006 | AC5 — a peer joins while the room is still in the lobby | No `signal` and no `snapshot_push` frame until the match starts | web | `US-ROOM-006` AC5 |
| TC-ROOM-199 | US-ROOM-002 | AC7 — a lobby that lost its last member | Sixty seconds later the alarm deletes the record; the room is closed | worker | `US-ROOM-002` AC7 |
| TC-ROOM-200 | US-ROOM-004 | AC3, AC7 — the turn of a slot in `grace` or `disconnected` | Skipped by the host at the next tick, without waiting out its clock; a guest never advances a remote turn, but still advances its own expired one | web | `US-ROOM-004` AC3, AC7 |
| TC-ROOM-201 | US-ROOM-004 | AC2, AC5 — a replayed `snapshot_state` | The returning client shows the host's hp, active slot and wind; a snapshot from a superseded `hostGeneration` is dropped | web | `US-ROOM-004` AC2, AC5 |
| TC-ROOM-202 | US-ROOM-004 | AC1 — a socket closes mid-match | `connectionState` becomes `grace`, peers receive `peer_left {reason:"grace"}` and the 20 s alarm is armed | worker | `US-ROOM-004` AC1 |
| TC-ROOM-203 | US-ROOM-004 | AC2 — a member reconnects with a valid token | It receives `room_state` and then the last `snapshot_state` before any new turn | worker | `US-ROOM-004` AC2 |
| TC-ROOM-707 | US-ROOM-007 | AC1, AC3–AC6 — the host picks mode, map, capacity and a loadout; a peer changes one | The host's choice reaches every member; the peer's frame is refused | web | `US-ROOM-007` AC1–AC4 |
| TC-ROOM-708 | US-ROOM-007 | AC7 — a `loadout` frame carries the mobile | Stored on the member, echoed in `room_state`, a duplicate pick accepted, either half standing alone without undoing the other, and an unknown id, an empty frame or one past the 1 KB budget refused | worker | `data/mobiles.md` |
| TC-ROOM-709 | US-ROOM-007 | AC7 — the lobby's mobile grid | Every mobile once with both team tints; a pick is a `loadout` frame; the member record wins over an optimistic pick | web | `screens/lobby.md` |
| TC-ROOM-710 | US-ROOM-007 | AC7 — one guest identity per page load | Two callers before the first mint lands share one session, so the seat and its socket agree | web | `api/accounts.md` |
| TC-ROOM-711 | US-ROOM-007 | AC2 — a host starts a match | `match_started` carries the mode, the map and the mobile each member picked | worker | `api/signaling.md` |
| TC-ROOM-712 | US-ROOM-007 | AC7 — lobby write budget | Eleven item taps plus a mobile tap in one second pass; a twenty-first write in one second is refused `rate-limited` and the last accepted write survives | worker | `api/signaling.md` |
| TC-ROOM-713 | US-ROOM-007 | AC7 — one join per page load | A `StrictMode` double mount posts `join` once and opens the room socket on the seat it got | web | `api/accounts.md` |
| TC-ROOM-700 | US-ROOM-008 | AC1 — the room object fits the size rule | `apps/worker/src/room-do.ts` ≤ 400 lines, with budgets, election and recording in their own modules under `apps/worker/src/room/` | worker | NFR-16 |
| TC-ROOM-701 | US-ROOM-008 | AC2 — the split changes no behaviour | Every `apps/worker/tests/room-*.ts` file passes unchanged | worker | NFR-16 |
