# Blueprint JSON Schema v5.1 (`blueprint.json`)

100% theme-agnostic declarative contract validated and compiled by `scripts/compile_rig_studio.mjs` (supports `--kit-dir` and `--library-dir`), validated by `scripts/validate_pack.mjs` (`--strict-craft`), verified by `scripts/library_cli.mjs verify`, and visually audited by `scripts/render_audit.mjs`.

## 1. Top-Level Structure

| Key | Required | Purpose |
| --- | :---: | --- |
| `meta` | Yes | `{ packId, version, title, subtitle?, icon?, seed? }` — `seed` drives deterministic LCG (`makeRng`) and `paperTex` grain across both pack SVGs and HTML viewer. |
| `scene` | Yes | Canvas size, `<defs>`, cardstock `materials[]`, backdrop, proscenium frame, lighting (including `bevel*`), multiplane scenery (`backLayers`, `midLayers`, `frontLayers`), multi-variant organic `clusters[]`, emitters, celestial rig, swarms, overlay props. |
| `parts[]` | Yes | Non-empty list of reusable SVG body/prop parts drawn around local `(0, 0)` pivot — either inline `svg` or Modular Kit `kitRef`. |
| `rigs[]` | Yes | Non-empty list of independent articulated skeletal rigs (legacy single `rig` also accepted). |
| `motions[]` | No | Named presets (`type: "cycle"` or `type: "harmonic"`). Evaluated as a **pure function of `t`** (omitted bones/rigs/scaleWaves cleanly reset to rest pose; zero state leakage across phases). |

---

## 2. `scene` Contract (100% Data-Driven)

- **`width` / `height`:** Positive numbers; default `960 × 540` (16:9 widescreen) or `960 × 720` (4:3).
- **`bgColor`:** CSS color behind the stage.
- **`defsSvg`:** SVG `<linearGradient>`, `<radialGradient>`, `<clipPath>`, `<pattern>`, or `<filter>` declarations. **Every custom `url(#id)` / `href="#id"` used in `parts[].svg` MUST exist here** so exported standalone `.svg` files pass `validate_pack.mjs`.
  - Built-in `<defs>` available to **BOTH `scene.*` AND standalone `parts[].svg`** (compiler auto-embeds referenced defs into pack SVGs): `paperTex`, `paperBevel`, `paperBevelSoft`, `gouacheGrain`, `pat-linen`, `pat-crosshatch`, `pat-kraft`, `pat-ribbed`, `pat-dots`, `pat-vellum`, plus all custom IDs declared in `scene.materials[]`.
  - Viewer-only `<defs>` (for `scene.*` only): `chalkShadow`, `shadowDeep`, `shadowMed`, `shadowSoft`, `shadowInner`, `softGlow`, `silhouetteFilter`, `groundShadowGrad`, `dynVfxGlow`, `autoVignette`, `meteorTrail`, `stageClip`, plus `autoFocalGlow` and `autoMistGrad` when configured in `lighting`.
- **`materials[]` (Optional Custom Cardstock Patterns):**
  ```json
  "materials": [
    { "id": "pat-coat-linen", "type": "linen", "color": "#5c3d2e", "bg": "#8c6248", "opacity": 0.28, "scale": 1.1 },
    { "id": "pat-wall-kraft", "type": "kraft", "color": "#3d2e22", "opacity": 0.22, "scale": 1.0 }
  ]
  ```
  - Allowed `type`: `"linen" | "crosshatch" | "kraft" | "ribbed" | "dots" | "vellum"`.
  - All `id`, `type`, and colors (`color`, `altColor`, `bg`) are validated fail-closed (`BP_SCHEMA`).
- **`skySvg`:** Full-canvas sky/backdrop SVG fragment.
- **`frame`:** Universal rounded shadow-box proscenium frame:
  ```json
  "frame": { "style": "proscenium", "radius": 56, "inset": 10, "step": 12, "layers": ["#OUTER_DARK", "#MID_HUE", "#INNER_WARM"] }
  ```
  - **Layer order:** `layers[0]` is the **outermost** dark border; `layers[layers.length - 1]` peeks furthest **inward**. Set `style: "none"` to disable or provide custom `frameSvg` / `cornersSvg`.
