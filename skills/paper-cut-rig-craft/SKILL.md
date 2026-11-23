---
name: paper-cut-rig-craft
description: Designs and compiles high-craft 2D/2.5D multiplane paper-cut and shadow-box skeletal rigs into both an interactive HTML preview studio (60fps FK/IK, 3D parallax, bone diagnostics) and a validated paper-studio-v2 asset pack (SVG + manifest.json with SHA-256 + rig.json). Use when the user asks to create or preview a paper-cut character rig, shadow-box creature or nature scene (whale, fox, moon, stars, waves, lantern), cutout puppet, or interactive rig viewer.
compatibility: Requires Node.js 18+ (zero external dependencies). Works across Antigravity, Claude Code, Cursor, and Codex.
metadata:
  author: paper-studio-v2
  version: "1.0.0"
---

# Paper-Cut & Shadow-Box Rig Craft

Turn any short creative description (human character, diving sea creature, forest animal, or multiplane shadow-box diorama) into **two synchronized deliverables in one fast pass**:
1. A standalone **interactive HTML Rig Studio** (60fps FK/IK, bone sliders, 3D shadow-box parallax, skeleton/anchor diagnostics, shadow depth & layer toggles).
2. A **validated `paper-studio-v2` asset pack** (`*.svg`, `manifest.json` with real `SHA-256`, `rig.json`).

## Bundled Resources (Load Only What You Need)

- **Aesthetic & 3-layer motion rules:** [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md) — read before choosing colors, Z-depth occlusion, or animation curves.
- **Rig bone trees & Spine-grade joint cutting:** [references/rig-archetypes.md](references/rig-archetypes.md) — read to pick the right skeleton (Wave Creature, Biped 15–24 bones, Celestial Prop, or 2-bone Mini-Swarm).
- **Exact `blueprint.json` contract:** [references/blueprint-schema.md](references/blueprint-schema.md) — read before writing the JSON blueprint.
- **Compiler script:** `scripts/compile_rig_studio.mjs` — compiles 1 declarative `blueprint.json` into both the HTML viewer (via `assets/viewer-shell.html`) and the full SVG/JSON pack in `< 1s`.
- **Fail-closed validator:** `scripts/validate_pack.mjs` — verifies SVG allowlist, `SHA-256`, bone acyclicity, limits, skins, and anchors.

## Fast 4-Step Workflow

Do **not** hand-write 800 lines of HTML/CSS/FK/IK boilerplate from scratch. Author **one clean `blueprint.json`** and compile it using the bundled toolchain.

### Step 1 — Distill the Brief into a Scene Blueprint
Pick the archetype(s) from [references/rig-archetypes.md](references/rig-archetypes.md) and plan 3 simultaneous motion layers (from [references/aesthetic-and-motion.md](references/aesthetic-and-motion.md)):
- **Primary:** Hero articulated rig (8–24 bones) with multi-phase cycle (`type: "cycle"`) + gentle harmonic preset (`type: "harmonic"`).
- **Secondary:** Overlapping wave lag down tails/fins/hair/coat, plus reaction VFX (`splashAtY`, `bubbles`, `spout`).
- **Ambient:** Seeded twinkling stars, sky emitters (`meteor` shooting stars or `fireflies`), breathing concentric celestial rings, swaying waves/hills, and a 2-bone `swarms` school (swimming/jumping fish or flapping birds).

If the prompt is genuinely ambiguous on subject/style, ask at most 2–3 quick questions; otherwise pick strong defaults and build immediately.

### Step 2 — Author `blueprint.json`
Follow [references/blueprint-schema.md](references/blueprint-schema.md) strictly:
- Draw every rotating limb/tail segment in `parts[].svg` around local pivot `(0, 0)` with **concentric circular overlap caps** (`A r r ...`) so extreme angles never open gaps.
- Declare all `url(#...)` gradients used by parts inside `scene.defsSvg` so standalone exported SVGs stay self-contained.
- Separate `scene.backLayers` and `scene.frontLayers` so the hero passes *behind* foreground waves/hills naturally.
- Keep `scene.frameSvg` slim and `scene.cornersSvg` minimal (<= 15–18% canvas area) so the scene reads wide and unobstructed.

### Step 3 — Compile Both Deliverables
Run the bundled compiler (one command generates both the interactive studio HTML and the asset pack):

```bash
node scripts/compile_rig_studio.mjs \
  --spec <path/to/blueprint.json> \
  --out-pack <path/to/pack-dir> \
  --out-html <path/to/preview_studio.html>
```

### Step 4 — Run the Fail-Closed Validation Gate
Run the validator on the generated pack before presenting anything to the user:

```bash
node scripts/validate_pack.mjs --pretty <path/to/pack-dir>
```

- **Exit code `0` (`"status": "PASS"`) is mandatory.**
- If exit code is `1`, inspect each `{ code, where, detail }` error, fix `blueprint.json`, re-compile, and re-validate until `0` errors remain.
- Do **not** commit or push to Git unless the user explicitly asks; keep the working repo clean for preview requests.

## Gotchas (Mistakes Agents Make Without These Rules)

1. **Flat-cut joints split apart on bend:** Never cut a limb or tail straight across its pivot. Always end overlapping edges with a circular arc centered at `(0, 0)` matching the parent socket radius.
2. **Oversized white frames/clouds ruin staging:** Keep cutout rims thin and corner clouds compact; always keep them in `frameSvg` and `cornersSvg` so the user can toggle them independently.
3. **Flat single-plane staging:** Putting all waves or hills behind the hero makes diving/walking look pasted-on. Always split foreground waves/hills into `frontLayers` above the hero.
4. **Missing gradient `<defs>` in exported SVGs:** Any `fill="url(#id)"` used in `parts[].svg` MUST exist in `scene.defsSvg`, otherwise standalone `.svg` files render black.
5. **Non-determinism breaks `paper-studio-v2`:** Never use `Math.random()` or wall-clock time; rely on `meta.seed` and the deterministic LCG built into `viewer-shell.html`.
6. **Unsafe SVG markup fails `validate_pack.mjs`:** Never put `<script>`, `<style>`, `<image>`, `<foreignObject>`, `on*` handlers, or `http(s)://` links inside SVG strings.
7. **Zero-length bones (`RIG_DEGENERATE_BONE`):** Every child `attach` anchor on its parent must be at a non-zero distance from the parent's `pivot`.

## Delivery Checklist
Before replying to the user, verify:
- [ ] `compile_rig_studio.mjs` succeeded and produced both HTML preview and pack directory.
- [ ] `validate_pack.mjs` exited `0` (`PASS`) with `0` errors.
- [ ] All 3 motion layers (Primary, Secondary, Ambient) are active and smooth at `1×` and `0.5×`.
- [ ] User receives clickable links to the HTML preview (or artifact) and pack `manifest.json` / `rig.json`, plus a brief summary of bone count and features.
