# Project overview — Game Bắn Súng Đạn Đạo Theo Lượt (GBW)

A turn-based artillery game for mobile browsers, delivered as an installable PWA. Two teams of one to four players take
turns aiming a shot across a 2D map; wind, gravity and terrain decide the outcome. Everything a match needs — aiming,
simulation, chat, team setup — is decided live between the browsers; a small Cloudflare backend only pairs them and
records results. `[spec: gbw-spec.md#1.1]`

## Purpose

Give Vietnamese mobile players a faithful, competitive revival of the turn-based artillery genre on the web — no store
install, a link is enough — with ranked play for the players who want a ladder and a bot match for the ones who just
want to play on the bus. `[user: interview R1 audience]`

## Users and actors

| Actor | Wants | Comes from |
|-------|-------|-----------|
| Competitive veteran | Ranked 1v1–4v4 matches, an Elo ladder, a fair shot mechanic with real ballistics | Gunbound-era players looking for the same feel on a phone `[user: interview R1 reference]` |
| Casual guest | Play now with a code or offline, no account | A shared room code in a chat group |
| Registered player | Persistent name/avatar, rating, match history | Signed in with Google or email |
| Host | Controls the room: teams, start | Whoever creates the room |
| Peer | Joins by code, plays their turns | Anyone with the code |

Guests are first-class: creating and joining rooms never requires an account. Only ranked play does
([roles-and-permissions.md](roles-and-permissions.md)).

## Goals and success measures

| Goal | Measure | Target |
|------|---------|--------|
| Matches actually finish | Share of created rooms that complete a match with a winner | ≥ 70 % |
| Nothing hangs | Matches frozen > 10 s (no turn progress, no reconnect) | < 1 % |
| Sessions feel quick | Median match duration | 4–8 min |
| The genre's feel survives | Playtest: veterans accept the shot mechanic as "Gunbound-like" | ≥ 4/5 on the M1 demo rubric (`OQ-31`) |
| The ladder has people on it | Accounts with ≥ 10 rated matches by week 12 | ≥ 200 (`OQ-31`) |

`[user: interview R1 success]` — the first three are the client's own words; the last two are proposals and are open
under `OQ-31`.

## In scope

- Room lifecycle: create with 2/4/6/8 slots, join by 6-character code, host-assigned teams, balanced start.
- Matchplay: touch-only controls (one-finger power pull, four-way pad, pinch-zoom camera, no joystick), angle/power, wind and gravity, blast damage with friendly fire, 20 s turns, weather re-rolled every round,
  skip, elimination, team win, results.
- GunBound rule set (`CR-2026-11-04-gb-gameplay-fidelity`): delay turn queue, shot 1 / shot 2 / super shot per mobile,
  HP + shield + regen + defense, Inner/Mid/Outer blast tiers, movement with energy and incline, eleven items, four modes,
  eight stage gimmicks, eleven maps, avatar stat bonuses.
- Physics: our own deterministic integrator, shaped to GunBound's observable behaviour (`ADR-0005`, `OQ-37`).
- Networking: WebRTC data channels with host authority, reconnect within 20 s, host migration under 5 s, abandon rules.
- Accounts: Clerk sign-in (Google + email), profile, avatar, display name, account deletion.
- Ranked play: Elo rating, leaderboard, match history.
- Offline: installable PWA, bot match with the same physics.
- Localisation: Vietnamese (default) and English, in-app switch. `[user: interview R3/R4]`

## Out of scope

| Excluded | Why |
|----------|-----|
| Public matchmaking, tournaments, spectator mode | Not in the brief; competitive scope is friends-by-code plus a ladder `[assumption: OQ-01]` |
| In-app purchases, app-store builds | Web delivery only `[assumption: OQ-01]` |
| Gunbound assets, maps, audio, names, code | Reimplementation only; behavioural reference only `[user: interview R1 reference]` |
| Free-text chat | Moderation cost; preset phrases and emotes instead `[user: interview R2 chat]` |
| Analytics/telemetry product | No third-party analytics in v1 `[user: interview R3]` |

## Constraints

