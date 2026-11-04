---
name: GBW — turn-based artillery PWA (working title)
tier: full                # client delivery with a contract [user] — see § 13
project_types: [web-app]  # PWA for iOS Safari / Android Chrome; thin Workers+DO signaling backend, no gameplay server
status: confirmed
updated: 2026-11-04
---

# Project brief — GBW (turn-based artillery PWA)

> Confirmed 2026-11-04 after `cpt-ingest` + five `cpt-interview` rounds. Facts are tagged `[spec: gbw-spec.md#<section>]`
> (from the source), `[user]` (stated by the client in the interview), `[inferred]` (stated to and not corrected), or
> `[assumption: OQ-nn]` (a default still awaiting an answer — tracked in `docs/04-decisions/open-questions.md`).
> Remaining gaps from `00-source/ingest-report.md` are registered as OQ-01…OQ-29, not left as blanks.

## 1. Problem

Mobile players who want a short, competitive turn-based artillery match (Gunbound-style aiming, wind, gravity) have to
install a native app or play a browser game built for desktop. This project delivers the same mechanic class as an
installable, offline-capable web app that runs directly in a mobile browser, with original graphics, maps and content
rather than Gunbound assets. [spec: gbw-spec.md#1.1]

**Audience**: mobile players who already know the genre — **Gunbound veterans** who want the same skill loop (wind
reading, angle and force judgement, weapon choice) on a phone, and will judge the game on control precision and turn
speed rather than on presentation [user]. Release 1 is therefore tuned for competitive play: precise touch controls,
fast turns, and end-of-match accuracy/damage stats; persistent ranks, matchmaking and profiles stay out of scope.

What players use today and what that costs them is still unstated — G-01.

## 2. Users

| User type | Needs to get done | Notes |
|-----------|-------------------|-------|
| Mobile player (host) | Create a room, share a 6-character code, play a 1v1 or 2v2 match in 3–10 minutes | Runs the authoritative physics simulation in the browser [spec: gbw-spec.md#1.3][spec: gbw-spec.md#2.2] |
| Mobile player (peer) | Join by code, aim and fire, see the match state | Sends input to the host, receives snapshots [spec: gbw-spec.md#1.3][spec: gbw-spec.md#3] |
| Offline player | Practise alone without a network after the first load | Practice vs AI or a static level; multiplayer disabled offline [spec: gbw-spec.md#3] |

| Competitive player | Read wind and terrain the way the original did, see why a shot missed (accuracy, damage dealt), keep matches short | Primary audience [user] |

The audience is a **competitive, genre-literate** one [user]: it raises the bar on control feel and ballistics fidelity,
not on story or polish. Accounts exist for ranked play [user]; offline bot play stays anonymous — see § 8.

## 3. Goals and success measures

| Goal | Measure | Target |
|------|---------|--------|
| Smooth match rendering on a mid-range phone | Frame rate | 60 FPS sustained on iPhone 12 / Galaxy A52 [spec: gbw-spec.md#4] |
| Responsive touch control | Touch-to-feedback latency | < 100 ms perceived [spec: gbw-spec.md#4] |
| Cheap first load on mobile data | Initial download | < 5 MB excluding optional assets [spec: gbw-spec.md#4] |
| Matches survive the host dropping | Host-migration time | < 5 s from detection [spec: gbw-spec.md#4] |
| Architecture fits Cloudflare free tiers | Request/bandwidth usage | Workers < 100k req/day, DO < 1M req/month, TURN < 1,000 GB/month [spec: gbw-spec.md#4] |
| Matches actually finish | Share of created rooms completing ≥ 1 full match | ≥ 70% [user] |
| Matches do not break | Share of matches ending in a freeze or unrecovered disconnect | < 1% [user] |
| Matches stay short | Median match duration | 4–8 minutes [user] |

No product-level success measure (retention, matches played, DAU) appears in the source — gap G-02.

## 4. Scope

**In scope (first release)**

- Room creation and joining by 6-character code, **1v1 through 4v4 — up to 8 players per room**; the host picks team
  sizes in the lobby and mixed sizes are allowed (e.g. 2v3) [user]
- Everything listed in spec § 2.2 ships in release 1, including **chat**, **joystick movement**, **skip-turn** and
  **AI practice** [user]. Chat is **preset quick phrases and emotes only — no free text** [user]
- WebRTC signaling via a per-room Durable Object, host election, P2P DataChannel gameplay, host migration
  [spec: gbw-spec.md#3][spec: gbw-spec.md#5]
- Touch controls: drag-to-aim with a live trajectory arc, optional power bar, virtual joystick if movement exists
  [spec: gbw-spec.md#3]
- **GunBound rule set** (approved 2026-11-04, `CR-2026-11-04-gb-gameplay-fidelity`): delay-based turn queue, three
  weapon slots per mobile (shot 1 / shot 2 / super shot), HP + shield + regen + defense, Inner/Mid/Outer blast tiers,
  movement bounded by distance and incline and paid in energy, eleven battle items with a delay cost, four modes
  (Solo / Score / Tag / Jewel), eight stage gimmicks, eleven maps, avatar stat bonuses, and a GunBound-shaped physics
  replica in our own integrator [user]
- **Twenty original mobiles** (approved 2026-11-04, `CR-2026-11-04-twenty-mobiles`): English-named creatures drawn from
  world mythologies, two per GunBound-style archetype, with our own names, silhouettes and palettes — no GunBound name,
  art or data is reused [user]
- Ballistics simulation with angle, force, wind and per-map gravity; terrain/character collision; explosion particles
  and projectile trail [spec: gbw-spec.md#3]
- P2P state sync: host→peer snapshots at 10–20 Hz, peer→host input; reliable control channel plus unreliable state
  channel [spec: gbw-spec.md#3]
- **User accounts and server-side ranks**: sign-up / sign-in (email or Google), server-side profile (nickname, avatar,
  rating, match history), an ELO-style rating per account, a global leaderboard screen and a personal match-history list
  [user]. This reverses the earlier anonymous-guest decision — see OQ-05 and the schedule risk in OQ-25.
- PWA installability and offline single-player via Service Worker precache; offline mode is a **bot match using the same
  physics** and a simple aim solver on the same map, not a target range [user] [spec: gbw-spec.md#3]
- Three screens: main (create/join/offline + network status), match (canvas, HUD, controls), end (winner, damage and
  shot stats, play again / home) [spec: gbw-spec.md#7]
- Delivery in five phases: P1 offline prototype → P2 signaling/P2P → P3 PWA/mobile polish → P4 content and balance →
  P5 load test and launch on Cloudflare Pages [spec: gbw-spec.md#8]

**Out of scope**

- Nothing is declared out of scope in the source, and the client chose "everything in § 2.2" for release 1 (chat, movement,
  skip-turn, AI practice) [user], plus accounts and ranks [user]. Still out of scope: public matchmaking / random opponents,
  tournaments, spectators, in-app purchases, native app-store distribution, chat beyond preset phrases, and rating
  penalties/enforcement beyond the rating maths [assumption: OQ-01].
- **Cut order if the deadline slips** (decided by [user]): English UI first, then content variety. Accounts + ranks were
  kept in preference to both — OQ-25.
- Match rules follow the **genre conventions** described in `02-reference/gameplay/reference-gunbound.md`: delay-queue
  turn order, three weapon slots, three-tier blasts, eleven items, four modes, stage gimmicks, avatar bonuses. Everything is
  implemented in our own TypeScript with our own tuning and our own mobiles, weapons, items and maps [user].
- **No decompilation, no third-party code, assets, data files or names are part of the basis** [user 2026-11-05] — OQ-18
  is closed and nothing in the plan waits on a rights holder.

## 5. Constraints

- **UI languages**: **Vietnamese and English**, switchable in-app, from release 1 [user]
- **Deadline**: **3 months from contract start** [user], gated at weeks 4 / 9 / 12 (§ 13). The spec's own phase estimates
  total 6–9 weeks [spec: gbw-spec.md#8]; accounts + ranks + 8-player sync add an estimated 4–6 weeks, so the contract date
  is at risk and the client must choose between extending it and cutting scope — **OQ-25**, to be handled through
  `cpt-change`, not silently absorbed.
- **Team**: not stated. A solo developer plus AI agents was assumed before the client-delivery answer; the team size and
  roles must now be confirmed — OQ-15.
- **Budget**: Cloudflare free tiers are the design constraint; Cloudflare Realtime TURN requires a payment method with
  the first 1,000 GB/month free [spec: gbw-spec.md#2.5][spec: gbw-spec.md#4]. No budget figure is given.
- **Mandated technology**: Phaser 4 client, Cloudflare Workers + Durable Objects for signaling, WebRTC DataChannel for
  gameplay, Cloudflare Realtime TURN as relay fallback, Cloudflare Pages for deployment, Service Worker + manifest for
  PWA [spec: gbw-spec.md#2.3][spec: gbw-spec.md#5][spec: gbw-spec.md#8].
- **Design constraints (hard)** [spec: gbw-spec.md#2.4]:
  - No physics simulation on the Worker — the free tier's 10 ms CPU per invocation is insufficient; all physics runs in
    the host browser.
  - No WebSocket for gameplay — Workers free tier is asserted not to support it; signaling prefers plain HTTP/HTTPS.
  - Do not add the `apple-mobile-web-app-capable` meta tag, so iOS WebRTC stays stable at the cost of standalone
    full-screen mode (accepting a Safari tab) — this conflicts with § 2.1, see C-02.
  - Touch targets ≥ 44×44 logical px, primary controls ≥ 60×60.
- **Platforms**: iOS 16+, Android 12+ mobile browsers with WebGL/WebGPU [spec: gbw-spec.md#2.3], **landscape
  orientation only** — a portrait device shows a rotate prompt [user]. This overrides NFR-05's both-orientations rule;
  the deviation is recorded in OQ-22.
- **IP**: original graphics, maps and audio, produced as **AI-generated assets** curated by the team [user]; no Gunbound
  assets are used [spec: gbw-spec.md#1.1]. The client's policy on AI-generated content and how it must be disclosed is
  unconfirmed — OQ-20.
- **Compliance**: age rating still unstated; with preset chat and no accounts the exposure is small, but the puzzle-pieces
  policy statement is the client's to give — OQ-17.

## 6. Tech stack

| Layer | Choice | Source | Rationale |
|-------|--------|--------|-----------|
| Client render/input/VFX | Phaser 4 (auto WebGL/WebGPU), Scale Manager `Phaser.Scale.FIT` | [spec: gbw-spec.md#2.3][spec: gbw-spec.md#4] | 2D scene graph, particles, multi-touch pointers |
| Language | TypeScript (interfaces given for room state) | [spec: gbw-spec.md#6.1] | Type-safe packet/state contracts; rest of the toolchain not stated (G-18) |
| Game logic layer | Separate modules: Ballistics Simulator, Turn Manager, Host/Peer state machine — independent of Phaser scenes | [spec: gbw-spec.md#4][spec: gbw-spec.md#5.1] | Unit-testable physics and network logic |
| Physics config | JSON file (gravity, wind multiplier, force bounds, projectile mass, map bounds) | [spec: gbw-spec.md#6.3] | Tuning without code changes |
| Networking | WebRTC DataChannel, host-authoritative; control (reliable/ordered) + state (unreliable/unordered) channels | [spec: gbw-spec.md#3][spec: gbw-spec.md#6.2] | Low latency, no gameplay server |
| Signaling backend | Cloudflare Worker (router) + one Durable Object per room (membership, SDP/ICE relay, host election/migration, TURN credential minting) | [spec: gbw-spec.md#2.2][spec: gbw-spec.md#5.1] | Room-scoped state, free-tier friendly |
| NAT traversal | Cloudflare Realtime TURN for fallback; STUN assumed free/unlimited | [spec: gbw-spec.md#2.3][spec: gbw-spec.md#5.1] | P2P works for the large majority of sessions |
| PWA | Service Worker precache (hashed manifest), app manifest, offline local mode | [spec: gbw-spec.md#3] | Installable, offline single-player |
| Optional input lib | `nipplejs` or Phaser `addPointer(2)` | [spec: gbw-spec.md#3] | Only if character movement ships |
| Local storage | IndexedDB appears in the component diagram but no requirement uses it | [spec: gbw-spec.md#5.1] | Unclear — G-13 |
| Local storage | `localStorage` for nickname and language preference only (no accounts, no profile) | [user] | Anonymous guest model — nothing worth persisting beyond settings |
| i18n | Key-based JSON string tables (`vi`, `en`), locale switch in settings, `vi` default | [user] | Two languages from release 1; no runtime translation service |
| Assets | AI-generated sprites, maps and SFX, curated and versioned by the team | [user] | Spec demands entirely new content; no artist contract in the 3-month plan. Policy/disclosure check — OQ-20 |
| Hosting | Cloudflare Pages | [spec: gbw-spec.md#8] | Static PWA hosting; Worker/DO deployed alongside |

**Candidate packs**: `cpt-stack-browser-verify` → review layer, because § 7 defines three screens and § 8 P3 requires
real-device testing — a browser pass is the only way to evidence them. No pack in the catalog covers Phaser, Workers or
Durable Objects; `conventions.md` carries those layers. Toolchain decided: pnpm, Vite 8, Phaser 4.2, TypeScript 5 (`OQ-11` answered).

## 7. Data

- **RoomState** (in the Durable Object): `code` (6 chars), `hostId`, `players[]` (the source says max 4 players; the client
  requires up to 8 for 4v4, so the type must be capped at 8 — conflict resolved in favour of 8, see OQ-16),
  `status` = `waiting | playing | finished`, `createdAt`, `lastActivityAt` [spec: gbw-spec.md#6.1]
- **PlayerInfo**: `id` (account id, or `guest-<uuid>` in offline mode), `displayName` (from the account, read-only
  during a room), `joinedAt`, `isHost`, `connectionState` = `connected | disconnected`
  [spec: gbw-spec.md#6.1]
- **DataChannel packets** [spec: gbw-spec.md#6.2]: `input` (~16 B, angle/force/action), `snapshot` (~200–400 B,
  projectile position, HP, turn), `event` (< 100 B, match start / turn end / chat), `host_migrate` (< 50 B)
- **Physics config** in a single JSON file (gravity, wind multiplier, force bounds, shell mass, map bounds)
  [spec: gbw-spec.md#6.3]. The source's numbers (`gravity 0.35` with `force × 512/100` on a 2,000-unit map) cannot all
  hold at once; `02-reference/gameplay/tunables.md` § 1 keeps the speed law and re-expresses gravity in `u/s²`
  (`100`, maps `85–120`). The shape — data-driven, no code change to tune — is what the brief fixes
- **Missing**: match/turn state machine, HP and damage values, map/terrain data format, character and weapon data,
  whether snapshots persist in DO storage or only peer memory — G-04, G-05, G-10, G-14.
- **Retention**: no long-term storage of *session* data; TURN credentials are not cached or logged [spec: gbw-spec.md#4].
  Accounts change this: profile, rating and match history persist until the user deletes the account — retention period,
  deletion flow and export are **not yet decided** — OQ-26.
- **Sensitive data**: email address (account identifier), display name, hashed password or OAuth subject, match history,
  rating; no payment data. Preset chat carries no message content [user]. Personal data makes a privacy policy, terms and a
  consent/age statement mandatory — OQ-26.
- **Account** (new, server-side): `id`, `email`, `displayName` (unique, 2–16 chars), `avatarId`, `createdAt`,
  `lastSeenAt`, `rating`, `ratedMatches` [user]
- **MatchRecord** (new, server-side): `id`, `roomCode`, `startedAt`, `endedAt`, `winnerTeam`, `players[]` (account id,
  team, damage, accuracy), `ratingDelta` per player [user]

## 8. Identity and roles

| Role | Can do | Cannot do |
|------|--------|-----------|
| Room creator → host | Create a room, receive peers, run the authoritative simulation, send snapshots, mint peers' connection setup | — [spec: gbw-spec.md#3] |
| Peer | Join by code, send input (angle, force, action), receive snapshots | Run physics; must be migrated to host if the host leaves [spec: gbw-spec.md#3] |
| Migrated host | Take over simulation after the previous host disconnects, restore from the latest snapshot | — [spec: gbw-spec.md#3][spec: gbw-spec.md#5.3] |
| Offline player | Play locally without a network | Use multiplayer offline [spec: gbw-spec.md#3] |

| Registered player | Sign in, set a nickname and avatar, see own rating and match history, appear on the leaderboard | Cannot play ranked without an account; cannot edit rating or others' records [user] |
| Guest / offline player | Play the bot offline without an account, with settings in `localStorage` | No ranked play, no leaderboard entry, no match history [user] |

Authentication: real accounts with **email or Google sign-in** [user]; the provider, session mechanism (httpOnly cookie
vs bearer token), password policy and email-verification flow are not yet chosen — OQ-26. The DO's short-lived room
session token [spec: gbw-spec.md#4] remains, now derived from an authenticated account rather than an anonymous peer.
Rating is computed server-side, never by the host client — otherwise the host's authoritative physics would let it award
itself points.

## 9. Non-functional requirements

| Area | Requirement | Source |
|------|-------------|--------|
| Performance | 60 FPS on iPhone 12 / Galaxy A52, < 100 ms touch feedback, RAM < 200 MB, first load < 5 MB; Phaser picks WebGL/WebGPU | [spec: gbw-spec.md#4] |
| Availability | Depends on Cloudflare; no self-operated server; P2P preferred, TURN only on failure (~8–15% of cases) | [spec: gbw-spec.md#4] |
| Reliability | Host migration < 5 s after detection; fallback ends the match if migration fails | [spec: gbw-spec.md#4][spec: gbw-spec.md#9] |
| Security / privacy | Short-lived room session tokens for signaling; TURN credentials leased 1 h per peer, not cached, not logged; P2P encrypted end-to-end via DTLS (Cloudflare TURN cannot read content) [spec: gbw-spec.md#4]. **With accounts**: password/identity handled only by the auth provider, httpOnly + `Secure` + `SameSite` session cookie, no PII in logs or error reports, no PII in the P2P payloads, server-side rating only | [user] + [spec: gbw-spec.md#4] |
| Mobile usability | Touch ≥ 44×44 logical px (primary ≥ 60×60), spacing ≥ 8 px; **landscape-only** layout with a rotate-device gate in portrait [user] — overrides the spec's both-orientations rule, see OQ-22; browser pinch/double-tap/page-drag gestures disabled on the game canvas | [spec: gbw-spec.md#2.4][spec: gbw-spec.md#4] |
| Maintainability | Physics and network logic decoupled from Phaser scenes and unit-testable; tunables in a JSON config | [spec: gbw-spec.md#4] |
| Cost ceiling | Stay inside free tiers: Workers 100k req/day, DO 1M req/month, TURN 1,000 GB/month; the 8-player cap must not break the snapshot budget — OQ-24 | [spec: gbw-spec.md#4] |
| Accessibility | **WCAG 2.2 AA as the target** where the canvas allows: contrast, focus order, labelled controls, reduced-motion option, no colour-only signals (wind/turn/HP) [user] | [spec: gbw-spec.md#4] |
| Localization | **Vietnamese + English** string tables with in-app switch, `vi` default; no RTL, no per-region content [user] | — |
| Audit / logging | Only "do not log TURN credentials"; no analytics or error reporting — G-13 | [spec: gbw-spec.md#4] |

## 10. Integrations

| System | Direction | Purpose | Auth | Docs / sandbox | Owner |
|--------|-----------|---------|------|----------------|-------|
| Cloudflare Workers | Outbound (client → edge) | Room create/join, route to the room's DO, signaling | Session token minted by the DO [spec: gbw-spec.md#4] | Cloudflare docs | Unknown — G-12 |
| Cloudflare Durable Objects | Internal | Per-room membership, SDP/ICE relay, host election, TURN credential minting | Worker binding | Cloudflare docs | Unknown |
| Cloudflare Realtime TURN | Outbound (peer → relay) | Fallback relay when direct P2P fails | Short-lived ICE credentials, 1 h lease [spec: gbw-spec.md#4] | Cloudflare docs | Requires a Cloudflare account with a payment method [spec: gbw-spec.md#2.5] |
| Cloudflare Pages | Deploy target | Host the PWA; one preview deployment per PR, production on `main` | — | Cloudflare docs | Team — OQ-13 |
| Auth provider | Outbound (client + Worker) | Sign-up / sign-in by email or Google, session issuance, password reset | OAuth 2.0 / OIDC | Provider TBD — OQ-26 | Unknown |
| Cloudflare D1 (or KV) | Internal (Worker) | Accounts, profiles, ratings, match records, leaderboard queries | Worker binding | Cloudflare docs | Unknown |

External facts in this table (quotas, WebSocket support, Phaser 4 behaviour, iOS PWA/WebRTC behaviour) must be verified
against official docs — see ingest report § Verification items.

## 11. Environments and deployment

- **Environments**: resolved by [user]: **GitHub repository + GitHub Actions + Cloudflare Pages preview per PR +
  production on `main`**; no staging environment in release 1 (M2 UAT runs against a PR preview pinned for the test).
  CI runs typecheck, unit tests and `verify-docs` on every PR; Playwright smoke covers the lobby flow.
- **Hosting / distribution**: Cloudflare Pages for the PWA, Workers + Durable Objects for signaling, D1/KV for accounts and
  ranks; no app-store distribution; the user installs via the browser ("add to home screen") but standalone mode is
  deliberately not enabled [spec: gbw-spec.md#1.1][spec: gbw-spec.md#2.4][spec: gbw-spec.md#8].
- **Code hosting and CI/CD**: resolved by [user] — GitHub + Actions as above. The project directory is still not a git
  repository; initialising it is the first implementation step.

## 12. Quality expectations

- **Testing**: resolved by [user] — **Vitest** unit tests for ballistics, blast damage, snapshot encode/decode and the turn
  manager; **Playwright** smoke for create-room → join → start → one turn; **manual matrix** on two phones (iOS + Android)
  at 1v1 and 4v4, plus a tablet pass in landscape. Launch load target: **50 concurrent rooms (~400 players)**, measured in
  P5 against the free-tier ceilings. Physics and network logic must be testable independently of Phaser
  [spec: gbw-spec.md#4]; P3 requires real-device testing including iOS Safari [spec: gbw-spec.md#8].
- **Definition of Done extras**: unit tests green + Playwright smoke green; `verify-docs` clean; the story's acceptance
  criteria demonstrated on at least one real phone; no new dependency without approval; docs updated in the same change.

## 13. Delivery

- **Milestones** (confirmed by [user], weeks from contract start):
  - **M1 — Demo, end of week 4**: offline prototype playable on a phone + signaling and P2P join working between two devices.
  - **M2 — UAT, end of week 9**: feature freeze; client plays 1v1 and 4v4 on real devices against a pinned PR preview,
    accounts and leaderboard included. Sign-off required to proceed.
  - **M3 — Go-live, end of week 12**: production on Cloudflare Pages, load test evidence, runbook, rollback plan.
  - Internal development still follows the spec's P1–P5 phases [spec: gbw-spec.md#8] mapped onto those 12 weeks.
- **Cadence**: 2-week sprints; a written status note every Friday (progress, next sprint, risks, open questions) — [user].
- **Reporting**: weekly Friday note in Vietnamese, plus a gate pack (evidence + checklist) at M1/M2/M3 [user].
- **Team and roles**: still not stated (G-21) — who develops, who tests, and who signs each gate on the client side is
  unknown — OQ-27.
- **Product owner (answers open questions)**: a client-side contact is needed but unnamed — OQ-27.
- **Client acceptance procedure**: gate-based sign-off at M1/M2/M3 [user]; the formal acceptance record format follows
  `cpt-signoff` (full tier).

## 14. Type-specific

### web-app

- **Screens** [spec: gbw-spec.md#7], extended by [user]: main — create room, join by code, play offline (if cached),
  online/offline status, account menu; **auth** — sign-up/sign-in by email or Google; **profile** — nickname, avatar,
  rating, match history; **leaderboard** — global top N with the player's own rank; **lobby** — 2–8 slots, host assigns
  teams, share code; match — full-bleed canvas, HUD (HP, current turn, wind direction and strength), bottom controls (aim
  arc, power bar, fire, skip turn), preset-phrase chat; end — winner, damage/shots/accuracy stats, rating delta, play again
  (new room) and home.
- **Devices/browsers**: iOS 16+ Safari, Android 12+ Chrome, **landscape only**; test matrix iPhone 12, Galaxy A52 and
  one tablet [user]; notch/safe-area insets and tablets' larger viewport must be handled [spec: gbw-spec.md#2.3]
  [spec: gbw-spec.md#4].
- **Backend**: yes — a thin signaling service (Worker + DO); gameplay itself is P2P [spec: gbw-spec.md#2.2].
- **Rendering**: single-page canvas game (Phaser), no SEO requirement, no server-side rendering [spec: gbw-spec.md#5.1].
- **Real-time**: WebRTC DataChannel between host and peers; no polling for gameplay [spec: gbw-spec.md#3].
- **Uploads / exports / email / push notifications**: none stated.
- **Design system**: no designs or branding supplied. Visuals are **AI-generated**, curated by the team to the brand
  brief that does not yet exist [user]; who signs off on look-and-feel is unassigned — OQ-20.
- **Accessibility / localization**: WCAG 2.2 AA target and **bilingual vi + en** [user].

## 15. Assumptions and open questions

As of the ingest only — later questions live in `docs/04-decisions/open-questions.md`.

| Id | Topic | Assumption in use |
|----|-------|-------------------|
| OQ-01 | G-03 release-1 scope | Superseded by [user]: all of spec § 2.2 ships plus accounts and ranks. Remaining assumption: public matchmaking, tournaments, spectators, IAP and app-store distribution stay out |
| OQ-02 | G-04 combat rules | HP 100 per player, damage from explosion radius with distance falloff, no friendly fire, match ends when one team remains |
| OQ-03 | G-05 turn rules | Sequential turns; **20 s turn clock** [user] (gunbound reference uses 60 s — too slow for a 3–8 min mobile match), host starts once both teams are ready, no sudden-death cap in release 1. Tunable in the physics JSON |
| OQ-04 | G-06 room codes | 6 characters from A–Z/2–9 (no 0/O/1/I), case-insensitive, regenerate on collision; up to 8 players; no private/password rooms |
| OQ-05 | G-07 identity | **Superseded by [user]**: real accounts (email or Google), server-side profile and rating; anonymous play remains only for the offline bot mode. Provider and PII handling → OQ-26 |
| OQ-06 | G-11 signaling transport | Signaling over HTTP request/poll against the Worker→DO pair, not WebSocket, following § 2.4; host sends the offer to each peer. Revisit if Cloudflare free-tier WebSocket support is confirmed (VF-01) |
| OQ-07 | G-10 migration state | The DO stores the latest snapshot in Durable Object storage at every turn end and every 2 s while a projectile is in flight; a new host resumes from it and replays the in-flight shot locally |
| OQ-08 | G-12 tier and ownership | Superseded: `full` tier (client delivery, gates, acceptance record) [user]; Cloudflare account owner still unnamed — OQ-27 |
| OQ-09 | G-15 language and a11y | Resolved by [user]: **Vietnamese + English** from release 1 (in-app switch, `vi` default); **WCAG 2.2 AA** as the target where the canvas allows; landscape-only (OQ-22) |
| OQ-10 | G-13 persistence and telemetry | Resolved by [user]: no product analytics or crash reporting in release 1; durable storage is limited to accounts, ratings/matches (D1/KV) and DO room state |
| OQ-11 | G-18 toolchain | TypeScript + Vite, `vitest` for unit tests, one Worker project containing the DO class, `pnpm` as package manager; Phaser 4 pinned after checking its current release status (VF-03) |
| OQ-12 | G-14 assets | Resolved by [user]: AI-generated art, maps and audio, curated in-house; the production-asset pipeline is therefore internal and not a client dependency |
| OQ-13 | G-16 environments | Resolved by [user]: GitHub + GitHub Actions (typecheck, unit tests, `verify-docs`, Playwright smoke), Cloudflare Pages preview per PR, production on `main`, no staging |
| OQ-14 | G-21 / G-12 team and reporting | Superseded: deadline is 3 months from contract start, gates at weeks 4/9/12, weekly Friday status in Vietnamese, 2-week sprints [user]; team composition still unknown → OQ-27 |
| OQ-15 | G-21 client delivery facts | Resolved by [user]: gates M1 week 4 (demo), M2 week 9 (UAT), M3 week 12 (go-live); weekly Friday status in `vi`; 2-week sprints; client signs each gate. Signer identity open → OQ-27 |
| OQ-16 | G-06 room capacity | Resolved by [user]: 2–8 slots, host picks team sizes in the lobby, mixed sizes allowed; no free-for-all |
| OQ-17 | G-08 chat and safety | Resolved by [user]: preset phrases and emotes only, no free text → no message storage, no profanity filter, no report/block. Age rating still unstated |
| OQ-18 | GunBound reference fidelity | Closed [user 2026-11-05]: "no decompile, we have all needed" — genre rules only, nothing copied, nothing to sign off |
| OQ-19 | Match rules source detail | 60 s turn timer and 8 player slots are confirmed in the reference's `CONSTANTS.md`; HP, blast-damage formula and wind model still need extraction before stories are sized |
| OQ-20 | AI-generated assets | AI content is confirmed as the asset source [user]; unresolved: the client's policy on AI-generated content, whether it must be disclosed in-game or in the repo, and who approves the look-and-feel. Assumption in use: disclosure line in the settings/credits screen, client signs off at M2 |
| OQ-21 | Competitive depth in 3 months | Superseded by [user]: release 1 ships **server-side rating + global leaderboard + match history**; skill depth (turn clock, wind indicator, aim guide, end-of-match stats) ships alongside |
| OQ-22 | Landscape-only deviation | Landscape-only confirmed by [user], overriding NFR-05's both-orientations requirement; recorded as a deviation for `cpt-docs` and a rotate-device screen in the UI. Portrait phone users cannot play until they rotate |
| OQ-23 | Device matrix | Resolved by [user]: iPhone 12 (iOS 16+ Safari), Galaxy A52 (Android 12+ Chrome) and one tablet, landscape only; no desktop support beyond development |
| OQ-24 | 8-player performance | The spec's snapshot budget (< 500 B) and 60 FPS target were written for 2–4 players; with up to 8, snapshot size must be re-measured (quantised positions, delta encoding) and the packet-rate of 10–20 Hz re-validated. Assumption in use: snapshot ≤ 800 B, 10 Hz state at 8 players |
| OQ-25 | Deadline vs accounts + ranks | **Contract risk.** 3 months [user] vs ~10–13 weeks of work once accounts, ranks, 8-player sync and AI assets are included; the [user] cut order (English UI, then content variety) recovers only ~1 week. Client must choose: extend the contract, cut 4v4, or move ranks post-go-live. Escalate via `cpt-change` before `cpt-plan` |
| OQ-26 | Accounts, auth provider and PII | Assumption in use: Google OAuth + email magic-link through a managed provider, httpOnly cookie session, D1 tables for accounts/profiles/matches, email verification on sign-up, unique nickname 2–16 chars, account deletion + export endpoints, privacy policy and terms drafted before M2. Provider, password handling, retention period, age gate and deletion flow are open — **security rule 06 applies: do not invent PII handling** |
| OQ-27 | Client-side roles | No named client signer, no client-side QA, no legal contact for the GunBound reference and the AI-content policy — needed before the M1 gate |
| OQ-28 | Rating algorithm | Assumption in use: Elo with K=32, start 1200, delta computed server-side from team result plus individual damage/accuracy; 4v4 uses average team rating; abandonment counts as a loss for the leaver; bot play is unranked |
| OQ-29 | Nickname and avatar safety | Assumption in use: server-side profanity/reserved-name check (vi + en lists) on nicknames, a small fixed avatar set, no free-text profile fields, no image upload |