- **`lighting`:** `{ focalGlow?: { x, y, r, color, midColor?, opacity? }, mist?: { y, height, color, opacity? }, vignetteColor?, vignetteOpacity?, shadowColor?, shadowOpacity?, chalkShadows?: boolean, bevelDir?: [dx, dy], bevelWidth?: number, bevelLightColor?, bevelLightOpacity?, bevelDarkColor?, bevelDarkOpacity? }` — customize `shadowColor` / `vignetteColor` / `bevelLightColor` for bright daylight, golden hour, indoor, or night themes.
- **`stars`:** `{ count, maxY?, color? }` — seeded twinkling sky points (omit or set `count: 0` for daylight/indoor scenes).
- **`celestial`:** `{ x, y, rings?: [{ r, fill }], coreSvg?, orbitSvg?, orbitSpeed? }` (works for sun, moon, rose window, or clock halo).
- **`atmosphere`:** Optional overrides `{ lightShaftsSvg?, midMistSvg?, foregroundGlowSvg? }`.
- **`backLayers[]` / `midLayers[]` / `frontLayers[]`:** Multiplane parallax strips (use `scripts/lib/scene-craft.mjs` `terrainRidgeLayer`, `storyTree`, `foliageSpray`, `windingPath` for natural non-symmetric scenery):
  `{ z?: number, parallax?: number, swayAmp?: number, swayFreq?: number, phase?: number, filter?: "shadowDeep"|"shadowMed"|"shadowSoft"|"gouacheGrain", svg: string }`.
  - Items in **`midLayers[]`** interleave by `z` directly with `rigs[]`, `clusters` having `lane: "mid"`, and `overlayProps` having `lane: "mid"`!
- **`clusters[]`:** Procedural multi-variant organic motif scatter (foliage tufts, blossoms, roof tiles, coral fans — **never triangles or high-contrast white confetti shards**):
  ```json
  {
    "lane": "back", "z": 1, "mode": "arc", "cx": 740, "cy": 160, "rx": 180, "ry": 95, "a0": -3.14, "a1": 0.2,
    "count": 32, "seed": 3011, "scaleMin": 0.8, "scaleMax": 1.35, "rotMin": -10, "rotMax": 10,
    "alignToPath": true, "sortY": true, "scaleByProgress": [1.15, 0.8],
    "parallax": 15, "sway": 2.4, "filter": "shadowSoft",
    "palette": [["#LIGHT_A", "#DARK_A", "#ACCENT_A"], ["#LIGHT_B", "#DARK_B", "#ACCENT_B"]],
    "shapesSvg": [
      "<path d=\"M0 -14 C6 -10 10 -2 7 8 C3 11 0 10 0 12 Z\" fill=\"FILL_A\"/><path d=\"M0 -14 C-6 -10 -10 -2 -7 8 C-3 11 0 10 0 12 Z\" fill=\"FILL_B\"/>",
      "<path d=\"M0 8 C2 -4 9 -10 12 -16 C7 -14 3 -8 1 -18 C-1 -8 -5 -12 -10 -14 C-7 -6 -2 -2 0 8 Z\" fill=\"FILL_A\" stroke=\"FILL_C\" stroke-width=\"0.8\"/>"
    ]
  }
  ```
- **`emitters[]`:**
  - `type: "falling"`: `{ type: "falling", count, seed, speedY, windX?, swayAmp?, scale?, yMin?, yMax?, palette?: [[cA, cB, cC?]], shapesSvg?: [string] }` (`speedY > 0` falls, `speedY < 0` rises; optional `yMin`/`yMax` keeps particles strictly within a vertical band).
  - `type: "fireflies"`: `{ type: "fireflies", count, seed, xMin?, xMax?, yMin?, yMax?, color? }`.
  - `type: "meteor"`: `{ type: "meteor", x0, y0, dx, dy, period?, dur?, offset?, len?, color?, gradId? }`.
- **`swarms[]`:** Perspective 2-bone creatures/vehicles.
- **`overlayProps[]`:** Gently swaying props `{ lane?: "front"|"mid", z?: number, x, y, parallax?, scale?, freqX?, freqY?, ampX?, ampY?, tiltAmp?, svg }`.
- **`waterlineY`:** Optional default Y trigger reference for `proximity`-mode `vfx.burst`.

