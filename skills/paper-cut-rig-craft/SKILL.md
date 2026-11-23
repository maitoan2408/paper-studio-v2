---
name: paper-cut-rig-craft
description: Designs and compiles handcrafted, cinema-storybook 2D/2.5D multiplane paper-cut and shadow-box skeletal rigs for any theme (single or multi-character, nature, fantasy, underwater, seasonal, or human characters) into both a 60fps interactive HTML preview studio (FK/IK, proscenium frame, backlit lighting, two-tone procedural foliage/motif clusters, 3D parallax, bone diagnostics) and a validated paper-studio-v2 asset pack (SVG + manifest.json with SHA-256 + rig.json). Use when the user asks to create or preview a paper-cut rig, shadow-box diorama, articulated creature or character, cutout puppet, or interactive rig viewer.
compatibility: Requires Node.js 18+ (zero external dependencies). Works across Antigravity, Claude Code, Cursor, and Codex.
metadata:
  author: paper-studio-v2
  version: "2.0.0"
---

# Paper-Cut & Shadow-Box Rig Craft (v2.0 — Universal Handcrafted Diorama)

Turn **any theme or creative brief** (ocean, autumn forest, snow village, cherry blossoms, desert, workshop, fantasy creatures, or human characters) into a **warm, tactile paper-cut shadow-box studio** plus a **validated `paper-studio-v2` asset pack** — with zero hardcoded themes and zero external dependencies.

## Bundled Resources (Load On Demand)

- **Universal handcrafted aesthetic & emotional motion rules:** [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) — **mandatory read** for backlit focal lighting, proscenium framing, leading lines, anti-clipart rules, and 3-layer emotional acting.
- **Universal rig archetypes & 2-segment limb rules:** [references/rig-archetypes.md](references/rig-archetypes.md) — read to pick the skeleton (13–15 bone Quadruped, Companion, Wave Creature, 15–24 bone Biped).
- **Exact `blueprint.json` v2.0 contract:** [references/blueprint-schema.md](references/blueprint-schema.md) — read before writing the blueprint JSON.
- **Compiler:** `scripts/compile_rig_studio.mjs` — compiles 1 `blueprint.json` into both the interactive HTML studio (`assets/viewer-shell.html`) and the full SVG/JSON pack in `~0.15s`.
- **Fail-closed validator:** `scripts/validate_pack.mjs` — verifies SVG allowlist, `SHA-256`, bone acyclicity, limits, skins, anchors, and non-degenerate lengths across all rigs.

## Fast 4-Step Workflow

Never hand-code 900 lines of HTML/FK/IK/Parallax boilerplate from scratch. Author **one expressive, theme-agnostic `blueprint.json`** and compile it.

### Step 1 — Design the Diorama Composition & Emotional Arc
Read [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) and [references/rig-archetypes.md](references/rig-archetypes.md):
- **Canvas & Proscenium Frame:** Default to 16:9 (`width: 960, height: 540`) with `scene.frame: { style: "proscenium", layers: [...] }` using 3–4 deep-to-warm hues of the requested theme.
- **Backlit Focal Point & Leading Line:** Set `scene.lighting.focalGlow` directly behind the hero/meeting point, add `scene.lighting.mist` for aerial depth, and sculpt an S-curved path, river, or wave trough leading into the focal stage.
- **Layered Handcrafted Detail (`scene.clusters[]`):** Replace flat clipart blobs with procedural two-tone folded paper clusters (`FILL_A`/`FILL_B`) for canopies, corals, blossoms, snowflakes, or foreground corner foliage.
- **Multi-Character Articulated Rigs (`rigs[]`):** Give every interacting subject its own rig (with **2-segment walking limbs**, cohesive `groupShadow: "shadowDeep"`, auto soft ground shadow `groundY/shadowRx/shadowRy`, and optional paper-fastener `brad` pins).

### Step 2 — Author `blueprint.json`
Follow [references/blueprint-schema.md](references/blueprint-schema.md):
- Draw all rotating limb/tail segments around local `(0, 0)` with concentric circular overlap caps and keep internal bone `shadow: "none"` (or `"shadowInner"` only on near limbs/head).
- Declare all `url(#...)` gradients used by `parts[].svg` inside `scene.defsSvg`.
- Choreograph all 3 motion layers: Primary emotional story phases + Secondary overlapping wave lag + Ambient `falling` particles (or rising bubbles with `speedY < 0`), `fireflies`/`meteor`, and perspective `swarms`.

### Step 3 — Compile Both Deliverables
```bash
node scripts/compile_rig_studio.mjs \
  --spec <path/to/blueprint.json> \
  --out-pack <path/to/pack-dir> \
  --out-html <path/to/preview_studio.html>
```

### Step 4 — Fail-Closed Validation & Live Preview Delivery
```bash
node scripts/validate_pack.mjs --pretty <path/to/pack-dir>
```
- **Exit code `0` (`"status": "PASS"`) is mandatory.** Fix any reported error, re-compile, and re-validate until `0` errors remain.
- Do not commit or push to Git unless the user explicitly asks.

## Gotchas (Mistakes That Make Scenes Look Flat, Stiff, or Broken)

1. **Clipart blobs kill emotional craft:** Never use plain concentric circles for canopies or flat rectangles for branches/grounds. Always use `scene.clusters[]` with two-tone folded SVG motifs (`FILL_A`/`FILL_B`), layered paper strips for trunks/terrain, and S-curved leading lines.
2. **Stiff 1-segment peg-legs:** Give walking hero quadrupeds and bipeds **2-segment articulated legs** (`upper → lower`) so paws/knees curl gracefully mid-stride.
3. **Heavy per-bone drop shadows slice limbs apart:** Always use rig-level `groupShadow: "shadowDeep"` and keep bone `shadow: "none"` on spine/tail segments (`"shadowInner"` only on near limbs/head); use optional `bone.brad` pins for authentic papercraft pivot accents.
4. **Static companion kills the story:** Always put every interacting character in `rigs[]` with synchronized story beats.
5. **Floating characters or harsh brown ovals:** Always use `groundY`, `shadowRx`, `shadowRy` for soft auto-scaling ground contact shadows.
6. **Hardcoding one theme:** Every color, motif shape, particle direction (`speedY > 0` falling vs `speedY < 0` rising), and proscenium frame palette MUST come from `blueprint.json` data.
7. **Missing `<defs>`, `Math.random()`, or unsafe SVG tags:** Every `url(#id)` used in `parts[].svg` must live in `scene.defsSvg`; never use `Math.random()` or disallowed tags (`<script>`, `<style>`, `<image>`, `<foreignObject>`).
8. **HTML preview opens as raw source code in artifact UIs (Antigravity):** Shell scripts skip `ArtifactMetadata`. When delivering an `.html` preview in an artifact-enabled UI, register/write the `.html` artifact via the native file-creation tool (`UserFacing: true`, `RequestFeedback: false`) so it renders live visually.

## Delivery Checklist
- [ ] `compile_rig_studio.mjs` succeeded and produced both HTML studio and pack directory.
- [ ] `validate_pack.mjs` exited `0` (`PASS`) across `rig.json` and any `rigs/*.json`.
- [ ] Visual self-check: backlit focal glow, proscenium frame, two-tone folded motif clusters, 2-segment limb articulation, cohesive character shadows, auto ground shadows, and 3-layer motion.
