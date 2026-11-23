# Paper-Cut Shadow-Box Aesthetic & Motion Guide

## 1. Visual Craft (Shadow-Box Depth, Not Flat Vectors)

### Wide-Aperture Staging Rule
- Keep the outer shadow-box frame slim (total border + corner clouds <= 15–18% of canvas area).
- Never let white clouds or cutout rims block the hero's main action arc or the ocean/ground horizon.
- Always expose toggles for the outer frame and corner clouds so the user can inspect full-bleed scenery.

### Paper Materiality & 3-Tier Shadows
Every paper layer must look physically cut and stacked:
1. **Paper grain:** `url(#paperTex)` (`feTurbulence` + `feColorMatrix` multiply) on hero and major props.
2. **Three shadow depths (built into `viewer-shell.html`):**
   - `#shadowDeep` (`dy=8, blur=9`) — foreground waves, hero core, outer shadow-box frame, overlay pendulum props.
   - `#shadowMed` (`dy=6, blur=6`) — mid-depth scenery, concentric moon rings, articulated limbs/segments.
   - `#shadowSoft` (`dy=4, blur=6`) — mini-swarms (fish/birds), corner clouds, water splashes, orbiting stars.
3. **Color & Contrast Discipline:**
   - Pick **1 deep atmospheric backdrop** (e.g., midnight navy `#0b1326 → #1d3057`, twilight plum, autumn forest teal) + **1 warm luminous focal point** (golden moon/sun/lantern `#ffe670 → #e39c12`) + **1 crisp light paper surface** (`#ffffff → #cdd6e0`) for hero contrast.
   - Tint far-side limbs (`*.far`, `*.l` in 3/4 view) 15–25% darker than near-side limbs so depth reads immediately without thick outlines.
   - Add delicate pleated contour lines (`stroke-width: 1.2–1.5`, low-contrast tint) on curved white paper surfaces (whale belly, clouds, clothing folds) to evoke layered origami/paper-cut craft.

## 2. True Z-Layer Occlusion (Never Flatten to One Plane)
Arrange layers back-to-front so subjects physically pass *behind* foreground elements:
```text
0. Sky gradient + seeded twinkling stars
1. Ambient sky emitters (shooting stars / fireflies / snow)
2. Concentric celestial rig (moon / sun + orbiting stars)
3. Back scenery (distant hills / back ocean waves / lighthouse)
4. Back mini-swarm (fish / birds behind hero)
5. Hero articulated rig + dynamic VFX (water splash, bubbles, glow)
6. Front scenery (foreground waves / grass / hills — occludes hero when diving or walking behind!)
7. Front mini-swarm (jumping fish / foreground birds)
8. Slim shadow-box aperture frame + minimal corner clouds + overlay pendulum prop
```

## 3. Three-Layer Motion Architecture (12 Principles in Code)
Flat motion = only the hero moves. Always run **3 simultaneous layers**:
- **Primary (Hero Rig):**
  - Use **multi-phase cycles** (`type: "cycle"`) with anticipation, curved arcs (`arcY`), slow-in/slow-out (`smoothstep`), and clear staging (e.g., Emerge → Arch & Spout → Plunge → Glide Underwater).
  - Never use linear constant-speed point-to-point motion.
- **Secondary (Follow-Through & Overlap):**
  - Propagate sine waves down articulated chains (tails, hair, coat hems, fins) with **progressive phase lag** (`phase: 0 → -0.6 → -1.2 → -1.8 → -2.4`) and **increasing amplitude** toward the tip (`amp: 14° → 20° → 24° → 26°`).
  - Trigger environmental reaction VFX (`splashAtY`, `bubbles`, `spout`) when crossing surfaces.
- **Ambient (Living World, Low Distraction):**
  - Twinkling stars (seeded frequencies `1.2–3.4 rad/s`), periodic shooting stars (`period: 5–9s`, staggered `offset`), gentle wave sway, concentric moon breathing (`±3.5%`), drifting pendulum balloon/lantern (`tiltAmp: 3–4°`).

## 4. Determinism Rule
- **Never use `Math.random()` or `Date.now()`.** Every star, particle, meteor, and fish phase must derive from a fixed integer `seed` so frame `t` always renders identically.
