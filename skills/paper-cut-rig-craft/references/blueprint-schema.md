# Blueprint JSON Schema v2.1 (`blueprint.json`)

100% theme-agnostic declarative contract validated and compiled by `scripts/compile_rig_studio.mjs`.

## 1. Top-Level Structure

| Key | Required | Purpose |
| --- | :---: | --- |
| `meta` | Yes | `{ packId, version, title, subtitle?, icon?, seed? }` — `seed` drives deterministic LCG (`makeRng`) and `paperTex` grain across both pack SVGs and HTML viewer. |
| `scene` | Yes | Canvas size, `<defs>`, backdrop, proscenium frame, lighting, multiplane scenery, procedural motif clusters, emitters, celestial rig, swarms, overlay props. |
| `parts[]` | Yes | Non-empty list of reusable SVG body/prop parts drawn around local `(0, 0)` pivot. |
| `rigs[]` | Yes | Non-empty list of independent articulated skeletal rigs (legacy single `rig` also accepted). |
| `motions[]` | No | Named presets (`type: "cycle"` or `type: "harmonic"`). Evaluated as a **pure function of `t`** (omitted bones/rigs cleanly reset to rest pose; zero state leakage across phases). |

---

## 2. `scene` Contract (100% Data-Driven)

- **`width` / `height`:** Positive numbers; default `960 × 540` (16:9 widescreen) or `960 × 720` (4:3).
- **`bgColor`:** CSS color behind the stage.
- **`defsSvg`:** SVG `<linearGradient>`, `<radialGradient>`, `<clipPath>`, `<pattern>`, or `<filter>` declarations. **Every `url(#id)` / `href="#id"` used in `parts[].svg` MUST exist here** so exported standalone `.svg` files pass `validate_pack.mjs`.
  - Built-in viewer `<defs>` (available to `scene.*`, NOT standalone `parts[].svg`): `paperTex`, `shadowDeep`, `shadowMed`, `shadowSoft`, `shadowInner`, `softGlow`, `groundShadowGrad`, `warmMomentGlow`, `autoVignette`, `meteorTrail` (default fallback if not overridden), `stageClip`, plus `autoFocalGlow` (when `lighting.focalGlow` is set) and `autoMistGrad` (when `lighting.mist` is set).
- **`skySvg`:** Full-canvas sky/backdrop SVG fragment.
- **`frame`:** Universal rounded shadow-box proscenium frame:
  ```json
  "frame": { "style": "proscenium", "radius": 56, "inset": 10, "step": 12, "layers": ["#OUTER_DARK", "#MID_HUE", "#INNER_WARM"] }
  ```
  - **Layer order:** `layers[0]` is the **outermost** edge frame (deepest shadow hue); `layers[layers.length - 1]` peeks furthest **inward** (warmest/midtone recess). Set `style: "none"` to disable or supply custom `frameSvg` / `cornersSvg`.
- **`lighting`:** Data-driven light-box focal glow, aerial mist, and vignette:
  ```json
  "lighting": {
    "focalGlow": { "x": 480, "y": 300, "r": 280, "color": "#CORE", "midColor": "#MID", "opacity": 0.7 },
    "mist": { "y": 290, "height": 150, "color": "#MIST", "opacity": 0.22 },
    "vignetteOpacity": 0.34
  }
  ```
- **`stars`:** `{ count, maxY?, color? }` — seeded twinkling sky points.
- **`celestial`:** `{ x, y, rings?: [{ r, fill }], coreSvg?, orbitSvg?, orbitSpeed? }` — breathing celestial disc/crescent/sun/planet.
- **`atmosphere`:** Optional overrides `{ lightShaftsSvg?, midMistSvg?, foregroundGlowSvg? }`.
- **`backLayers[]` / `frontLayers[]`:** Multiplane parallax strips:
  `{ parallax?: number, swayAmp?: number, swayFreq?: number, phase?: number, filter?: "shadowDeep"|"shadowMed"|"shadowSoft", svg: string }`.
