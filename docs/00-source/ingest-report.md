# Ingest report — 2026-11-04

## Sources

| File | Type | Version / date | Read | Notes |
|------|------|----------------|------|-------|
| `gbw-spec.md` | Markdown, 21 KB, Vietnamese | No version, no date, no revision history, no author in the document; file mtime 2026-11-04 | Full | SRS § 1–9: purpose, scope, glossary, FR-01…FR-07, NFR-01…NFR-06, architecture + signaling/host-migration flows, data model (TypeScript interfaces, packet table, physics JSON), 3 UI screens, 5-phase plan (P1–P5), risk table. No acceptance criteria, no test plan, no out-of-scope list, no team/dates/budget. |

Nothing was unreadable. There is exactly one source; no second version exists, so no cross-version conflict is possible.

## Summary

The material specifies a **mobile-first, turn-based artillery game delivered as a PWA**, Gunbound-inspired mechanics with
original art/maps/content. Gameplay is client-side and P2P over WebRTC DataChannel with one player as authoritative host; a
thin Cloudflare Worker + per-room Durable Object does room codes, signaling relay, host election/migration and TURN
credential minting. Offline single-player (AI or static level) is served by a Service Worker cache. Strong on technical
design (packet sizes, cache strategy, free-tier budget, physics constants); weak on product definition (no users/success
measures), missing all match rules (damage, HP, turn timer, win condition) and all delivery/environment facts.
Project types: **web-app** (PWA, mobile browsers) with a thin **api-service**-shaped signaling backend. Likely tier:
**standard** (assumed — no client, contract or reporting is mentioned).

## Conflicts

Internal to one document (section vs section). No default is taken: each is carried into the interview.

| # | Topic | Source A says | Source B says | Default taken |
|---|-------|---------------|---------------|---------------|
| C-01 | Channel for `input` packets | § 3 FR-05: *"State channel: Unreliable, unordered (maxRetransmits: 0) – dùng cho snapshot và input"* | § 6.2 packet table: `input` → **Control (reliable)**, ~16 bytes; only `snapshot` is `State` | None — must be decided (affects input loss/latency and ordering) |
| C-02 | Full-screen standalone vs Safari tab | § 2.1: user *"có thể 'Thêm vào màn hình chính' để chạy toàn màn hình"* | § 2.4 + § 9: *"không thêm thẻ meta apple-mobile-web-app-capable"*, *"Chấp nhận mở trong tab Safari thay vì chế độ standalone toàn màn hình"* | None — constraint (§ 2.4) is the safer reading; confirm the product accepts losing standalone |
| C-03 | Signaling transport | § 2.4: prefer plain HTTP/HTTPS, WebSocket via DO only *"nếu cần"* | § 5.3 step 1: DO detects host loss by *"timeout WebSocket/HTTP"*; FR-02 never names the transport | None — transport decides the signaling protocol and timeout mechanism |
| C-04 | Gravity scope | § 3 FR-04: trajectory uses *"trọng lực của map"* (per-map gravity) | § 6.3: one global `"gravity": 0.35` in a single physics JSON | None — per-map vs global changes the config schema and balance work |
| C-05 | Force scale | § 3 FR-04 formula: `vx = trunc(cos(angle) * force * 512)/100` (force in 0…512-ish units) | § 6.3: `maxForce: 100`, `minForce: 0`, plus an optional power bar | None — the formula's force unit is undefined against a 0–100 range |
| C-06 | Renderer | § 2.3 / NFR-01: Phaser auto-selects WebGL/WebGPU | NFR-01: *"với canvas 2D đơn giản, ít particle"* | None — "canvas 2D" vs WebGL/WebGPU changes the performance plan |
| C-07 | Detect + migrate budget | NFR-03: host migration *"Hoàn tất trong < 5 giây kể từ khi phát hiện"* | § 9 risk mitigation: *"timeout ngắn (3–5s)"* before the migration starts | None — 3–5 s detection + 5 s migration may double the user-visible freeze |

## Gaps

Questions the sources do not answer — walked against `core.md`, `web-app.md` and (where relevant) `mobile-app.md`.