---

## 3. `parts[]`, Modular Component Kits, Seamless `hoses[]` & `rigs[]` Contract

### `parts[]` item (Inline SVG or Modular Kit `kitRef`)
```json
{ "id": "heroHead", "category": "head", "kitRef": { "id": "head-3q-storybook", "tokens": { "SKIN": "#f7d7be", "HAIR_MAIN": "#5e3726" }, "scale": 1 } }
```
- Built-in kits in `assets/kit/`: `head-3q-storybook`, `eye-expressive` (includes `data-eye="1"` auto-blink), `boot-cuffed`, `hand-relaxed`, `hand-grip`, `hand-open`, `hand-point`, `tuft-layered-fan`, `frond-tapered-cluster`, `branch-forked-organic`, `rock-faceted-origami`, `cloud-scalloped-tier`, `kirigami-rosette`, `lantern-faceted`.
- Any `<g data-eye="1" transform="translate(cx,cy)">...</g>` inside a `part.svg` automatically blinks cleanly around `(cx, cy)` using `rig.blink`!

### `rigs[]` item (v3.0 Seamless Limbs, Blink & Inertia)
- Root properties: `id`, `label?`, `characterId?`, `rootPos: { x, y }`, `facing?: 1|-1`, `scale?: number`, `z?: number`, `parallax?: number`, `groundY?`, `shadowRx?`, `shadowRy?`, `shadowOffsetX?`, `shadowStyle?: "chalk"|"soft"`, `groupShadow?: "shadowDeep"|"shadowMed"|false`, `blink?: false | { period?: number, duration?: number, phase?: number }`, `sides?: ["l","r"]`, `variants?: { [group]: string[] }`, `ik?: { [ikId]: { upper, lower, end, bend?: 1|-1 } }`, `hoses?: HoseSpec[]`, `contacts?`.
- Each item in `bones[]`:
  `{ id, label?, parent: string|null, attach: string|null, part: string, variantGroup?, variants?, limits: { min, max }, rest?: number, z?: number, hiddenInViewer?: boolean, seamGroup?: string, seamFilter?: "paperBevelSoft"|"paperBevel"|"gouacheGrain"|"none", followThrough?: { lag?: number, velGain?: number, vertGain?: number, rotGain?: number }, shadow?: "none"|"shadowInner"|"shadowSoft", brad?: { r?, fill?, stroke? } }`.
  - **`seamGroup`:** Adjacent z-sorted bones/hoses sharing the same `seamGroup` are composited inside a single `<g data-seam-group="..." filter="url(#seamFilter)">` so joint seams vanish completely!
  - **`hiddenInViewer: true`:** Keeps the bone in the kinematic/exported pack hierarchy (`validate_pack.mjs` stays 100% valid) while letting `rig.hoses[]` draw a seamless continuous Bézier limb in the viewer!
  - **`followThrough`:** Pure, stateless closed-form secondary lag (`t` vs `t - lag`) driven by horizontal/vertical velocity and parent angular velocity.
- **`rig.hoses[]` (Continuous Tapered Bézier Limbs — Zero Joint Seams):**
  ```json
  "hoses": [
    {
      "id": "arm_near_hose", "upper": "arm.r.u", "lower": "arm.r.l", "end": "hand.r",
      "z": 4.2, "widthStart": 15, "widthMid": 12, "widthEnd": 8.5, "roundness": 0.85,
      "fill": "url(#sleeveGrad)", "lowerFill": "#f5cfb0", "cuffAt": 0.62, "cuffFill": "#fffdf7",
      "rimColor": "#fff8e6", "seamGroup": "armNear", "seamFilter": "paperBevelSoft"
    }
  ]
  ```
  - Validated fail-closed (`BP_RIG_INVALID` if `upper`/`lower`/`end` bone missing; `BP_SVG_UNSAFE` / `BP_MISSING_DEF` on `fill`, `lowerFill`, `cuffFill`, `rimColor`, `filter`).

---

## 4. `motions[]` Contract (Pure `t → pose` + Analytic IK `gait` + `spins` + `scaleWaves`)

