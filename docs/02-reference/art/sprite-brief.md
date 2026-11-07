# Sprite brief — the hand-off package for generating the art

**Status:** blocked by `OQ-20` (the client's policy on AI-generated assets: disclosure, brand approval, provenance) and
scheduled after `M2` by [`ADR-0006`](../../04-decisions/adr/ADR-0006-vector-renderer-until-after-m2.md). This file is the
*input* to whatever generator is approved — it is written now so the work can start the day `OQ-20` is answered.

**Who this is for:** a person (or a model) that produces images, not code. Every number below is read from the running
code, so a sprite that obeys this page lands on the screen without a single code change beyond the loader.

---

## 1. Legal frame — read this first

- **Original work only.** The game is GunBound-*inspired*; no GunBound asset, sprite, map, name, logo or UI may be
  copied, traced or "referenced closely" (`OQ-18`, `docs/00-source/brief.md` § 4). Do not feed GunBound screenshots to
  a generator as a style reference; describe the style in words instead (there is a vocabulary in § 6).
- **Provenance is kept.** Every delivered file records the tool, the prompt and the date in `manifest.json` (§ 8), because
  `OQ-20` requires disclosure and the client signs off at `M2`.
- Nothing ships into `apps/web/public/art/` until that manifest exists.

## 2. How the game draws today — the facts a sprite has to obey

| Fact | Value | Where |
|------|-------|-------|
| World size | **2000 × 1200 world units** | `packages/core/src/tuning.ts` `mapWidth`/`mapHeight` |
| Terrain resolution | height sampled every **2 units** | `terrainStep` |
| Default camera window | 1000 × 600 units (5:3) | `viewDefaultWidth`/`viewDefaultHeight` |
| Maximum zoom-in window | **250 × 150 units** | `zoomMaxWidth`/`zoomMaxHeight` |
| Therefore pixels per world unit | **0.42 at the whole map → 3.38 at maximum zoom** (844 px canvas) | `apps/web/src/game/scene.ts` `update()` |
| Mobile footprint drawn today | 52 wide (`halfWidth` 26) × 16 hull, treads 12 tall, barrel 30 long, turret radius 8 | `scene.ts` `drawPlayer` |
| Health bar | 52 × 7, drawn 22 units above the turret | same |
| Shield arc | radius 30, semicircle | same |
| Active-player ring | radius 34 + a 8 × 8 caret 12 units above | same |
| Facing | mirrored on `x` (`facing ±1`); the barrel rotates, the body does not | same |
| Team accents | A `#4f9dff` (blue), B `#ff7043` (orange) | `scene.ts`, `styles.css` |
| HP colours | `#5cd67a` > 50 %, `#f2c14e` > 25 %, `#e5544b` below | same |
| Outline / shadow colour | `#16202b`, shadow `#000000` at 28 % | same |

**Anchor rule.** Every mobile sprite is anchored **bottom-centre at the point where the treads touch the ground**
(`frame.y` is the ground line). Nothing may be drawn below that line — the terrain is carved out from under the sprite.

**Mirror rule.** Deliver the mobile facing **right**; the engine mirrors it. Do not bake any asymmetry that must stay
put (a flag on the left side would mirror too).

**Tint rule.** The hull accent is a *team colour*, so deliver the body as neutral metal and the accent panels as a
**separate layer on its own canvas** (§ 4), which the client multiplies by `#4f9dff` or `#ff7043`. Do not bake blue or
orange into the body.

## 3. Delivery format

| Property | Requirement |
|----------|-------------|
| Format | PNG-24 with alpha for sources; the build may convert to WebP. No JPEG (alpha), no SVG (the mobile is raster art) |
| Authoring scale | **4 px per world unit** (so a 52-unit mobile is 208 px wide in the file) — it downsamples cleanly to the 0.42 px/unit whole-map view and stays sharp at 3.38 |
| Background | fully transparent, no baked shadow beyond the tread contact strip |
| Colour space | sRGB, no colour profile chunk |
| Per-file budget | ≤ 120 KB after WebP, ≤ 400 KB as PNG source |
| Total budget | ≤ 3 MB for the whole art set (the PWA keeps a 5 MB first-load budget, `TC-PWA-043`; the match chunk is lazy) |
| Naming | `apps/web/public/art/<group>/<id>[@<state>][_<layer>].png` — lower-case, hyphenated ids exactly as below |

## 4. Asset inventory — what to draw, in what size

Authoring canvas is given in **pixels at 4 px/unit**, i.e. `world units × 4`.

### 4.1 Mobiles — 20 units × 3 files each

| File | Canvas | Anchor | Content |
|------|--------|--------|---------|
| `mobile/<id>.png` | **384 × 256** (96 × 64 units) | bottom-centre | body, turret base, treads; neutral metal, dark outline, three-tone cel shading |
| `mobile/<id>_accent.png` | 384 × 256 | bottom-centre, same grid | only the panels that should carry the team colour, as flat white shapes with alpha — the client tints them |
| `mobile/<id>_wreck.png` | 384 × 256 | bottom-centre | the destroyed silhouette: same footprint, crushed, no barrel, cooled ash tones; the client fades it to 55 % |

The 20 ids and the traits that should show in the silhouette:

| id | Name | Archetype | Trajectory | HP / shield | Effect | Shot classes (1 / 2 / super) | Angle window |
|----|------|-----------|-----------|-------------|--------|------------------------------|--------------|
| `mbl-01` | Stone Sentinel | balanced | standard | 1050 / 150 | explosion | arc r80 / flat r70 / arc r110 | −10…45° |
| `mbl-02` | River Warden | support | lobber | 1000 / 300 | impact | arc r85 / lob r95 / cluster r120 | 38…82° |
| `mbl-03` | Iron Tortoise | tank | skimmer | 1200 / 200 | explosion | arc r90 / bounce r80 / arc r120 | −8…38° |
| `mbl-04` | Glacier Mammoth | tank | lobber | 1150 / 250 | impact | lob r95 / bounce r82 / arc r118 | 30…88° |
| `mbl-05` | Storm Falcon | sniper | direct | 925 / 0 | laser | flat r60 / piercing r55 / beam r40 | −20…25° |
| `mbl-06` | Silver Ibex | sniper | direct | 950 / 50 | laser | flat r58 / arc r65 / beam r42 | −15…30° |
| `mbl-07` | Ash Behemoth | bombardier | mortar | 1100 / 100 | explosion | lob r100 / cluster r90 / lob r130 | 45…88° |
| `mbl-08` | Volcano Toad | bombardier | mortar | 1075 / 150 | explosion | lob r98 / bounce r85 / cluster r128 | 40…85° |
| `mbl-09` | Moon Hare | bouncer | skimmer | 975 / 100 | impact | bounce r80 / flat r65 / bounce r110 | −5…45° |
| `mbl-10` | Coral Crab | bouncer | skimmer | 990 / 120 | laser | bounce r78 / arc r70 / beam r45 | 0…42° |
| `mbl-11` | Pale Stag | all-rounder | standard | 1020 / 280 | impact | arc r85 / flat r70 / cluster r120 | −12…42° |
| `mbl-12` | Sacred Crane | support | standard | 980 / 260 | laser | arc r82 / beam r40 / cluster r118 | −8…48° |
| `mbl-13` | Cinder Fox | glass | direct | 900 / 0 | explosion | flat r60 / arc r70 / arc r90 | −18…28° |
| `mbl-14` | Sky Serpent | glass | direct | 920 / 0 | laser | flat r58 / cluster r85 / beam r44 | −16…32° |
| `mbl-15` | Jade Dragon | balanced | standard | 1050 / 150 | explosion | arc r80 / piercing r60 / arc r115 | −10…50° |
| `mbl-16` | Sun Lion | all-rounder | standard | 1060 / 180 | explosion | arc r82 / bounce r78 / cluster r122 | −6…46° |
| `mbl-17` | Sand Wyrm | zoner | mortar | 1025 / 150 | impact | lob r95 / piercing r60 / cluster r125 | 48…88° |
| `mbl-18` | Frost Hydra | zoner | mortar | 1040 / 120 | impact | lob r96 / arc r80 / lob r130 | 42…86° |
| `mbl-19` | Shadow Cat | trickster | skimmer | 950 / 100 | electric | bounce r70 / cluster r85 / arc r100 | −8…44° |
| `mbl-20` | Mist Raven | trickster | direct | 940 / 80 | electric | bounce r70 / beam r42 / beam r38 | −20…35° |

### 4.2 Barrel and shells

| File | Canvas | Notes |
|------|--------|-------|
| `gun/barrel.png` | 160 × 32 (40 × 8 units) | pivot at the left-centre (the turret centre); rotates around it. Neutral metal, dark outline |
| `shot/arc.png`, `flat`, `lob`, `bounce`, `cluster`, `piercing`, `beam` | 96 × 96 each | the projectile, drawn at ~8 units → 32 px; a small readable silhouette per class: **arc** = rounded shell, **flat** = dart, **lob** = fat mortar bomb, **bounce** = ridged ball, **cluster** = segmented pod, **piercing** = long needle, **beam** = bright capsule |

### 4.3 Effects — four families

| File | Canvas | Notes |
|------|--------|-------|
| `fx/<effect>.png` × `explosion`, `impact`, `laser`, `electric` | 128 × 128 | the *hit* mark at the blast centre; explosion = fireball with a hard white core, impact = dust cone, laser = bright spark with rays, electric = violet crackle |
| `fx/burst_<size>_<frame>.png`, sizes `sm`/`md`/`lg`, 8 frames each | 256 × 256 per frame | the blast ring that grows to the tier radius: `sm` = 0.4 R (inner), `md` = 0.7 R, `lg` = 1.0 R — three tiers, because the engine scores by ring |
| `fx/trail.png` | 32 × 32 | a soft dot the client stamps along the flight path |

### 4.4 Terrain — 11 biomes

The terrain is a live heightmap the engine carves, so **do not draw the terrain**: deliver the materials it is filled with.

| File | Canvas | Notes |
|------|--------|-------|
| `terrain/<map-id>_fill.png` | 512 × 512, **seamless** | the ground body, tiling on both axes; no outline, no gradient direction |
| `terrain/<map-id>_surface.png` | 512 × 96, seamless horizontally | the top 24 units: grass, sand, snow crust, slag, whatever the biome says; this is what a player reads as "the ground line" |
| `terrain/<map-id>_crater.png` | 128 × 128 | charred decal stamped under a crater |

The 11 map ids, with the biome each name implies:

`map-01` Megalith Plain (rocky grass) · `map-02` Jade Terraces (jade-green terraced soil) · `map-03` Frost Fjord
(blue-grey ice over stone) · `map-04` Ember Caldera (black basalt, ember veins) · `map-05` Cloud Bridge (pale
highland rock) · `map-06` Sunken Ruins (wet stone, algae) · `map-07` Amber Dunes (orange sand) · `map-08` Moonlit
Grove (dark moss, blue moonlight) · `map-09` Iron Quarry (grey gravel, rust) · `map-10` Coral Shelf (pink coral sand,
wet rock) · `map-11` Storm Spire (dark slate, lightning-scorched).

### 4.5 Backdrops — two parallax layers per map

| File | Canvas | Notes |
|------|--------|-------|
| `sky/<map-id>_far.png` | 3376 × 2026 (2× of 1688 × 1013 at the default window) | sky, distant silhouettes; moves at 0.3× the camera |
| `sky/<map-id>_near.png` | 3376 × 2026 | mid-ground shapes; moves at 0.6×; keep the lower third calm so the terrain edge reads |

Backdrops must stay **dark and low-contrast behind the HUD**: the top strip carries the roster, clock, wind dial and the
ruler, so nothing busy or bright may sit in the upper 25 %.

### 4.6 Icons

| Group | Files | Canvas |
|-------|-------|--------|
| Weapon classes | `icon/class_arc`, `_flat`, `_lob`, `_bounce`, `_cluster`, `_piercing`, `_beam` | 128 × 128, stroke-only, 8 px stroke, reads at 28 px |
| Items | `icon/itm-blood`, `itm-bunge`, `itm-change-wind`, `itm-dual`, `itm-dual-plus`, `itm-power-up`, `itm-team-teleport`, `itm-teleport`, `itm-thunder` | 128 × 128 |
| Emotes | `icon/emote-01` … `emote-08` | 128 × 128; these are what `US-MATCH-004` shows instead of a sentence |
| Avatars | `avatar/avatar-01` … `avatar-12` | 256 × 256, square, no alpha needed; player-picked, used on the profile and in the roster |

## 5. Scale check — the one test every sprite must pass

Look at the sprite at **44 px wide** (the mobile at the default camera) and ask: can I tell a tank from a sniper from a
bomber? If not, the silhouette is wrong — the shape has to carry the archetype, because at 44 px nothing else survives.
Then look at **176 px wide** (maximum zoom) and ask: is there anything here that was not drawn, i.e. a blurred upscale?

## 6. Style vocabulary — describe the look, never copy a reference

> 2D side-view stylised military vehicle, chunky readable silhouette, three-tone flat cel shading, thick near-black
> outline (#16202b) of 3–4 px at 4 px/unit, soft rim light from the upper left, a single warm bounce light from below,
> weathered but clean, saturated accent panels, painterly-but-flat texture, no perspective distortion, no photographic
> material.

Per-mobile prompt skeleton (fill from § 4.1):

> Side view of a {archetype} artillery mobile for a turn-based tank game: {name}. Body about 52 units wide and 16 tall,
> mass and stance of a {tank | sniper | bombardier | support | skimmer}, a single rotating turret barrel pointing right,
> trait visible in the silhouette: {heavy armour and wide treads | long thin barrel and tall sighting mast | short fat
> mortar tube and a squat body | sensor dish and antenna | light sprung legs and a low deck}. Neutral steel body, the
> panels that will be tinted separately left flat white. Thick dark outline, flat three-tone shading, transparent
> background, bottom-aligned, centred, no shadow on the ground beyond a thin contact strip, facing right.

Negative prompt, always:

> photorealistic, 3D render, octane, glossy highlights, gradient mesh, text, letters, numbers, watermark, signature,
> logo, UI frame, drop shadow, ground plane, background scenery, anime pilot, human figure, gun pointed at the camera,
> perspective view, isometric, blue or orange body panels, blurry, soft focus, extra turrets, extra treads, cut-off
> edges, borders.

## 7. What NOT to generate

- **UI chrome** — panels, buttons, the pad, the HUD frame: those are CSS in `apps/web/src/styles.css` and must stay
  vector so they scale with the tap floor and the 200 % text test (`TC-PWA-159`).
- **Text of any kind** — every string is `apps/web/src/i18n/{vi,en}.json`.
- **Health bars, shield arcs, the active ring, the ruler, the power ring** — drawn from values; a bitmap would go stale
  the moment a tunable changes.
- **Whole battlefields with the units baked in** — positions are the engine's.

## 8. The hand-over contract

```
apps/web/public/art/
├─ manifest.json
├─ mobile/   mbl-01.png, mbl-01_accent.png, mbl-01_wreck.png, … (20 × 3)
├─ gun/      barrel.png
├─ shot/     7 files
├─ fx/       4 hits + 3 sizes × 8 frames + trail
├─ terrain/  11 × 3
├─ sky/      11 × 2
├─ icon/     7 classes + 9 items + 8 emotes
└─ avatar/   12
```

`manifest.json` (the loader reads this and nothing else):

```json
{
  "version": 1,
  "generatedWith": "<tool and model>",
  "credit": "<the line the client approves under OQ-20>",
  "scale": 4,
  "assets": [
    {
      "id": "mobile/mbl-01",
      "file": "mobile/mbl-01.png",
      "width": 384,
      "height": 256,
      "anchor": [0.5, 1.0],
      "unitsWide": 96,
      "unitsTall": 64,
      "states": ["wreck"],
      "tinted": "mobile/mbl-01_accent.png"
    }
  ]
}
```

**Two rules that keep the physics honest:** `unitsWide`/`unitsTall` are *world* units at the authoring scale, so the
loader can map 4 px back to 1 unit and a sprite is never scaled by guesswork; and the anchor is the ground contact
point, so replacing the vector renderer cannot move a collision footprint (`ADR-0006`).

## 9. Order of work, when `OQ-20` is answered

1. **Pilot set (2 days):** `mbl-01` body + accent + wreck, `gun/barrel`, `map-01` terrain trio and sky pair. Ship it behind
   a flag; look at it at 44 px and 176 px on a phone before generating 20 of anything.
2. **Review gate:** the pilot answers three questions — does the tint read as a team colour, does the ground line read
   against the terrain surface, does the HUD stay legible over the new sky. If not, adjust the brief, not the code.
3. **Bulk:** the other 19 mobiles, the 7 shells, the effects, the remaining 10 biomes.
4. **Icons last:** they are the least risky and the least visible during play.
5. **Then** the loader story exists (`US-MATCH-008`, to be written) — until it does, nothing loads these files and the
   vector renderer stays the truth.
