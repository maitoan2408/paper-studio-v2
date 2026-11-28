---
name: paper-cut-rig-craft
description: Designs and compiles cinema-grade 3D sculpted & backlit paper-cut shadow-box dioramas and 2D multiplane skeletal rigs (v5.0: Three.js WebGL2 Dual-Path 3D Engine with 300gsm cotton normal/roughness PBR, thin-paper backlit subsurface scattering, deterministic seeded GTAO crevice occlusion + 4x MSAA/SMAA, folded/pleated/tiered-slab 3D relief, die-cut printed cardstock slabs for 48 Private Craft Library SVGs with zero Z-fighting, 3D extruded hoses[] & strands[], analytic 2-bone IK walk gaits, and bit-exact deterministic WebGL2 multi-angle render_audit) into both an offline interactive studio HTML and a validated paper-studio-v2 asset pack (manifest.json + scene3d.json + rig.json + SVGs with SHA-256).
compatibility: Requires Node.js 18+ (zero external npm dependencies; bundles locked Three.js WebGL2 vendor runtime; optional Chrome/Chromium for headless WebGL2 Model Sheets, Motion Sheets, 18° Oblique/Exploded 3D proofs, and Bit-Exact Determinism Gate).
metadata:
  author: paper-studio-v2
  version: "5.0.0"
---

# Paper-Cut & Shadow-Box Rig Craft (v5.0 — Cinema-Grade 3D Sculpted & Backlit Engine)

Turn any creative brief into a **cinema-grade 3D sculpted & backlit paper-cut diorama** plus a **validated `paper-studio-v2` asset pack** — powered by **Dual-Path 3D Geometry** (multi-layer folded relief + die-cut printed cardstock slabs), **physical 300gsm cotton PBR + backlit subsurface scattering + seeded GTAO**, a **48-component Private Craft Library**, and a **5-Gate Visual & Bit-Exact Determinism Workflow** — with zero external npm dependencies and 100% backward compatibility with `svg2d` blueprints.

## Style Grammar Packs (`styles/<slug>/STYLE.md` + `preset.json`)

### Primary 3D Sculpted Presets (`renderMode: "sculpted3d"` — Recommended)
1. **`shadowbox-moonlit`** — 3-ply `oval_scallop_bottom` deep shadow-box, pleated & faceted indigo mountains, warm pavilion arches, cupped 3D lotus clusters, glowing moon backlight + `12fps` handcrafted cadence.
2. **`lightbox-led`** — 3-ply `pagoda_lantern_window` heritage lightbox, intense warm amber/gold internal LED subsurface glow (`backlightGain: 1.65`), crisp white edge rim catchlights on dark foreground silhouettes.
3. **`daylight-sculpted`** — Crisp `42°` raking sunlight, `faceted` origami peaks + `tiered_cliff_slabs` with meadow/snow ledges, multi-tower architecture, deep teal cast shadows + `GTAO`.
4. **`winter-tunnel`** — 4-ply wide-stepped concentric `scalloped_arch` snow-blue paper tunnel receding into a starry cobalt clearing with pure white paper-cut pines & silhouettes.

### Classic 2D Multiplane Presets (`renderMode: "svg2d"` — Legacy Compatible)
- `storybook-gouache`, `paper-lightbox`, `paper-popup`, `shadow-craft`.

## Bundled Resources (Load On Demand)

- **Blueprint JSON v5.0 Contract:** [references/blueprint-schema.md](references/blueprint-schema.md) — **mandatory read** for `style`, `scene.renderMode`, `scene.boxCavity`, `scene.lighting3d`, `scene.layers3d[]`, `part.cardstock`, `rig.hoses[]`, `rig.strands[]`, `gait`, and `kitRef`.
- **Aesthetic, 3D Relief & Anti-Stiffness Bible:** [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) — **mandatory read** for Dual-Path 3D rules (zero Z-fighting, positive determinants, telephoto `24°` lens), value ladders, seamless 3D `hoses[]`/`strands[]`, and IK `gait`.
- **Universal Rig Archetypes:** [references/rig-archetypes.md](references/rig-archetypes.md) — 2-spine Biped + IK gait + hoses + strands, Quadruped, Winged Spirit/Bird, Kinetic prop, or Wave Creature.
- **48-Component Private Craft Library (`assets/library/` + `assets/kit/`):** Browse or import artist SVGs fail-closed:
  ```bash
  node scripts/library_cli.mjs list [--family anatomy|garments|botanicals|props|frames] [--json]
  node scripts/library_cli.mjs contact-sheet --out <dir>
  node scripts/library_cli.mjs import --svg <artist.svg> --id <slug> --family <fam> --out-dir <private-lib>
  ```

