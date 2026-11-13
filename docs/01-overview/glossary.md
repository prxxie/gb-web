# Glossary

Every domain term and status value, with the identifier it carries in code and in the database. Agents use the
**Code name** column verbatim — do not invent a synonym (`match` vs `game`, `room` vs `lobby`).

| Term | Meaning | Code name | Notes |
|------|---------|-----------|-------|
| Account | A registered identity, created on first successful sign-in | `account` table, `account.accountId` | Clerk is the identity authority; `account.clerkUserId` is its `sub` (`ADR-0002`) |
| Profile | The public face and rating of an account | `profile` table | Split from `account` so the leaderboard query never touches identity columns |
| Rating | Elo score used for ranks, server-computed only | `profile.rating`, integer, default `1200` | Never accepted from a client (`ADR-0003`, `OQ-28`) |
| Rated match | A match whose result changes rating | `matchRecord.ranked` = `1` | Requires every participant to be registered; bot and guest matches are unranked |
| Guest player | An unregistered player who joined a room | `guestId` (uuid, memory/localStorage only) | No server record, no rating; can play, cannot be ranked |
| Room | One lobby that becomes one match | `room` concept; Durable Object `Room`; `roomCode` | The DO is named by code: `idFromName(roomCode)` |
| Room code | Six-character join code shared by the host | `roomCode`, `^[A-HJ-NP-Z2-9]{6}$` | No `I`, `O`, `0`, `1` to avoid reading errors (`OQ-04`) |
| Lobby | The pre-match state of a room where players gather and teams are set | `RoomState.status = 'lobby'` | Screen: `lobby` |
| Host | The peer that runs the authoritative simulation and relays snapshots | `hostPlayerId` | Chosen by the DO; migrates on disconnect (`ADR-0004`) |
| Peer | Any non-host player in the room | `members[].role = 'peer'` | Sends input on `control`, receives `state` |
| Member | One player slot inside a room | `RoomState.members[]`, `slot` 0–7 | `slot` is the stable in-room index; `playerId` is per-connection |
| playerId | Per-connection player identifier minted at `join` | `playerId` (uuid) | A reconnect gets a new `playerId` with the same `accountId`/`guestId` |
| Slot | Position 0–7 in a room; fixed once the match starts | `slot` | Teams are `A`/`B`; slots of one team need not be contiguous |
| Team | One of the two sides | `team` ∈ `'A' \| 'B'` | No free-for-all (`OQ-16`) |
| Match | One played game inside a room, from `match_started` to `match_end` | `matchRecord` table, `matchId` (uuid) | Recorded server-side even when unranked |
| Turn | One player's chance to fire | `turn` object in the simulation state: `{ activeSlot, number, round, deadlineAt }` | Source concept; see `02-reference/api/signaling.md` |
| Round | One full pass through the turn queue — every player has acted once | `turn.round` (starts at 0) | The weather re-rolls on every round boundary |
| Turn timer | Time limit for a turn | `turnDurationMs` = `20000` | `OQ-03`; GunBound's 60 s was too slow for 3–8 min matches |
| Skip turn | Passing without firing | `input.kind = 'skip'` | Allowed only on your turn |
| Shot | One projectile fired by a player | `shot` record inside the snapshot | Deals damage on impact |
| Angle | Aim direction in degrees, 0 = right, 90 = up | `angle` (0–180, quantised to 1°) | Input field |
| Force | Power of the shot, 0–100 | `force` (0–100, quantised to 1) | Source multiplied by 512 in the velocity formula; the tunable keeps 0–100 and the formula applies the scale |
| Wind | Weather force applied to a projectile, as a magnitude and a direction | `wind: { magnitude, directionDeg, sector }` — `magnitude` 0–26, `directionDeg` a multiple of 30 (12 sectors), `sector` 0–11 | `OQ-41`; replaces the source's `wind: {x, y}` + `windMultiplier` |
| Weather | The wind state of the current round | `weather: { wind, rolledAtRound }` | Re-rolled when `turn.round` increments, announced once |
| Sector | One of the 12 divisions of the wind dial | `sector` 0–11, `directionDeg = sector × 30` | Ticks on a 360° dial, so a shot can be judged to ±30° |
| Gravity | Downward acceleration of a projectile, `u/s²` | `tunables.gravity` = `100` default, `85–120` per map, × profile `1.00–1.15` | The source's `0.35`-per-tick value cannot coexist with its `2,000`-unit map (`tunables.md` § 1.1) |
| HP | Hit points of a player | `member.hp`, `maxHp` = `100` | 0 = eliminated for the rest of the match |
| Blast damage | Damage from an explosion, scaled by distance | `damage = round(baseDamage * (1 - dist / blastRadius))` | Base/radius live in the tunables (`OQ-02`) |
| Solver | The flat-ground closed form of the shot — bar from distance, distance from bar, flight time for either | `solver` module (`barForDistance`, `distanceForBar`, `timeForShot`) | The practice screen's engine (`US-BAL-007`); never imported by the match route, and it ignores terrain by construction. Not to be confused with the **resolver** (the 25 ms integrator) |
| Snapshot | Full simulation state broadcast by the host | `snapshot` message on the `state` channel | Also the migration unit |
| Input packet | One player's action for the current turn | `input` message on the `control` channel | Reliable + ordered |
| Control channel | Reliable, ordered WebRTC data channel | `control` (`ordered: true`) | Input, events, chat |
| State channel | Unreliable, unordered data channel | `state` (`maxRetransmits: 0`) | Snapshots only |
| Signaling | Pre-WebRTC exchange of offers, answers and ICE candidates | `signal` message over the room WebSocket | Relayed by the DO, never interpreted |
| Host migration | Transfer of authority when the host disconnects | `host_changed` message, `hostGeneration` | `< 5 s` budget (`FR-06`) |
| Room state | The DO's in-memory record of a room | `RoomState` type, `data/room-state.md` | Ephemeral; deleted when the room closes |
| Bot | A local AI opponent for offline play | `bot`, `difficulty` ∈ `'easy' \| 'normal' \| 'hard'` | Runs the same physics core (`OQ-19`) |
| Map | A playable terrain | `mapId`, `tunables.maps[]` | `mapBounds` 2000×1200 reference; authored, not from GunBound |
| Tunables | Balance numbers loaded from JSON, not compiled | `tunables` JSON in `packages/core/src/tunables/` | `ruleset_version` recorded with every match |
| Ruleset version | Version string of the tunables used for a match | `matchRecord.rulesetVersion` | Rating comparisons stay meaningful when balance changes |
| Quick phrase | Preset chat line | `quickPhraseId` | No free text (`OQ-17`) |
| Emote | Preset animated reaction | `emoteId` | Same message type as a quick phrase |
| Snapshot token | Monotonic counter identifying a snapshot | `seq` | Peers drop out-of-order snapshots |
| Session token | Short-lived token the Worker mints for WS/API use | `sessionToken`, `expiresAt` | Guests get one; registered players exchange their Clerk JWT for one |
| Room status | Lifecycle of a room | `'lobby' \| 'playing' \| 'ended' \| 'abandoned'` | `workflow-state-machine.md` |
| Connection state | Per-member network state | `'connected' \| 'grace' \| 'disconnected'` | 20 s grace before a skip/forfeit (`OQ-07` in brief) |