- **Analytic 2-Bone IK `gait` (inside any `phase.rigs[rigId]` or `harmonic.rigs[rigId]`):**
  ```json
  "gait": {
    "freq": 1.05, "stride": 42, "lift": 16, "bob": 5.5, "stanceFrac": 0.6,
    "spineBone": "torso", "spineSway": 3.2, "headBone": "head", "headBob": 2.2,
    "swingBones": [{ "bone": "arm.l.u", "phase": 0.0, "amp": 20 }, { "bone": "arm.r.u", "phase": 0.5, "amp": 20 }],
    "chains": [
      { "ik": "legL", "phase": 0.0, "footBone": "foot.l", "toeOff": 14, "heelStrike": -8 },
      { "ik": "legR", "phase": 0.5, "footBone": "foot.r", "toeOff": 14, "heelStrike": -8 }
    ]
  }
  ```
  - Automatically computes `2×` vertical hip bob per stride, 60% ground-locked stance, 40% lifted knee-bent swing via `solveIk`, and flat-to-toe-off foot leveling!
- **Story Cycle (`type: "cycle"`):**
  - Supports `rootX`, `rootY`, `arcY`, `ease` (`"smooth" | "linear" | "back"`), `facing`, `gait`, `emote`, `bones`, `spins`, `waves`, `scaleWaves`, and `phase.vfx` (`glow`, `burst`, `particles`).
- **Harmonic Loop (`type: "harmonic"`):** Supports `rootWaveX`, `rootWaveY`, `facing`, `gait`, `emote`, `base`, `spins`, `waves`, and `scaleWaves` per rig.

---

## 5. Minimal Copy-Adapt Blueprint Template

```json
{
  "meta": { "packId": "my-diorama-v1", "version": "0.1.0", "title": "Diorama Title", "subtitle": "Short subtitle", "icon": "✂", "seed": 42 },
  "scene": {
    "width": 960, "height": 540, "bgColor": "#101828",
    "defsSvg": "<linearGradient id=\"skyG\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#101828\"/><stop offset=\"100%\" stop-color=\"#2c3e50\"/></linearGradient><linearGradient id=\"bodyG\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#f4a261\"/><stop offset=\"100%\" stop-color=\"#c86d3b\"/></linearGradient>",
    "skySvg": "<rect x=\"-20\" y=\"-20\" width=\"1000\" height=\"580\" fill=\"url(#skyG)\"/>",
    "frame": { "style": "proscenium", "radius": 54, "inset": 10, "step": 12, "layers": ["#0b1320", "#1c2e4a", "#3d5a80"] },
    "lighting": { "focalGlow": { "x": 480, "y": 300, "r": 260, "color": "#fff3b0", "midColor": "#f4a261", "opacity": 0.65 }, "mist": { "y": 300, "height": 150, "color": "#ffd6a5", "opacity": 0.2 }, "vignetteOpacity": 0.34 },
    "backLayers": [{ "parallax": 10, "filter": "shadowMed", "svg": "<path d=\"M-20 430 Q480 385 980 430 V560 H-20 Z\" fill=\"#1d3557\"/>" }],
    "midLayers": [{ "z": 1.5, "parallax": 15, "filter": "shadowMed", "svg": "<path d=\"M520 450 C524 410 536 390 546 450 Z\" fill=\"#2a4d69\"/>" }],
    "frontLayers": [{ "parallax": 20, "filter": "shadowDeep", "svg": "<path d=\"M-20 495 Q360 470 980 500 V560 H-20 Z\" fill=\"#0f1f33\"/>" }],
    "clusters": [{ "lane": "back", "mode": "arc", "cx": 760, "cy": 150, "rx": 160, "ry": 90, "a0": -3.14, "a1": 0, "count": 24, "seed": 101, "alignToPath": true, "palette": [["#e76f51", "#b84a30", "#ffd166"]], "shapesSvg": ["<path d=\"M0 -12 C6 -8 8 2 4 10 C1 11 0 11 0 12 Z\" fill=\"FILL_A\"/><path d=\"M0 -12 C-6 -8 -8 2 -4 10 C-1 11 0 11 0 12 Z\" fill=\"FILL_B\"/>", "<path d=\"M0 -14 C4 -6 10 -4 8 6 C4 10 0 9 0 11 C0 9 -4 10 -8 6 C-10 -4 -4 -6 0 -14 Z\" fill=\"FILL_A\" stroke=\"FILL_C\" stroke-width=\"0.8\"/>"] }],
    "emitters": [{ "type": "falling", "count": 16, "seed": 202, "speedY": 24, "windX": -14, "palette": [["#ffd166", "#d9a336"]], "shapesSvg": ["<path d=\"M0 -7 C4 -4 5 2 0 7 Z\" fill=\"FILL_A\"/><path d=\"M0 -7 C-4 -4 -5 2 0 7 Z\" fill=\"FILL_B\"/>"] }]
  },
  "parts": [
    { "id": "heroBody", "category": "body", "size": [120, 80], "pivot": [60, 40], "anchors": { "head": [96, 30] }, "svg": "<path d=\"M-40 -4 C-32 -22 18 -24 42 -12 C48 -4 44 14 26 20 C2 24 -28 20 -40 8 Z\" fill=\"url(#bodyG)\"/>" },
    { "id": "heroHead", "category": "head", "size": [60, 60], "pivot": [20, 30], "anchors": {}, "svg": "<path d=\"M-10 -4 C-8 -16 8 -18 20 -10 C28 -4 26 8 14 12 C2 15 -10 10 -10 -4 Z\" fill=\"url(#bodyG)\"/>" }
  ],
  "rigs": [
    {
      "id": "hero", "label": "Hero", "characterId": "hero", "rootPos": { "x": 420, "y": 395 }, "facing": 1, "scale": 1, "z": 1, "groundY": 445, "shadowRx": 48, "shadowRy": 9, "groupShadow": "shadowDeep",
      "bones": [
        { "id": "root", "parent": null, "attach": null, "part": "heroBody", "limits": { "min": -20, "max": 20 }, "rest": 0, "z": 0 },
        { "id": "head", "parent": "root", "attach": "head", "part": "heroHead", "limits": { "min": -30, "max": 30 }, "rest": 0, "z": 2, "shadow": "shadowInner" }
      ]
    }
  ],
  "motions": [
    { "id": "idle", "name": "Idle", "type": "harmonic", "label": "Gentle Idle", "rigs": { "hero": { "waves": { "head": { "freq": 1.6, "amp": 6, "phase": 0 } }, "scaleWaves": { "root": { "freq": 1.8, "ampX": 0.03, "ampY": -0.02, "phase": 0 } } } } }
  ]
}
```