## Mandatory 5-Gate Production Workflow

### Gate 1 — Pick 3D Style Preset & Plan Z-Depth Value Ladder
1. Pick `"style"` (`shadowbox-moonlit`, `lightbox-led`, `daylight-sculpted`, or `winter-tunnel`) and read `styles/<slug>/STYLE.md`.
2. Design `6–14` distinct `Z` planes (`z = -3.4 .. +1.4`) with generous `spacerGap` (`0.35–0.85` world units) so raking `keyLight` + `GTAO` cast bold, unmistakable physical shadows across planes.

### Gate 2 — Dual-Path Craft Assembly (Library Cardstock Slabs + 3D Sculpted Relief)
1. **Characters & Intricate Props (`parts[]`):** Pull rich components from `assets/library/` (`kitRef` / `{{KIT:...}}`) + add `cardstock: { thickness, bevel, edgeColor, translucency }`. The engine automatically traces their outer silhouette into a **3D beveled cardstock slab** and prints the `4×` supersampled SVG + live `data-eye="1"` blink onto the front cap (**zero Z-fighting**). Use `rig.hoses[]` for seamless limbs, `rig.strands[]` for flowing 3D scarves/tails, and analytic 2-bone IK `gait` for walking.
2. **Scenery & Architecture (`scene.layers3d[]`):** Build genuine 3D volume using `folded_ridge` (`pleated`, `faceted`, `tiered_cliff_slabs`), `architecture` (`pagoda_roof` with carved rafters, `rect` with `holeArches`, `cone`), `cupped_petals`, `pine_fan_tree`, `botanical_frond`, `tiered_pine_group`, and `extruded_svg`.

### Gate 3 — Fail-Closed Compile & Strict Pack Validation
```bash
node scripts/compile_rig_studio.mjs \
  --spec <path/to/blueprint.json> \
  --out-pack <path/to/pack-dir> \
  --out-html <path/to/studio_3d.html>

node scripts/validate_pack.mjs --pretty --strict-craft <path/to/pack-dir>
```

### Gate 4 — WebGL2 Multi-Angle & Bit-Exact Determinism Audit (`render_audit.mjs`)
```bash
node scripts/render_audit.mjs \
  --html <path/to/studio_3d.html> \
  --spec <path/to/blueprint.json> \
  --out <path/to/audit-dir> \
  --strict-craft
```
Verify `audit_report.json` reports `"status": "PASS"` and `"determinismCheck": { "status": "PASS" }` (proving `direct(t)` SHA-256 matches `seek(t_other → t)` bit-for-bit).

### Gate 5 — Honest Visual Inspection & Inline Chat Image Delivery
1. Inspect **all real rendered PNGs** via `view_file` in order:
   - `modelsheet_<rigId>.png` (Rest `0°`, Active `18°` Oblique, Skeleton & Anchors, Silhouette)
   - `frame_oblique_3d.png` & `frame_exploded_z.png` (verify true physical paper thickness, bevel rim catchlight, and layer separation)
   - `motion_sheet.png` (6 phases rendered on a single WebGL2 context: verify IK foot-lock, `2×` hip bob, and sliding 3D cast shadows)
   - `frame_0_*.png` (front `0°` cinema frame: verify GTAO crevice depth, backlit translucency, zero tangents, zero Z-fighting)
2. **MANDATORY CHAT DELIVERY RULE:** Copy final verified PNGs to `<artifact_dir>` if not already there and **embed them directly inline in your chat message (`![caption](/abs/path.png)`)** so the user sees every proof image immediately in chat without hunting through files!

## Critical Gotchas (Never Ship These)
1. **Never use `Math.random()` or `.scale.y = -1`:** Always use deterministic `makeRng(seed)` and convert `(x, -y)` in `THREE.Shape` geometry before extrusion so normals and `GTAOPass` stay mathematically valid.
2. **Never use wide-angle FOV (`> 30°`) on articulated 2D+Z rigs:** Keep studio telephoto `fov: 24°` + tight intra-rig bone Z-step (`0.016`) so 2-bone IK joints never separate in perspective.
3. **Never ship without inline PNG proof in chat:** Passing CLI exit code `0` without visually inspecting `frame_oblique_3d.png`, `modelsheet_*.png`, and `motion_sheet.png` and embedding them in chat is an incomplete delivery.
