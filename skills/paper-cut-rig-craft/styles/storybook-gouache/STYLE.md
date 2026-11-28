# Storybook Gouache (`storybook-gouache`) — Style Grammar

> Warm cinema picture-book cut-paper dioramas (*Song of the Sea / Klaus* spirit) with soft cotton-rag gouache tooth, expressive 3/4 character faces, seamless continuous limbs, and chalky pooled contact shadows.

## 1. Essence — and What It Is NOT
- **IS:** Soft hand-painted cotton cardstock cut-outs layered in 3–4 atmospheric depth planes, warm-vs-cool focal glow, tactile `#gouacheGrain` edges, `#chalkShadow` ground pools, expressive 3/4 faces (`head-3q-storybook`) with auto-blinking eyes, and contrapposto spines.
- **IS NOT:** Plastic flat vector art, sharp-cornered polygon clipart, harsh neon gradients, or thick white sticker borders (that belongs to `paper-popup`).

## 2. Value Ladder & Colour Logic
- Separate planes strictly by value & saturation: `sky` (soft wash) → `backLayers` (muted atmospheric tint, low contrast) → `midLayers` (mid value) → **`rigs[]` (highest contrast, warm key highlight)** → `frontLayers` & `proscenium frame` (deep framing silhouette).
- Match shadow hue to mood: warm umber (`#3d2817`) for daylight, deep Prussian indigo (`#091528`) for moonlit scenes — never pure `#000000` on sunny days.
- Reserve **one saturated focal accent** (scarf, lantern flame, hat, flower) to anchor the eye.

## 3. Motion Cadence & Life
- Smooth **60 fps** fluid motion (`cadence.charFps: 0`) paired with analytic 2-bone IK `gait` (`2×` hip bob + 60% ground-locked stance), stateless `followThrough` on scarves/tails/ears, multi-link `strands[]`, and subtle `tremor` during holds.

## 4. Native Moves
- Warm backlit focal halo breathing behind hero interaction; asymmetric `storyTree` + `terrainRidgeLayer` valley mist; multi-plane parallax drift; expressive `emote` beats.

## 5. Pitfalls
- Never apply `paperBevel` individually to upper + lower limb bones (use `rig.hoses[]` + `seamGroup`).
- Keep ≥ 15px clean silhouette breathing room around noses, hands, and posts (zero tangents).