---

## 6. Fail-Closed Error Codes

- **Compiler (`compile_rig_studio.mjs`, exit `1`, writes nothing on error):**
  - `BP_JSON_INVALID`, `BP_SCHEMA`, `BP_DUP_PART`, `BP_RIG_INVALID`
  - `BP_SVG_UNSAFE` (checked across `parts[]`, `scene.*` including `midLayers[]` & `clusters[].shapesSvg[]`, and `motions[].*emote.svg`)
  - `BP_MISSING_DEF` (`url(#id)` / `href="#id"` not declared in `<defs>`, listing available IDs)
- **Pack Validator (`validate_pack.mjs`, exit `1`):**
  - `PACK_MISSING_MANIFEST`, `MANIFEST_JSON_INVALID`, `MANIFEST_SCHEMA`, `MANIFEST_DUP_ID`
  - `ART_FILE_MISSING`, `ART_SHA_MISMATCH`, `ART_SVG_UNSAFE`, `ART_MISSING_DEF`
  - `RIG_JSON_INVALID`, `RIG_SCHEMA`, `RIG_DUP_BONE`, `RIG_ROOT_COUNT`, `RIG_UNKNOWN_PARENT`, `RIG_CYCLE`, `RIG_LIMIT_INVALID`, `RIG_SKIN_INCOMPLETE`, `RIG_REST_MISSING`, `RIG_REST_OUT_OF_LIMIT`, `RIG_ASSET_MISSING`, `RIG_ANCHOR_MISSING`, `RIG_DEGENERATE_BONE`, `RIG_CONTACT_BAD_BONE`, `RIG_IK_INVALID`

## v4.0 Extensions (Style Grammar Packs, Cut-Paper Optics, Cadence, Tremor & Strands)