| Term | Meaning | Code name |
|---|---|---|
| Delay | The cost in the turn queue that an action buys: a mobile's base delay plus per-weapon and per-item costs. Cheap actions act more often. | `delays[]`, `delayCost` |
| Turn queue | The ordered list produced by sorting accumulated delay, recomputed after every action. | `queue[]` |
| Weapon slot | One of a mobile's three weapons: shot 1, shot 2, super shot. | `weaponSlot` `0 \| 1 \| 2` |
| Super shot | The one-per-match heavy shot of a mobile; GunBound calls its parameters PSS. | `weaponsLeft[2]` |
| Shield | A pool that absorbs damage before HP and regenerates a little each turn. | `shield`, `maxShield`, `shieldRegen` |
| Defense | A per-mobile multiplier applied to incoming damage (higher = tankier). | `defense` |
| Mass | A mobile's weight; divides the wind push, so a heavy mobile drifts less. GunBound's second per-mobile physics constant. | `mass` (118–169) |
| Gravity (per mobile) | A mobile's own downward acceleration; low gravity flies flat and far, high gravity lobs short. | `gravity` (84–128 u/s²) |
| Trajectory profile | The **aim band** a mobile works in; the mobile's own `angleMin`/`angleMax` narrows it. It no longer changes the launch speed. | `trajectory` (`standard`/`direct`/`lobber`/`mortar`/`skimmer`) |
| Aim window | The angle range a specific mobile may fire in. | `angleMin` / `angleMax` |
| Move action | One reposition inside a turn, bounded by the mobile's distance, energy, incline and action count. | `maxMovesPerTurn`, `moveDistance`, `moveEnergy`, `moveDelay`, `runMultiplier` |
| Energy | Per-match budget spent on movement. | `energy` |
| Blast tiers | The three damage rings of one blast: Inner, Mid, Outer. | `BlastTiers` |
| Item | One of eleven battle consumables with a delay cost and an effect. | `ItemId`, `loadout[]` |
| Mode | Room win condition: Solo, Score, Tag or Jewel. | `ModeId` |
| Gimmick | A per-map modifier: Force, Gust, Electric, Wind, Return, Heal, Fog, or a tornado. | `Gimmick`, `Stage` |
| Map record | One of eleven maps: terrain, spawns, gravity, wind range, gimmicks. | `MapRecord` |
| Mobile | A playable character with its own stats and three weapons. | `Mobile`, `mobileId` |
| Part | One measuring unit of the ruler and of the power bar. 1 part = 100 px in GunBound's frame; our ruler prints parts. | `part`, `rulerSegments`, `unitsPerPart` |
| Power | The shot strength the player pulls, **0.0–4.0** like GunBound's power bar; sent as `force` 0–100 (`force = power × 25`). | `power`, `force`, `powerRing` |
| View window | The camera's visible rectangle on the map, default 1000 × 600 units (half the map each way). | `CameraWindow`, `zoomDefault`, `zoomMin`, `zoomMax` |
| Ruler | The bottom measuring strip, 8 divisions at the default window growing to 16 at full-map zoom. | `Ruler`, `rulerSegments` |
| Four-way pad | The four controls around the mobile on your turn: ◀ ▶ move, ▲ ▼ angle. Replaces the joystick. | `DirectionPad`, `onPadHold` |

## Status values in one place

| Field | Values |
|-------|--------|
| `room.status` | `lobby`, `playing`, `ended`, `abandoned` |
| `member.connectionState` | `connected`, `grace`, `disconnected` |
| `member.role` | `host`, `peer` |
| `member.team` | `A`, `B` |
| `input.kind` | `fire`, `skip`, `emote`, `quick_phrase`, `move` |
| `matchRecord.result` (per player) | `win`, `loss`, `abandon` |
| `account.status` | `active`, `deleted` |