- **`clusters[]`:** Procedural two-tone folded paper motif scatter (leaves, petals, coral, crystals, snowdrifts, grass — zero hardcoded biome):
  ```json
  {
    "lane": "back", "mode": "arc", "cx": 740, "cy": 140, "rx": 200, "ry": 110, "a0": -3.14, "a1": 0.2,
    "count": 36, "seed": 3011, "scaleMin": 0.75, "scaleMax": 1.35, "rotMin": -140, "rotMax": 140,
    "parallax": 14, "sway": 3.2, "filter": "shadowSoft",
    "palette": [["#LIGHT_A", "#DARK_A"], ["#LIGHT_B", "#DARK_B"]],
    "shapeSvg": "<path d=\"M0 -12 L6 0 L0 12 Z\" fill=\"FILL_A\"/><path d=\"M0 -12 L-6 0 L0 12 Z\" fill=\"FILL_B\"/>"
  }
  ```
  Modes: `"arc"` (`cx, cy, rx, ry, a0, a1`), `"line"` (`x0, y0, x1, y1, spread`), `"scatter"` (`cx, cy, rx, ry`). `lane`: `"back"` | `"front"`.
- **`emitters[]`:**
  - `type: "falling"`: `{ type: "falling", count, seed, speedY, windX?, swayAmp?, scale?, palette?: [[cA, cB]], shapesSvg?: [string] }`. Use `speedY > 0` for falling particles (leaves, petals, snow) or `speedY < 0` for rising particles (underwater bubbles, embers, lanterns).
  - `type: "fireflies"`: `{ type: "fireflies", count, seed, xMin?, xMax?, yMin?, yMax?, color? }`.
  - `type: "meteor"`: `{ type: "meteor", x0, y0, dx, dy, period?, dur?, offset?, len?, color?, gradId? }`.
- **`swarms[]`:** Perspective 2-bone creatures:
  `{ lane: "back"|"front", x0, y0, dir?: 1|-1, speed?, amp?, phase?, scale?, wagFreq?, wagAmp?, tailPivotX?, tailPivotY?, jump?, jumpPeriod?, jumpOffset?, jumpHeight?, bodySvg, tailSvg }`.
- **`overlayProps[]`:** Gently swaying props `{ x, y, parallax?, scale?, freqX?, freqY?, ampX?, ampY?, tiltAmp?, svg }`.
- **`waterlineY`:** Optional Y coordinate for splash/bubble VFX.

---

## 3. `parts[]` & `rigs[]` Contract

### `parts[]` item
```json
{ "id": "limbUpper", "category": "limb", "size": [40, 64], "pivot": [20, 12], "anchors": { "knee": [20, 48] }, "svg": "<rect x=\"-6\" y=\"-6\" width=\"12\" height=\"44\" rx=\"6\" fill=\"url(#limbGrad)\"/>" }
```
- `svg` is drawn in **pivot-local coordinates `(0, 0)`**.
- `anchors` are in **viewBox pixel coordinates** matching `pivot` (every child attach anchor must satisfy `hypot(anchor.x - pivot.x, anchor.y - pivot.y) > 0`).

### `rigs[]` item
- Root properties: `id`, `label?`, `characterId?`, `rootPos: { x, y }`, `facing?: 1|-1`, `scale?: number`, `z?: number`, `parallax?: number`, `groundY?`, `shadowRx?`, `shadowRy?`, `shadowOffsetX?`, `groupShadow?: "shadowDeep"|"shadowMed"|false`, `sides?: ["l","r"]`, `variants?: { [group]: string[] }`, `ik?: { [ikId]: { upper, lower, end, bend?: 1|-1 } }`, `contacts?: { [name]: { bone, anchor } }`, `ground?`, `gait?`.
- Each item in `bones[]`:
  `{ id, label?, parent: string|null, attach: string|null, part: string, variantGroup?, variants?: { [opt]: partId }, limits: { min, max }, rest?: number, z?: number, maxDegPerFrame?: number, shadow?: "none"|"shadowInner"|"shadowSoft", brad?: { r?, fill?, stroke? } }`.
  - Exactly 1 root bone (`parent: null` iff `attach: null`), acyclic tree, `limits.min < limits.max`, `rest` inside `[min, max]`.

---

## 4. `motions[]` Contract (Pure `t → pose`)

- **Story Cycle (`type: "cycle"`):**
  ```json
  {
    "id": "story", "name": "Story Arc", "type": "cycle", "period": 12,
    "phases": [
      {
        "from": 0.0, "to": 0.5, "label": "Approach",
        "rigs": {
          "hero": {
            "rootX": [260, 460], "rootY": [390, 390], "arcY": 0, "ease": "smooth", "facing": 1, "emote": null,
            "bones": { "root": [0, 4], "head": [-8, 6] },
            "waves": { "leg.u": { "freq": 6, "amp": 24, "phase": 0 } }
          }
        },
        "vfx": { "warmGlow": { "x": 500, "y": 360, "intensity": 0.8 } }
      }
    ]
  }
  ```
  - `ease`: `"smooth"` (default) or `"back"` (overshoot spring).
  - `bones[id]` may be `[fromDeg, toDeg]` or a constant `number`. Any omitted bone resets cleanly to `rest`; any omitted rig resets cleanly to its rest pose.