- **`style`** *(optional string at blueprint root)*: One of `storybook-gouache`, `paper-lightbox`, `paper-popup`, `shadow-craft`. Automatically merges `styles/<slug>/preset.json` (`sceneDefaults.cadence` and `sceneDefaults.lighting`) without overwriting explicit author settings. Unknown values fail closed with `BP_STYLE_UNKNOWN`.
- **v4.0 Built-In sRGB Filters:**
  - `url(#cutoutBorder)` — die-cut Pop-Up off-white border (`lighting.cutoutBorderColor`, `cutoutBorderWidth`) + shifted grey cardboard edge (`cutoutEdgeColor`). Auto-embedded into standalone pack SVGs.
  - `url(#backlitPulp)` — backlit Shadow-Box cloudy paper pulp translucency + warm top rim & dark under-edge. Auto-embedded into standalone pack SVGs.
- **`scene.cadence`** *(optional object)*:
  - `charFps`: number (`0` = smooth `60fps`; `12` = handcrafted stepped animation on twos while camera drift, focal glow, particles, and lighting stay smooth `60fps`).
  - `cameraDrift`: number (default `0.16`) — subtle handheld camera breathing amplitude.
- **`rig.tremor`** *(optional object)*: `{ ampX, ampY, ampDeg }` — deterministic high-frequency organic paper/rod micro-tremor (evaluated on quantized `evalT`, 100% stateless).
- **`rig.strands[]`** *(optional array)*: Multi-link flowing ribbons (scarves, hair locks, cape tails, tassels) anchored to a bone:
  ```json
  {
    "id": "scarf_tail",
    "bone": "torso",
    "anchor": "neck",
    "z": 4.2,
    "segments": 6,
    "length": 54,
    "dirDeg": 168,
    "inheritRot": true,
    "widthStart": 10,
    "widthEnd": 3,
    "sag": 8,
    "fill": "#c94c38",
    "stripeColor": "#f7df9c",
    "rimColor": "#ffe6b8",
    "waveAmp": 9,
    "waveFreq": 3.4,
    "filter": "paperBevelSoft"
  }
  ```
- **Private Craft Library Resolution:** `compile_rig_studio.mjs` and `render_audit.mjs` scan `assets/kit/` → `assets/library/` → `PAPER_STUDIO_LIBRARY_DIR` → `--kit-dir` / `--library-dir` (later directories override earlier IDs).

---

## v5.0 Extensions (Cinema-Grade 3D Sculpted & Backlit Engine — `sculpted3d`)