| Constraint | Value | Source |
|-----------|-------|--------|
| Deadline | 13 weeks from contract start, gates M1 w4 / M2 w9 / M3 w13 | `[user: interview R4 deadline]` + `OQ-25` |
| Delivery | Client contract, full doc tier, weekly Friday status in Vietnamese | `[user: interview R1/R4]` |
| Cost | Cloudflare free tier; TURN free tier 1,000 GB/month | `[spec: gbw-spec.md#2.3]` |
| Devices | iPhone 12, Galaxy A52, one tablet; iOS 16+ / Android 12+ | `[user: interview R3 devices]` `[spec: gbw-spec.md#2.3]` |
| Orientation | Landscape only (deviation from the spec's both orientations) | `[user: interview R4]`, `OQ-22` |
| Accessibility | WCAG 2.2 AA for the shell; canvas state mirrored as text | `[user: interview R3 a11y]` `[assumption: OQ-09]` |
| Language | vi (default) + en, no hardcoded strings | `[user: interview R3/R4]` |
| Assets | AI-generated art and audio | `[user: interview R3 assets]` |
| Legal | original implementation of genre rules; no third-party code, assets, data or names in the basis | `OQ-18` (answered) |

## Key numbers

| Number | Value |
|--------|-------|
| Room code | 6 characters from `A–Z` minus `I,O` and `2–9` = 31⁶ ≈ 887 M combinations `[assumption: OQ-04]` |
| Team sizes | 1v1, 2v2, 3v3, 4v4 (2–8 players) `[user: interview R2 rooms]` |
| Turn length | 20 s `[user: interview follow-up]`; GunBound uses 60 s |
| Turn order | delay queue: base delay 90–120 per mobile, +100/+120/+200 per weapon, +5…+40 per item |
| Mobiles | 20 original creatures, 10 archetypes × 2, one class triple each, duplicates allowed |
| Weapon slots | 3 per mobile (shot 1, shot 2, one super shot) |
| Items | 11 battle items, loadout cap 11, delay cost 5–40 |
| Modes | 4 — Solo, Score, Tag, Jewel |
| Maps | 11, wind range 4–12 and 8 gimmick types per map; gravity is per mobile, not per map |
| Map | 2000 × 1200 world units `[spec: gbw-spec.md#6.3]` |
| Wind | magnitude **0–26** on a **12-sector** dial (30° each), `a = 42 × m × (cos θ, sin θ) / mass` — vertical wind fights gravity |
| Weather | re-rolled **once per round** (every player acted once); constant within a round, announced once |
| Gravity | **per mobile** `84–128 u/s²`, map modifier ×0.95–1.05 |
| HP / shield | 900–1,200 HP + 0–300 shield per mobile, regen 0–40, defense 0.85–1.15 |
| Damage | 180–580 per Inner-tier hit, three blast rings, shield absorbs first |
| Aim window | per mobile, e.g. −20…25° (Storm Falcon), −10…50° (Jade Dragon), 45…88° (Ash Behemoth) |
| Movement | 1–2 move actions per turn, 60–110 px each, ×1.5–1.9 for a run, 8–14 energy per walk, +8…+14 queue delay |
| Physics | 50 ms step, one power law (`v0 = force × 4.55`), per-mobile `gravity` 84–128 and `mass` 118–169, wind ÷ mass, **no drag**; full-power 45° shot ≈ 1,988 units in 6.3 s |
| View window | camera window, default **1000 × 600 units** (½ the map each way), pinch 250 × 150 … whole map `[user: CR-2026-11-04-touch-only-viewport]` |
| Ruler | 8 divisions at the default window growing to 16 at whole-map zoom (≈125 units each) |
| Controls | touch only: one finger pulls power, release fires above 0.3, two fingers pan, pinch zooms, four-way pad moves and angles; **no joystick** |
| Power display | gradient ring around the mobile, numeric **0.0–4.0** inside (GunBound's power bar), `force = power × 25` |
| Snapshot rate | 10 Hz, ≤ 800 B at 8 players `[spec: gbw-spec.md#FR-05]` `OQ-24` |
| Client bundle | < 5 MB first load, < 200 MB heap `[spec: gbw-spec.md#NFR-03]` |
| Load target | 50 concurrent rooms ≈ 400 players `[user: interview R4 testing]` |
| Rating | Elo, start 1200, K = 32 below 30 matches else 16 `[assumption: OQ-28]` |

## Where to go next

- How it fits together: [architecture.md](architecture.md)
- What "done" means per quality attribute: [nonfunctional-requirements.md](nonfunctional-requirements.md)
- Who may do what: [roles-and-permissions.md](roles-and-permissions.md)
- Every rule the match obeys: [workflow-state-machine.md](workflow-state-machine.md)
