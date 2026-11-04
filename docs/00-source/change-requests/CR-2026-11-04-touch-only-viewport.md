# CR-2026-11-04 — fullscreen window, pinch zoom, measuring ruler and touch-only controls

- **Raised**: 2026-11-04 by the client
- **Status**: approved
- **Affects**: `02-reference/screens/match.md`, `02-reference/gameplay/tunables.md` § 9, `01-overview/{glossary,conventions,project-overview,nonfunctional-requirements}.md`,
  `03-stories/EPIC-05-match-ui/{US-MATCH-002,US-MATCH-006,US-MATCH-007}`, `05-quality/test-cases.md`,
  `03-stories/delivery-plan.md`, `04-decisions/open-questions.md` (`OQ-38`…`OQ-40`)

## Request

> tôi muốn game ở dạng full màn hình landscape. có thể zoom to nhỏ. mặc định window hiển thị sẽ có size 1/2 ngang toàn
> map và 1/2 cao toàn map. trên màn hình window size nhỏ nhất sẽ có tick bottom chia làm 8 phần, cao 8 phần. khi zoom
> rộng ra nó sẽ tiến dần lên 16 phần để người chơi đo đạc tính lực bắn. bỏ joystick đi, tất cả chuyển thành thao tác trên
> mobile. move 2 ngón là di chuyển window để nhìn map, move 1 ngón là kéo lực bắn. khi đến turn của mình sẽ hiển thị 4
> hướng quanh mobile. trái phải là di chuyển, lên xuống là chỉnh góc. lực bắn sẽ hiển thị khi người chơi kéo lực, nó sẽ
> hiển thị dưới dạng vòng tròn gradient quanh mobile và có con số chi tiết bên trong từ 0-4

Translated: fullscreen landscape, zoomable; the default window shows **½ the map width × ½ the map height**; at the
smallest window the bottom has a ruler of **8 parts**, growing toward **16 parts** as you zoom out, so the player can
measure a shot; **remove the joystick**, everything on touch; two fingers move the window, one finger pulls power; on your
turn **four directions appear around the mobile** — left/right move, up/down adjust angle; power shows as a **gradient
ring around the mobile with a 0–4 number inside**.

## What changes

| Area | Before | After |
|---|---|---|
| Frame | landscape page, HUD strips | **fullscreen** (`requestFullscreen`; viewport + safe-area fallback on iPhone, `OQ-39`) |
| Camera | whole map visible | **window**, default **1000 × 600 units** (½ map each way), pinch ≤ 4×, pan 1:1, clamped to bounds |
| Measuring | none | **ruler**, `segments = clamp(round(8 × visibleWidth / 1000), 8, 16)` — 8 at default, 16 at whole map |
| Joystick | optional in source § 2.2 | **removed** (`OQ-40`) |
| Power control | bar filled by drag, `force` 0–100 shown | **ring around the mobile**, gradient, numeric **0.0–4.0** inside, `force = power × 25`, release fires above a **0.3** dead zone (`OQ-38`) |
| Angle control | drag direction only | drag direction **plus** ▲ ▼ on the pad (±1°/tap, 10°/s held) |
| Movement | left/right buttons + run toggle | **four-way pad anchored to the mobile** at a 96 px ring |
| Gestures | one finger aims, second finger halves sensitivity | one finger = power, **two fingers = pan**, **pinch = zoom**; a two-finger gesture cancels the pull without firing |

## Why 0–4 for power

It is GunBound's own power bar (`POWER_BAR_MAX = 4.0` in the recovered model), and the integrator already consumes
`force` in 0–100, so `force = power × 25` keeps the displayed number identical to the quantity the physics uses. The ring
is drawn at a fixed 64 px screen radius so the number stays readable while the camera zooms.

## Why the ruler doubles instead of scaling

One division stays ≈125 world units across the zoom range (1000/8 at default, 2000/16 at whole map). A fixed 8-division
ruler would print 250-unit divisions at full map — too coarse to measure a shot — and a fixed 125-unit grid would be
unreadable at half map. Doubling keeps both readable, and each label prints its current world width so the ruler never
lies about scale.

## Impact

- **One new story**: `US-MATCH-007` (M, P0, wave W3) — camera, zoom, ruler, fullscreen. `US-MATCH-002` and `US-MATCH-006`
  rewritten in place (no id change, no size change).
- Schedule: 51 → **52 stories**, 111 → **113.5 story-days**; W3 14.5 → 17. Milestones unchanged (M1 week 4 still demos
  a playable offline match, now with the camera in place).
- New OQs answered by decision: `OQ-38` (release-to-fire dead zone), `OQ-39` (fullscreen fallback), `OQ-40` (joystick
  removed). No story is blocked by them.
- Test cases: `TC-MATCH-902/907` re-scoped, `TC-MATCH-915`…`TC-MATCH-922` added.

## Alternatives rejected

- **Keep the power bar in a corner** — the client asked for the ring; a corner bar also forces the eye away from the target
  exactly when precision matters.
- **Fixed 8-part ruler at every zoom** — unusable at whole-map zoom (250-unit divisions).
- **A joystick for movement** — it competes with the one-finger power pull for the thumb and the gesture space.
- **Fire button instead of release-to-fire** — an extra control on an already crowded canvas; the dead zone plus
  two-finger cancellation covers the accidental-release case, and the M1 playtest will confirm (`OQ-38`).