- **3D Style Presets (`"style"`):** `shadowbox-moonlit`, `lightbox-led`, `daylight-sculpted`, `winter-tunnel` automatically set `scene.renderMode = "sculpted3d"` and populate calibrated `scene.boxCavity` and `scene.lighting3d`.
- **`scene.renderMode`:** `"sculpted3d" | "svg2d"` (defaults to `"svg2d"` for legacy specs; invalid values fail closed with `BP_SCHEMA`).
- **`scene.boxCavity`:** Multi-ply 3D shadow-box surround `{ frameShape: "oval_scallop_bottom"|"pagoda_lantern_window"|"scalloped_arch"|"rounded_rect"|"none", z, depth, plies, plyStep?, plyZGap?, apertureRx, apertureRy, plyColors: string[], rimHighlightColor?, frameCastShadow?: boolean }`.
- **`scene.lighting3d`:** `{ bgColor, fov: 24, exposure, backlightGain, aoIntensity, aoRadius, bloomStrength, bloomThreshold, moteCount, moteColor, hemiLight, keyLight, rimLight, pointLights[] }`.
- **`scene.layers3d[]`:** True 3D sculpted environment planes (`z` in `[-3.5 .. +1.4]`), validated fail-closed (`BP_SCENE3D_INVALID`). Allowed `kind`:
  - Core v5.0: `backdrop`, `celestial_disk`, `box_frame`, `extruded_svg`, `folded_ridge` (`foldStyle: "pleated" | "faceted" | "tiered_cliff_slabs"`), `cupped_petals`, `pine_fan_tree`, `botanical_frond`, `tiered_pine_group`, `architecture` (`parts[]` with `rect` + `holeArches`, `pagoda_roof` with carved rafters, `cone`, `svg`).
  - Extended v5.1 (active in `sculpted-paper-engine.js`):
    - **`organic_strata`:** Multi-layer smooth rolling ridge silhouettes with curved topographic erosion flutes (`baseY`, `xMin`, `xMax`, `samples`, `seed`, `zStep`, `strata: [{ baseH, fbmAmp, peaks: [[x, h, w, skew?]], topColor, midColor, bottomColor, edgeColor, flutes, thickness, bevel, roughness, translucency }]`).
    - **`bonsai_calligraphy`:** Tapering cubic-Bézier calligraphy trunks (`branches: [{ pts: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]], w0, w1, steps, z }]`) + feathered two-layer pine-needle tufts (`tufts: [{ x, y, z, radius, height, needleCount, rotDeg, swayDeg? }]`) + optional `paperFlex`.
    - **`billowing_clouds`:** Multi-tier scalloped backlit cloud canopies (`edge: "top"|"bottom"`, `xMin`, `xMax`, `tiers: [{ baseY, puffs: [[cx, cy, rx, ry]], color, edgeColor, thickness, bevel, translucency, zOffset, driftX?, driftY?, freq?, phase? }]`).
    - **`sculpted_peony`:** Multi-ring cupped 3D peony blooms with recessed gold stamen clusters (`blooms: [{ x, y, z, scale, outerColor, midColor, innerColor, coreColor, rings? }]`) + optional swaying `ferns[]`.
    - **`cutout_relief`:** Optional raster relief plane with luminance-derived Sobel normal map (`flipY = true`), stacked 300gsm cream cardstock core slices, and optional `paperFlex` (`imageDataUrl: "data:image/(png|webp|jpeg);base64,..."`, `width`, `height?`, `thickness`, `reliefStrength`, `normalScale`, `roughness`, `alphaTest`, `edgeColor`, `translucency`, `paperFlex?: { anchor: "edges"|"bottom", ampX, ampZ, freq, phase }`). Prefer referencing verified local PNG/WebP files via `cutoutRef` instead of raw inline data URIs.
- **`part.cardstock`:** `{ thickness?: number, bevel?: number, edgeColor?: string, roughness?: number, normalScale?: number, translucency?: number, paperFlex?: { mode: "wing_cup"|"cloth_billow"|"tail_wave"|"branch_sway", amp?, freq?, phase? } }` (validated fail-closed `BP_CARDSTOCK_INVALID`). Exported into `manifest.json` assets alongside `scene3d.json` (`SCENE3D_SHA_MISMATCH` / `SCENE3D_MISSING` verified by `validate_pack.mjs`).

---

## v5.1 Extensions (Standardized 2D/3D/PBR/Archetype Library, Direct ID Refs & Runtime Scope)

### 1. Direct Library ID References (Fail-Closed SHA-256 Verified)
All presets registered in `assets/library/index.json` (and custom `--library-dir`) are verified via SHA-256 at compile time and can be referenced directly by ID in `blueprint.json`:
- **`parts[].materialRef`:** `"paper-cotton-300gsm"` or `{ "id": "paper-washi-translucent", "overrides": { "translucency": 0.55 } }` → merges PBR paper `cardstock` defaults (`BP_MATERIAL_NOT_FOUND`, `BP_MATERIAL_INVALID`).
- **`scene.layers3d[].reliefRef`:** `"strata-mountain-mist"` (or `bonsai-frame-pine`, `clouds-billowing-canopy`, `peony-botanical-cluster`, `cutout-relief-cardstock`) → expands `kind` + `defaults` under explicit layer overrides (`BP_RELIEF_NOT_FOUND`, `BP_RELIEF_INVALID`).
- **`rigs[].archetypeRef`:** `"biped-storybook-base"` or `"quadruped-fable-base"` → expands modular `bones[]`, `boneMapping`, `sides`, `variants`, `ik`, `contacts`, `handTransition`, `followThrough`, and `gait` defaults under explicit rig overrides (`BP_ARCHETYPE_NOT_FOUND`, `BP_ARCHETYPE_INVALID`).
- **`scene.layers3d[].cutoutRef` *(optional)*:** References a verified `cutout-raster` entry (`.png`/`.webp` confined inside library dir, magic-byte checked, binary SHA-256 verified, ≤ 4 MiB) and embeds it into `cutout_relief` (`BP_CUTOUT_NOT_FOUND`, `LIB_SHA_MISMATCH`, `LIB_UNSAFE_ASSET`). Pure `svg-2d` + `procedural-3d` + `pbr-paper` scenes work 100% independently without any raster cutouts.