- **Harmonic Loop (`type: "harmonic"`):**
  ```json
  {
    "id": "idle", "name": "Gentle Idle", "type": "harmonic", "label": "Idle",
    "rigs": {
      "hero": {
        "rootWaveX": { "freq": 0.6, "amp": 4, "phase": 0 },
        "rootWaveY": { "freq": 1.2, "amp": 3, "phase": 0 },
        "base": { "head": 2 },
        "waves": { "head": { "freq": 1.4, "amp": 5, "phase": 0.4 } }
      }
    }
  }
  ```

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
    "frontLayers": [{ "parallax": 20, "filter": "shadowDeep", "svg": "<path d=\"M-20 495 Q360 470 980 500 V560 H-20 Z\" fill=\"#0f1f33\"/>" }],
    "clusters": [{ "lane": "back", "mode": "arc", "cx": 760, "cy": 140, "rx": 160, "ry": 90, "a0": -3.14, "a1": 0, "count": 24, "seed": 101, "palette": [["#e76f51", "#b84a30"]], "shapeSvg": "<path d=\"M0 -10 L5 0 L0 10 Z\" fill=\"FILL_A\"/><path d=\"M0 -10 L-5 0 L0 10 Z\" fill=\"FILL_B\"/>" }],
    "emitters": [{ "type": "falling", "count": 16, "seed": 202, "speedY": 24, "windX": -14, "palette": [["#ffd166", "#d9a336"]], "shapesSvg": ["<path d=\"M0 -7 L4 0 L0 7 Z\" fill=\"FILL_A\"/><path d=\"M0 -7 L-4 0 L0 7 Z\" fill=\"FILL_B\"/>"] }]
  },
  "parts": [
    { "id": "heroBody", "category": "body", "size": [120, 80], "pivot": [60, 40], "anchors": { "head": [96, 30] }, "svg": "<ellipse cx=\"0\" cy=\"0\" rx=\"42\" ry=\"22\" fill=\"url(#bodyG)\"/>" },
    { "id": "heroHead", "category": "head", "size": [60, 60], "pivot": [20, 30], "anchors": {}, "svg": "<circle cx=\"10\" cy=\"0\" r=\"18\" fill=\"url(#bodyG)\"/>" }
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
    { "id": "idle", "name": "Idle", "type": "harmonic", "label": "Gentle Idle", "rigs": { "hero": { "waves": { "head": { "freq": 1.6, "amp": 6, "phase": 0 } } } } }
  ]
}
```

---

## 6. Fail-Closed Error Codes

- **Compiler (`compile_rig_studio.mjs`, exit `1`, writes nothing on error):**
  - `BP_JSON_INVALID`, `BP_SCHEMA`, `BP_DUP_PART`, `BP_RIG_INVALID`
  - `BP_SVG_UNSAFE` (disallowed tag, `on*`, external `href`/`xlink:href`, non-local `url()`, CDATA/DOCTYPE/ENTITY — checked across **both** `parts[]` and `scene.*`)
  - `BP_MISSING_DEF` (`url(#id)` / `href="#id"` not declared in `<defs>`, listing available IDs)
- **Pack Validator (`validate_pack.mjs`, exit `1`):**
  - `PACK_MISSING_MANIFEST`, `MANIFEST_JSON_INVALID`, `MANIFEST_SCHEMA`, `MANIFEST_DUP_ID`
  - `ART_FILE_MISSING`, `ART_SHA_MISMATCH`, `ART_SVG_UNSAFE`, `ART_MISSING_DEF`
  - `RIG_JSON_INVALID`, `RIG_SCHEMA`, `RIG_DUP_BONE`, `RIG_ROOT_COUNT`, `RIG_UNKNOWN_PARENT`, `RIG_CYCLE`, `RIG_LIMIT_INVALID`, `RIG_SKIN_INCOMPLETE`, `RIG_REST_MISSING`, `RIG_REST_OUT_OF_LIMIT`, `RIG_ASSET_MISSING`, `RIG_ANCHOR_MISSING`, `RIG_DEGENERATE_BONE`, `RIG_CONTACT_BAD_BONE`, `RIG_IK_INVALID`
