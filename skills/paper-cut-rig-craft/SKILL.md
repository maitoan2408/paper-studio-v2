---
name: paper-cut-rig-craft
description: Designs and compiles expressive, cinema-storybook 2D/2.5D multiplane paper-cut and shadow-box skeletal rigs (single or multi-character) into both an interactive HTML preview studio (60fps FK/IK, 3D parallax, volumetric light, falling leaves/meteors, bone diagnostics) and a validated paper-studio-v2 asset pack (SVG + manifest.json with SHA-256 + rig.json). Use when the user asks to create or preview a paper-cut character rig, shadow-box creature or romantic nature scene (whale, fox, rabbit, moon, autumn leaves, stars, waves, lantern), cutout puppet, or interactive rig viewer.
compatibility: Requires Node.js 18+ (zero external dependencies). Works across Antigravity, Claude Code, Cursor, and Codex.
metadata:
  author: paper-studio-v2
  version: "1.1.0"
---

# Paper-Cut & Shadow-Box Rig Craft (v1.1)

Turn any creative brief into a **warm, emotionally alive paper-cut shadow-box diorama** with **two synchronized deliverables in one fast pass**:
1. A standalone **interactive HTML Rig Studio** (60fps multi-rig FK/IK, cohesive silhouette shadows, dynamic ground shadows, 3D parallax, volumetric lighting & mist, falling leaves/fireflies/meteors, bone/anchor diagnostics).
2. A **validated `paper-studio-v2` asset pack** (`*.svg`, `manifest.json` with real `SHA-256`, `rig.json` + `rigs/*.json`).

## Bundled Resources (Load On Demand)

- **Cinema aesthetic, anti-clipart & emotional acting rules:** [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) — **mandatory read** so art never looks stiff, plastic, or dry.
- **Rig bone trees & organic joint cutting:** [references/rig-archetypes.md](references/rig-archetypes.md) — read to pick archetypes (Quadruped, Small Companion, Wave Creature, Biped 15–24 bones, Celestial/Swarm).
- **Exact `blueprint.json` v1.1 contract:** [references/blueprint-schema.md](references/blueprint-schema.md) — read before writing the blueprint JSON.
- **Compiler:** `scripts/compile_rig_studio.mjs` — compiles 1 `blueprint.json` into both the HTML studio (`assets/viewer-shell.html`) and the SVG/JSON pack in `~0.12s`.
- **Fail-closed validator:** `scripts/validate_pack.mjs` — checks SVG allowlist, `SHA-256`, bone acyclicity, limits, skins, anchors, and non-degenerate lengths across all rigs.

## Fast 4-Step Workflow

Do **not** rewrite 900 lines of HTML/CSS/FK/IK/Parallax boilerplate from scratch. Author **one expressive `blueprint.json`** and compile it.

### Step 1 — Plan the Emotional Story & Depth Layers
Read [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) and [references/rig-archetypes.md](references/rig-archetypes.md):
- **Characters (`rigs[]`):** If the prompt mentions 2 interacting characters (e.g., Fox + Rabbit), give **BOTH** independent rigs in `rigs[]` with synchronized story phases (`phases[].rigs[id]`), soft auto ground shadows (`groundY`, `shadowRx`, `shadowRy`), and cohesive `groupShadow: "shadowDeep"`.
- **Atmosphere (`scene.atmosphere`):** Always include volumetric moonlight/sunbeams (`lightShaftsSvg`), horizon depth mist (`midMistSvg`), and subtle warm vignette (`foregroundGlowSvg`) so the scene glows with warmth and emotion.
- **3 Motion Layers:** Primary emotional acting beats (approach → pause/recognition → warm greeting + `vfx.warmGlow` + `emote` → joyful hop) + Secondary overlapping tail/ear wave + Ambient `falling` leaves/petals, `fireflies`/`meteor`, and 2-bone `swarms`.

### Step 2 — Author `blueprint.json`
Follow [references/blueprint-schema.md](references/blueprint-schema.md):
- Use organic Bezier silhouettes for trees, hills, and animals — **never** flat rectangles, square-chopped branches, or plain concentric-circle clouds.
- Draw circular overlap caps at `(0, 0)` on all limb/tail joints and keep internal bone `shadow: "none"` (or `"shadowInner"` on near limbs/head) so characters read as sculpted, cohesive art rather than bolted toys.
- Stagger all 4 legs on quadrupeds (`*.far` darker/cooler tint + offset angles) so all 4 paws clearly show.
- Declare every `url(#...)` gradient used by `parts[].svg` inside `scene.defsSvg`.

### Step 3 — Compile Both Deliverables
```bash
node scripts/compile_rig_studio.mjs \
  --spec <path/to/blueprint.json> \
  --out-pack <path/to/pack-dir> \
  --out-html <path/to/preview_studio.html>
```

### Step 4 — Run the Fail-Closed Validation Gate
```bash
node scripts/validate_pack.mjs --pretty <path/to/pack-dir>
```
- **Exit code `0` (`"status": "PASS"`) is mandatory.** Fix any reported `{ code, where, detail }`, re-compile, and re-validate until `0` errors remain.
- Do not commit/push to Git unless the user explicitly asks.

## Gotchas (Mistakes That Make Rigs Look Stiff or Fail Validation)

1. **Heavy shadow on every bone creates ugly plastic joint seams:** Always use `groupShadow: "shadowDeep"` on the rig and `"shadow": "none"` (or `"shadowInner"`) on individual bones — NEVER `#shadowMed`/`#shadowDeep` on tail segments or hips.
2. **Static companion kills the story:** Never paste the second character (e.g., Rabbit) as static scenery; make it an independent rig in `rigs[]` so its ears, head, and hops react to the hero.
3. **Missing ground contact shadow makes characters float:** Always set `groundY`, `shadowRx`, and `shadowRy` on grounded rigs (and never draw harsh solid brown ovals under characters).
4. **Geometric clipart trees ruin romantic mood:** Taper trunks with subtle S-curves, flaring roots, curved branches, and asymmetrical layered leaf silhouettes with warm rim highlights.
5. **Collapsed 2-leg quadruped silhouette:** Always offset `*.far` legs in angle & position and tint them 20% darker than `*.near` legs.
6. **Static scattered leaves feel dead:** Use the built-in `type: "falling"` emitter for gently tumbling, wind-drifting autumn leaves or petals across both back & front lanes.
7. **Missing `<defs>`, `Math.random()`, or unsafe SVG tags:** Every `url(#id)` in `parts[].svg` must live in `scene.defsSvg`; never use `Math.random()` or disallowed tags (`<script>`, `<style>`, `<image>`, `<foreignObject>`).

## Delivery Checklist
- [ ] `compile_rig_studio.mjs` produced both HTML preview and pack directory cleanly.
- [ ] `validate_pack.mjs` exited `0` (`PASS`) across `rig.json` and any `rigs/*.json`.
- [ ] Visual self-check: cohesive character shadows (no dark joint cuts), grounded contact shadows, organic trees/silhouettes, warm atmospheric lighting, and active 3-layer motion.
