# Paper Pop-Up Book (`paper-popup`) — Style Grammar

> Adapted from the tactile pop-up storybook & *Paper Mario* craft grammar (MIT `lemo-opuscar/paper-popup`): flat illustrated cut-paper cards standing upright with thick off-white die-cut borders, visible grey cardboard thickness edges, dark-brown hand-drawn wobbly ink lines, and crisp crescent shading.

## 1. Essence — and What It Is NOT
- **IS:** Graphic, tactile cut-paper actors and stage props mounted like pop-up spreads under warm desk/daylight. Every hero or prop card wears **`filter="url(#cutoutBorder)"`** (thick `#fffdf7` off-white cut border + `#b9ad9c` cardboard edge shifted slightly downward), drawn with **dark-brown ink (`#3a2a24`, never pure `#000000`)**, **hand-wobbly curves (`wobblyPath`)**, and **one decisive hard crescent shade (`crescentShadePath`)**.
- **IS NOT:** Backlit monochrome silhouette lace (`paper-lightbox` / `shadow-craft`) or photoreal 3D rendering.

## 2. Value Ladder & Colour Logic
- Saturated children's picture-book colors — **never neon**.
- **One dominant hue family per spread** (e.g. sunlit meadow green under powder blue, ochre craft workshop with terracotta and teal accents), unified by consistent `#3a2a24` dark-brown ink and `#fffdf7` cut-out borders.
- Warm umber shadows (`#3d2817`, `shadowOpacity: 0.65`) keep the paper feeling sun-lit and joyful.

## 3. Motion Cadence & Life
- Snappy, toy-like theatre physics: crisp **`ease: "back"`** overshoot on pops/reactions, smooth 60fps camera/props with optional **12–24 fps** character beat, `scaleWaves` squash-and-stretch on jumps, `gait` ground-locked walking so flat card boots never skate, and `strands[]` ribbons trailing with inertia.

## 4. Native Moves
- **Pop-Up Reveal:** layered cards springing upright with `ease: "back"` overshoot.
- **Pull-Tab / String Props:** swinging signs, rotating windmills/gears (`spins`), speech/emote cards popping above characters.
- **Scale.x Flip:** crisp facing turns (`facing: 1 | -1`) like a real two-sided paper card.

## 5. Pitfalls
- Pure `#000000` ink looks harsh and digital → always use warm `#3a2a24` dark-brown ink.
- Ruler-straight geometry kills handmade pop-up charm → use `wobblyPath()` + `crescentShadePath()`.
- Applying `#cutoutBorder` to individual limb segments breaks the unified paper-card silhouette → put `#cutoutBorder` on the merged `seamGroup` or outer rig layer!