### 2. Runtime Scope Matrix (Viewer Runtime vs M1–M3 Film Engine Data Contract)

| Feature / Field | Active in Viewer Runtime (`viewer-shell*` / `sculpted-paper-engine.js`) | Validated & Exported Pack Contract for M1–M3 Film Engine (`src/`) |
| --- | :---: | :---: |
| `part.cardstock.paperFlex` (`wing_cup`, `cloth_billow`, `tail_wave`, `branch_sway`) | **Yes** (real-time 3D mesh flex in `sculpted3d`) | **Yes** (`manifest.json` `cardstock`) |
| `layers3d` (`organic_strata`, `bonsai_calligraphy`, `billowing_clouds`, `sculpted_peony`, `cutout_relief` + `paperFlex`) | **Yes** (real-time WebGL2 3D geometry & Sobel normal maps) | **Yes** (`scene3d.json` + SHA-256) |
| `gait.groundCurve` + `gait.lockToTravel` | **Yes** (terrain-following `rootY` & IK foot contact in `sculpted3d`) | **Yes** (`rig.json` `gait`, validated `BP_GAIT_INVALID`) |
| `materialRef`, `reliefRef`, `archetypeRef`, `cutoutRef` | **Yes** (expanded deterministically by compiler before HTML/pack emit) | **Yes** (resolved into `manifest.json`, `rig.json`, `scene3d.json`) |
| Pure `t → pose` reset (`resetToRest`) | **Yes** (omitted bones/rigs reset cleanly to rest pose natively in viewer) | **Yes** (explicit `phase.resetToRest` contract for M2 clip transitions) |
| `rig.boneMapping` (canonical role → boneId) | Compile/pack validated only *(viewer evaluates by boneId)* | **Yes** (exported in `rig.json` for cross-proportion M2 action retargeting) |
| `rig.handTransition` & `rig.gait.strideScaleByLegLength` | Compile/pack validated only | **Yes** (exported in `rig.json` for M2/M3 motion engine) |
| `motions[].phases[].events[]` (`grip`/`release`, `anchors.grip`/`base`, `maxWristDegPerFrame ≤ 22.5`, 2-bone `targetPos` reach check) | Compile-time validated fail-closed *(no live Rapier/parenting in preview viewer)* | **Yes** (early reach & anchor contract for M2/M3 dynamic-parenting & Rapier drop) |

### 3. Extended v5.1 Fail-Closed Error Codes
- **Library & Material Resolver (`material-library.mjs` / `library_cli.mjs verify`):** `LIB_SCHEMA`, `LIB_DUP_ID`, `LIB_FILE_MISSING`, `LIB_SHA_MISMATCH`, `LIB_UNSAFE_ASSET`, `LIB_SVG_UNSAFE`, `LIB_MISSING_DEF`, `LIB_STYLE_INVALID`
- **Compiler (`compile_rig_studio.mjs`):** `BP_CARDSTOCK_INVALID`, `BP_SCENE3D_INVALID`, `BP_STYLE_UNKNOWN`, `BP_MATERIAL_NOT_FOUND`, `BP_MATERIAL_INVALID`, `BP_RELIEF_NOT_FOUND`, `BP_RELIEF_INVALID`, `BP_ARCHETYPE_NOT_FOUND`, `BP_ARCHETYPE_INVALID`, `BP_CUTOUT_NOT_FOUND`, `BP_CUTOUT_INVALID`, `BP_BONEMAPPING_INVALID`, `BP_GAIT_INVALID`, `BP_INTERACTION_ANCHOR_MISSING`, `BP_INTERACTION_INVALID`, `BP_REACH_EXCEEDED`
- **Pack Validator (`validate_pack.mjs`):** `SCENE3D_SCHEMA`, `SCENE3D_MISSING`, `SCENE3D_SHA_MISMATCH`, `SCENE3D_JSON_INVALID`, `RIG_BONEMAPPING_INVALID`


