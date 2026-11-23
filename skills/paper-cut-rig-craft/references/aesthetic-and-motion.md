# Cinema-Storybook Paper-Cut Aesthetic & Emotional Motion (v1.1)

**Goal:** Scenes must feel like a warm, living miniature paper theater (*Song of the Sea*, *Klaus*, *Kubo*) — **never** stiff geometric clipart or bolted-together plastic toys.

## 1. Anti-Clipart Rules (What Makes Scenes Look Stiff — BANNED!)
1. **No heavy black drop-shadows between limbs/tail segments of the same character:**
   - Use **ONE cohesive `#shadowDeep` on the entire character group** (`groupShadow: "shadowDeep"`, which is the default in `viewer-shell.html` v1.1).
   - Keep individual bones at `"shadow": "none"` (or `"shadowInner"` ONLY on near-side overlapping legs/arms). Never apply `#shadowMed` or `#shadowDeep` to tail segments or neck/hip joints — it slices the character into ugly plastic toy pieces!
2. **No square-chopped geometric trees or concentric-circle clouds:**
   - **NEVER** draw tree trunks as straight rectangles or V-branches with flat square caps.
   - **ALWAYS** draw tapered, gently curved Bezier trunks with flaring root bases gripping the ground, organic tapering boughs, and **asymmetrical botanical foliage clusters** (overlapping layered scalloped leaf silhouettes lit by a warm moon/lantern rim on one side!).
3. **No floating characters & no harsh brown contact ovals:**
   - Every walking/standing rig MUST define `groundY`, `shadowRx`, and `shadowRy` so `viewer-shell.html` automatically casts a **soft feathered radial ground shadow** that tracks `rootX` and softens when jumping.
4. **No collapsed 2-leg silhouettes on quadrupeds:**
   - On foxes, deer, wolves, or rabbits, separate far-side legs (`*.far`, tinted 18–25% cooler/darker) from near-side legs with a staggered stride offset (`±14°..22°`) so all 4 paws clearly read at rest and in motion.

## 2. Emotional Lighting & Atmospheric Perspective
Emotion comes from **light, air, and contrast**, not just shapes:
1. **Aerial Perspective (Layer-by-Layer Depth Haze):**
   - Distant hills/trees (`backLayers[0]`): lower contrast, shifted toward sky-horizon tint.
   - Midground (`backLayers[1]`): richer saturation, soft mist band (`scene.atmosphere.midMistSvg`) separating background from the character stage!
   - Foreground (`frontLayers`): deepest silhouette value + delicate warm rim stroke along the top edge (`stroke-opacity: 0.35`) catching moonlight/lantern light.
2. **Storytelling Light Focus (`scene.atmosphere`):**
   - Add soft diagonal **moonlight/sunlight shafts** (`lightShaftsSvg`) pointing gently toward the meeting point of the characters.
   - Add a **warm lantern/interaction glow pool** (`warmGlow` in `phase.vfx` + `foregroundGlowSvg` subtle vignette) so the viewer's eye feels drawn into the intimate emotional beat.
3. **Wide-Aperture Shadow-Box Staging:**
   - Keep outer shadow-box frame slim (`<= 14–16%` border) and corner clouds/branches delicate so the full sky, moon, and horizon breathe.

## 3. Living 3-Layer Motion & Acting Beats
1. **Primary Acting (Emotional Story Arc — Not Just Looping Locomotion):**
   - For 2-character scenes (e.g., Fox meeting Rabbit), give **BOTH characters independent rigs** in `rigs[]`!
   - Choreograph a 4–5 phase emotional beat:
     - *Beat 1 — Approach:* Gentle walk with staggered 4-leg gait + soft vertical body bob + trailing bushy tail wave.
     - *Beat 2 — Recognition & Pause:* Anticipation slowdown; Rabbit perks ears & tilts head curiously.
     - *Beat 3 — Warm Greeting:* Fox softly bows head with curved smiling eye, bushy tail wags warmly (`emote: "warm"` / `"heart"`), warm light pool blooms (`vfx.warmGlow`).
     - *Beat 4 — Joyful Response:* Rabbit does a tiny `ease: "back"` happy hop while Fox lifts head playfully.
     - *Beat 5 — Lingering Quiet Moment:* Both breathe gently side-by-side under drifting leaves & fireflies.
2. **Secondary Life:**
   - Progressive phase lag down tails/ears/hair (`0 → -0.55 → -1.1 → -1.65 rad`), volume-preserving micro-breathing (built into `viewer-shell.html`), and reacting VFX (`splashAtY`, `bubbles`, `warmGlow`).
3. **Ambient Poetry (Deterministic Seeded):**
   - Use `type: "falling"` emitter for drifting autumn maple leaves / sakura petals / snow (diagonal wind + sinusoidal flutter + 3D tumble across both back & front depth lanes!).
   - Pair with `fireflies` or `meteor` shooting stars + `swarms` (flapping birds or jumping fish).
   - **Zero `Math.random()`** — always seeded.