| # | Brief section | Question (bank id) | Why it matters |
|---|---------------|--------------------|----------------|
| G-01 | § 1 Problem, § 2 Users | C1/C2: who exactly plays (age, region, language), what they do today instead, and is it friends-only or open to strangers? Also: the product name (only the working title "SRS: Game …" exists) | Drives tone, art, moderation duty, onboarding, and whether matchmaking is needed at all |
| G-02 | § 3 Goals | C3: what does success look like 3 months after launch, with a number? | The SRS has quality targets (60 FPS, <5 MB) but no product outcome; nothing to measure a launch against |
| G-03 | § 4 Scope | C4/C5: which of P4's content (maps, characters, weapons) ships in release 1, and what is explicitly out? Chat, skip-turn, character movement, offline AI, rematch, matchmaking, spectators, accounts, leaderboard/progress | Every optional *"(nếu có)"* / *"(tùy chọn)"* item is an unscoped story; the MVP cannot be cut without this |
| G-04 | § 4 Scope, § 7 Data | C4/X1: damage model — HP values, damage formula (explosion radius? falloff?), friendly fire, self-damage, what ends the match (HP 0 vs last player standing vs turn cap) | FR-04 stops at collision; § 6.2/§ 7.3 assume HP and "sát thương" exist. Nothing can be balanced or tested without it |
| G-05 | § 4 Scope, § 7 Data | X6/C4: turn rules — turn order, per-turn time limit, AFK/skip, minimum players to start, sudden-death/turn cap, simultaneous vs sequential, what "Chơi lại (tạo phòng mới)" does to the previous room | Turn handling is the core state machine; a turn-based game without a turn clock has no deterministic authority |
| G-06 | § 4 Scope, § 7 Data | X1/C4: room codes and lobby — alphabet/length rules (6 chars given), case sensitivity, collision retry, capacity (4 given) and min to start, private/password rooms, join-by-link, waiting-room screen (absent from § 7), host leaving while `waiting` | FR-01 defines create/join by code but not the code format or the waiting-room UI, and § 7 has no lobby screen |
| G-07 | § 8 Identity | X4: session token — who issues it, TTL, refresh, storage (cookie vs memory), and is it anonymous (no account) or tied to something? Display-name entry, length/charset, duplicates, profanity; NFR-04 says DO *"xác thực người chơi qua token"* without saying how | Decides the Worker/DO auth path and whether any personal data is stored |
| G-08 | § 4 Scope, § 9 NFR | X3/W11: chat — in or out of release 1? If in: retention, profanity filter, report/block, and does the product target minors (age rating, parental expectations)? | § 7.2 says chat is optional and § 6.2/FR-05 carry a `chat` event; user-generated content changes the security and compliance load |
| G-09 | § 3 FR-06, § 9 NFR | X6: non-host disconnect — grace period, reconnect with snapshot resync, pause the match, or forfeit? Also app backgrounding/screen lock mid-turn (iOS suspends timers) | Only host loss is specified; a peer dropping in a 2v2 currently has undefined behaviour |
| G-10 | § 3 FR-06, § 5.3 | X1: migration state — is the latest snapshot in DO storage or peer memory (§ 5.3 says *"có thể"* / *"nếu có"*)? At what frequency is it persisted, what does it contain (mid-flight projectile?), and how does the new host continue a shot already fired? | Without this, "<5 s" migration is unprovable and a match can resume in a wrong state |
| G-11 | § 3 FR-02, § 5.2 | W7/X5: signaling protocol — HTTP polling vs DO WebSocket, message shapes, who offers/answers (host→peer or peer→host), which STUN servers, and how ICE failure falls back to TURN | FR-02 and § 5.2 describe the flow in one line each; this is the entire backend contract |
| G-12 | § 5 Constraints | C6: team size and skills, deadline or fixed dates, budget (TURN needs a payment method per § 2.5; any paid Cloudflare usage allowed?), and is this an internal product, a prototype or a client delivery (→ tier, and whether reports/acceptance are needed)? | Sets the tier, the plan, and whether the free-tier budget is a hard wall or a preference |
| G-13 | § 7 Data, § 9 NFR | X2/X3/X8: retention and persistence — is room state memory-only in the DO or written to DO storage? How long are rooms/snapshots kept? Is the IndexedDB/local-storage box in § 5.1 actually used (settings? offline map? progress?)? Any analytics/crash reporting? | NFR-04 says *"không lưu trữ lâu dài"* but § 5.1 draws local storage and § 6.1 stores player info; unclear what is durable |
| G-14 | § 4 Scope, § 12 Quality | W2/W4/M8: content and assets — who produces art/audio/maps (the SRS says *"đồ họa, bản đồ và nội dung hoàn toàn mới"* but names no source), the map authoring format/pipeline, the character/weapon roster, and how the <5 MB first-load budget is met (texture atlas? procedural?) | Content is the bulk of P4 and the largest cost; an asset pipeline decision changes the client architecture |
| G-15 | § 9 NFR, § 14 | W5/W6/M9: UI language(s) (the SRS is Vietnamese — Vietnamese-only or bilingual?), WCAG target (only 44×44 px is stated), and colour-blind/reduced-motion/haptics needs (§ 9 offers *"tùy chọn giảm hiệu ứng"*) | Localization and a11y targets must be known before screens are built, not retrofitted |
| G-16 | § 11 Environments | X9/D6/W8: hosting layout (Cloudflare Pages for the PWA? Workers assets? one Worker with the DO class?), environments (dev/staging/prod, preview deploys), code host and CI/CD (the directory is **not a git repository**), secrets handling for the TURN key, and quota monitoring/alerts | § 8 P5 names Cloudflare Pages once; nothing else about deploying, promoting or alerting |
| G-17 | § 12 Quality | X11/D5: test approach — framework (unit tests for physics/network per NFR-06 are only *"có thể"*), coverage expectation, how WebRTC/2-device paths are tested (manual device matrix? e2e?), load-test target (how many concurrent rooms in P5?), and UAT/sign-off | Determines whether the P2P and migration paths are verifiable at all |
| G-18 | § 6 Tech stack | X10: build tooling and conventions — bundler (Vite?), package manager, TypeScript strictness, lint/format, state management, Worker+DO project layout, and the **Phaser 4 release status** (the SRS mandates Phaser 4 and its auto WebGL/WebGPU selection — verify against official docs before relying on it) | The stack table is thin below the framework choice; also a version claim must be verified, not assumed |
| G-19 | § 9 NFR, § 10 | X7: scale targets — expected concurrent rooms/players at launch, snapshot encoding (the 200–400 byte claim implies a binary format, not JSON), the quantisation scheme (mentioned once in FR-05), and whether 10 or 20 Hz is the design point | Free-tier limits and packet budget are only meaningful against a concurrency number |
| G-20 | § 3 FR-07, § 8 P1/P4 | M4/C4: offline mode — is release 1's offline mode an AI opponent, a static level, or both? AI behaviour/complexity, what progress (if any) persists locally, and the exact cache-update strategy (FR-07 gives two options: network-first or stale-while-revalidate) | Offline is the P1 milestone and the PWA's reason to exist; "AI hoặc màn chơi tĩnh" is not buildable as written |
| G-21 | § 13 Delivery | D1–D4b: milestones/dates (P1–P5 sum to 6–9 weeks), team and roles, product owner for decisions, cadence, and status-reporting audience/cadence/**language** (sources are Vietnamese → likely `vi`) | No delivery facts exist in the source; the plan cannot be scheduled or reported |
| G-22 | § 9 NFR, § 14 | X8: audio and feedback — music/SFX requirements, haptics, pause on background/resume, and the "reduce effects" toggle from § 9 | § 5.1/FR-07 cache audio but no audio requirement is stated |
| G-23 | § 9 NFR, § 3 | X3: trust model — host-authoritative simulation means the host can cheat freely (reveal aim, edit HP). Is that acceptable (friends-only) or is any validation needed? | A security decision that the SRS leaves entirely open; needs an explicit accepted risk |
| G-24 | § 9 NFR, § 14 | M1/W3: device/OS matrix details — tablets, safe-area/notch handling, orientation lock vs free rotation, low-end fallback, and whether iOS in-tab (per § 2.4) is an acceptable ship state | NFR-05 states both orientations; § 2.4 removes standalone mode; the layout and test matrix follow from this |

## Vague requirements

| # | Quote and location | Suggested concrete version |
|---|--------------------|----------------------------|
| V-01 | *"chế độ luyện tập với AI **hoặc** màn chơi tĩnh"* (§ 3 FR-07, § 2.2) | Pick one for release 1: "static practice range with a scripted dummy target" (cheapest) |
| V-02 | *"joystick ảo … (**nếu có** di chuyển)"*, *"**Nút 'Bỏ lượt' (nếu có)**"*, *"**Thanh trượt lực (tùy chọn)**"*, *"**Chat (tùy chọn)**"* (§ 3 FR-03, § 7.2) | Decide each as in/out of release 1; movement in/out is the big one (it doubles the control surface) |
| V-03 | *"60 FPS ổn định"* (NFR-01) | "≥ 55 FPS average and p95 frame time ≤ 20 ms over a 60 s match on the reference device (iPhone 12 / Galaxy A52)" |
| V-04 | *"Phản hồi chạm < 100ms (cảm nhận)"* (NFR-01) | "touch-to-visual-change ≤ 100 ms measured with a screen recording at 60 fps" |
| V-05 | *"< 5MB cho lần tải đầu (không tính asset tùy chọn)"* (NFR-01) | Define "optional asset": "≤ 5 MB compressed for HTML+JS+core atlas+one map; extra maps/audio lazy-loaded per room" |
| V-06 | *"Snapshot gửi ở 10–20 Hz"* (FR-05) | One number, e.g. "state snapshots at 15 Hz, coalesced to the latest state" |
| V-07 | *"Snapshot nhỏ (< 500 bytes) nhờ … lượng tử hóa vị trí"* (FR-05) | "binary encoding, positions quantised to 1/16 px in int16, ≤ 300 bytes in the 4-player case" |
| V-08 | *"DO bầu một người chơi làm Host (người tạo phòng **hoặc** người đầu tiên tham gia)"* (FR-02) | "room creator is host; if the creator leaves while `waiting`, the longest-connected player becomes host" |
| V-09 | *"TURN chỉ dùng khi P2P thất bại (**khoảng 8–15%** trường hợp)"* (NFR-03) | Treat as an industry assumption to measure, not a requirement; record target "TURN relay ≤ 15% of sessions, monitored" |
| V-10 | *"Kích thước vùng chạm … khuyến nghị 60×60+"* (§ 2.4, NFR-05) | "primary controls ≥ 60×60 px logical; all others ≥ 44×44 px; spacing ≥ 8 px" |
| V-11 | *"DO duy trì danh sách người chơi, trạng thái phòng (đang chờ, đang chơi, kết thúc)"* (FR-01) vs the one-line `status` in § 6.1 | Add the match-level state machine (turn owner, aiming, projectile in flight, resolving damage, finished) — a room status alone cannot drive the client |
| V-12 | *"Kéo từ nhân vật theo hướng ngược lại"* (FR-03) | Define the mapping precisely (drag vector → angle/power inversion, min/max drag distance, dead zone) — otherwise the first story invents it |
| V-13 | *"Ưu tiên cache theo manifest có hash; entry HTML và manifest dùng network-first **hoặc** stale-while-revalidate"* (FR-07) | "precache hashed assets; navigation requests stale-while-revalidate; update prompt on new SW" |
| V-14 | *"trunc(cos(angle) * force * 512) / 100"* (FR-04) | Fix the unit contract: angle in radians or degrees, `force` 0–100, and JS integer semantics (`Math.trunc`) — the formula is otherwise unreproducible |
| V-15 | *"không phụ thuộc vào cửa hàng ứng dụng"*, *"nội dung hoàn toàn mới"* (§ 1.1, § 2.1) | State the IP constraint explicitly: "no Gunbound assets, names or trademarks; mechanics-inspired only" — and who signs that off |

## Verification items

Claims in the source that are external facts and must be checked against official documentation before they become
requirements (rule 02: never invent facts; verify or mark as assumption):

| # | Claim | Why it must be verified |
|---|-------|-------------------------|
| VF-01 | *"Workers free tier không hỗ trợ WebSocket"* (§ 2.4) | If the free plan does support WebSockets, the "no WebSocket for gameplay" rule is a preference, not a platform limit — it changes the signaling design space |
| VF-02 | Free-tier quotas: 100k req/day (Workers), 1M req/month (DO), 1,000 GB/month (TURN) (§ 2.3, NFR-02) | Quotas and DO pricing change; the whole § 2.4 architecture rests on these numbers |
| VF-03 | Phaser 4 auto-selects WebGL/WebGPU (§ 2.3, NFR-01) | Confirm Phaser 4 is released and that its renderer selection works on the target iOS 16+ / Android 12+ browsers before pinning the framework |
| VF-04 | *"Để WebRTC hoạt động ổn định trong PWA, không thêm thẻ meta apple-mobile-web-app-capable"* (§ 2.4, § 9) | This iOS behavior is version-sensitive; verify on current iOS before making "runs in a Safari tab" a product constraint |

## Glossary candidates

| Term (as in source) | Probable meaning | Source |
|---------------------|------------------|--------|
| Bắn súng đạn đạo theo lượt | Turn-based artillery game | § 1.1 |
| Đạn đạo / quỹ đạo đạn | Ballistics / projectile trajectory | § 1.1, FR-04 |
| Lượt / lượt đi | Turn / current turn | § 6.2, § 7.2 |
| Phòng / mã phòng | Room / 6-character room code | FR-01, § 6.1 |
| Sảnh chờ | Lobby (waiting state of a room) | § 2.2 |
| Host / chủ phòng (người tạo phòng) | Authoritative player running the simulation | § 1.3, FR-02 |
| Peer | Non-host player sending input, receiving snapshots | § 1.3 |
| Host migration | Election of a new host when the current one drops | FR-06, § 5.3 |
| Snapshot | Game-state packet sent by host | § 1.3, FR-05 |
| Tick | One physics update step | § 1.3, FR-04 |
| Bắt tay (WebRTC) | WebRTC handshake / signaling | § 2.2, § 5.2 |
| Vòng cung ngắm | Aiming arc / predicted trajectory preview | FR-03, § 7.2 |
| Thanh lực | Power bar | FR-03, § 7.2 |
| Joystick ảo | Virtual joystick (nipplejs or Phaser `addPointer(2)`) | FR-03 |
| Nhân vật | Character / unit | FR-03, § 8 P4 |
| Vũ khí | Weapon | § 8 P4 |
| Bản đồ / màn chơi tĩnh | Map / static level | § 8 P1, FR-07 |
| Trọng lực, gió | Gravity, wind (per-map vector) | FR-04, § 6.3 |
| Máu / sát thương | HP / damage | § 6.2, § 7.2, § 7.3 |
| Bỏ lượt | Skip turn | § 7.2 |
| Người thắng | Winner | § 7.3 |
| Luyện tập | Practice mode (offline) | § 2.2, FR-07 |
| Lượng tử hóa vị trí | Position quantisation (snapshot compression) | FR-05 |
| Phiên / token phiên ngắn hạn | Session / short-lived session token | NFR-04 |
| Lease (TURN credential) | Time-boxed ICE credential, 1 hour | NFR-04 |
| Iceberg/TURN/STUN/SDP/ICE candidate/DataChannel | WebRTC connectivity terms (kept in English) | § 1.3, § 5.2 |
| Durable Object (DO) | Per-room stateful Cloudflare object | § 1.3, § 5.1 |
| Free tier / hạn mức | Cloudflare free-plan quota | § 2.3, NFR-02 |
| Particle / trail / texture atlas | VFX and asset-packing terms | FR-04, § 9 |
| Scale Manager / `Phaser.Scale.FIT` | Phaser viewport scaling | NFR-05 |
| HUD | On-screen health/turn/wind panel | § 7.2 |
