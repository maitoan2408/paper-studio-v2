# Studio Mastercraft Aesthetic & Anti-Stiffness Bible (v3.0)

These principles apply universally to **ANY theme, genre, or lighting mood** — sunlit workshops, cozy villages, winter forests, fantasy worlds, machines, or deep oceans. Zero hardcoded character or scene logic.

---

## 1. Root Causes of "Wooden / Stiff" Cutout Art — And How v3.0 Solves Every One

| Amateur Failure Mode | Why It Looks Stiff ("Cứng, Đơ") | v3.0 Studio Mastercraft Solution |
| --- | --- | --- |
| **Wooden Sausage Joints** | Putting `paperBevel` on each upper & lower limb bone draws a bright white rim across every knee/elbow/hip. | Wrap connected limb parts in **`seamGroup`** (merges silhouette alpha before bevel/grain) and render bent limbs as **continuous tapered Bézier `rig.hoses[]`** (`hiddenInViewer: true` on rigid proxy bones). |
| **Ice-Skating / Pendulum Walk** | Interpolating `rootX` with constant `rootY` (`0px` bob) while swinging straight FK legs. | Use analytic 2-bone IK **`gait`**: `60%` ground-locked stance + `40%` knee-bent swing arc + **`2×` vertical hip bob** (`-bob * |sin(ωt)|`) + flat-to-toe-off foot leveling. |
| **Frozen Cardboard Torso & Face** | Single rigid torso block, zero secondary inertia, unblinking static eyes, flat side-profile head. | **2-bone articulated spine** (`pelvis/rump` → `torso/chest`), **stateless `followThrough`** (`t` vs `t - lag`) on scarves/tails/ears/hair, **3/4 portrait heads** with **both** near & far **`data-eye="1"`** blinking eyes. |
| **Symmetric Clipart Scenery** | Mirror-symmetric "wedding-cake" pine cones, single `Q...T...` curves for hills, repeated circular bushes. | Multi-octave **`fbm` / `ridgedFbm` `terrainRidgeLayer`** with directional pseudo-3D slope `shadowBands`, crooked asymmetric **`storyTree`**, split-tone veined **`foliageSpray`**, and perspective **`windingPath`**. |
| **Visual Tangents** | Character nose/hand/antler barely grazing a lantern post or tree trunk (`0–4px` gap), flattening depth. | Leave **≥ 15–24px clean negative space** around focal silhouettes (or overlap decisively by ≥ 15%). |

---

## 2. Gouache × Cut-Paper Tactility & 3/4 Character Appeal

1. **Edge-Gathered Gouache Grain (`#gouacheGrain`) & Chalk Shadows (`#chalkShadow`):**
   - Combine `url(#gouacheGrain)` on organic heroes, coats, and tree canopies with `url(#paperBevel)` / `url(#paperBevelSoft)` on crisp architectural/costume layers so surfaces feel hand-painted on 300gsm cotton rag rather than plastic vector gradients.
   - Enable `lighting.chalkShadows: true` (or `rig.shadowStyle: "chalk"`) so ground contact shadows pool softly with textured paper tooth.
2. **Crown-to-Occlusion Volume Gradients:**
   - Never shade foliage or garments with flat single fills. Light the upper-windward crown warmly (`cx="34%" cy="26%"` radial or angled linear gradient) and drop into cool, saturated ambient occlusion on the underside.
3. **3/4 Character Heads & Contrapposto Weight:**
   - Sculpt human and creature heads in **expressive 3/4 view** (`head-3q-storybook` kit or custom): show **both** the near eye and slightly foreshortened far eye (wrapped in `<g data-eye="1" transform="translate(cx,cy)">` so they blink in place!), a sculpted nose bridge breaking the inner cheek plane, subtle warm gouache cheek blush, and hair mass wrapping behind the neck as well as across the brow.
   - At rest, avoid soldier-straight vertical spines: tilt `pelvis` (`-2°..3°`) against `torso` (`+3°..-4°`) for natural contrapposto weight.
4. **Anatomical Handedness Table (Never Flip Thumbs Backward):**
   - **Palm Down / Relaxed at Side (facing `+x`):** Thumb points **forward/inward (`+x`)** toward body/thigh.
   - **Open Wave / Palm Facing Viewer (raised arm, facing `+x`):** Right hand thumb points **inward (`-x` toward face)**; Left hand thumb points **inward (`-x` toward face)** when palm faces out, or `+x` when back-of-hand faces viewer. Verify in `closeup_<rigId>.png`!

---

## 3. Living Deterministic Motion Architecture (`t → pose`, Zero Mutable State)

1. **Analytic 2-Bone IK Locomotion (`gait`):**
   - Bipeds: 2 chains (`phase: 0.0` and `phase: 0.5`), `stanceFrac: 0.6`, `bob: 5–7`, `lift: 14–20`, `toeOff: 12`, `heelStrike: -8`, plus `spineBone` sway and `swingBones` opposing arm swing (`phase: 0.5` vs `0.0`).
   - Quadrupeds: 4-beat walk (`fl: 0.0, br: 0.25, fr: 0.50, bl: 0.75`) with gentle `bob: 3.5–5`, `lift: 12–16`, and articulated `chest` + `neck` + `head` counter-nodding.
2. **Stateless Closed-Form Inertia (`bone.followThrough`):**
   - Attach `"followThrough": { "lag": 0.14, "velGain": 0.18, "vertGain": 0.08, "rotGain": 0.48 }` to scarves, coat tails, animal tails, long ears, hair locks, and hanging lanterns.
   - The viewer evaluates `t` vs `t - lag` in closed form — **100% deterministic and scrub-safe** while giving genuine physics drag and overshoot!
3. **Life Micro-Beats (`blink`, `scaleWaves`, `spins`):**
   - Stagger `rig.blink` (`{ period: 3.4, duration: 0.18, phase: 0.7 }`) across characters so blinks never fire robotically in unison.
   - Add subtle chest breathing `scaleWaves` (`ampX: 0.018, ampY: -0.015`) during calm pauses.

---

## 4. Mandatory 6-Frame Motion-Sheet & Closeup Critique (`render_audit.mjs`)

Always inspect **`motion_sheet.png`** (6 frames across the cycle), **`silhouette.png`**, and **`closeup_<rigId>.png`**:
- In `motion_sheet.png`: verify the character actually **shifts weight, bends knees during swing, keeps planted feet on the floor line, trails secondary cloth/tails, and blinks**.
- In `closeup_<rigId>.png`: verify **zero bevel cut-lines across knees/elbows**, expressive 3/4 eyes, tactile gouache/paper grain, and clean joint overlaps.
- In `silhouette.png`: verify **zero tangents** and asymmetric organic tree/terrain contours.

## v4.0 Style Grammars, Cut-Paper Optics & Prove-the-Look Discipline

1. **Pick One Style Grammar First (`styles/<slug>/STYLE.md`):**
   - `paper-lightbox`: Enforce a strict back-to-front value ladder (bright luminous sky/haze → dark opaque foreground planes) + 1 warm focal glow + `url(#backlitPulp)` + `12fps` stepped character cadence.
   - `paper-popup`: Apply `url(#cutoutBorder)` to midground/hero cutouts for authentic die-cut white borders + grey cardboard thickness, use `wobblyPath` + `crescentShadePath` for organic paper volumes, and keep ink strokes warm dark-brown (`#3a2a24`, never `#000`).
   - `shadow-craft`: Carve intricate silhouettes with `openworkCutout` (`fill-rule="evenodd"`), drive at `12fps` with subtle `rig.tremor`, and backlight through warm vellum screens.
2. **Continuous Flowing Ribbons (`rig.strands[]`):** Replace stiff single-bone scarf/hair/tail triangles with 5–8 link tapered `rig.strands[]` ribbons featuring wave propagation, gravity sag, and optional stripe/rim details.
3. **Prove the Look Before Polishing Motion:** Always inspect `modelsheet_<rigId>.png` (Rest Pose, Active Pose, Skeleton & Anchors, Monochrome Silhouette) from `render_audit.mjs` first to verify proportions, readability, and style optics before iterating on the 6-frame `motion_sheet.png`.

---

## v5.0 Cinema-Grade 3D Sculpted Relief & Dual-Path Cardstock Rules

1. **Dual-Path 3D Geometry (Zero Z-Fighting):**
   - **Environment & Architecture (`scene.layers3d[]`):** Build real physical 3D relief (`folded_ridge` with `pleated`, `faceted`, or `tiered_cliff_slabs`, `cupped_petals`, `pine_fan_tree`, `architecture` with carved pagoda rafters & punched arches) spaced generously across `Z` (`spacerGap = 0.35–0.85` world units) so raking `keyLight` + `GTAO` cast bold layered shadows.
   - **Characters & Rich Library SVGs (`parts[]` + `part.cardstock`):** Never feed multi-element overlapping SVGs directly into naive polygon extrusion (causes Z-fighting and drops strokes/gradients). The v5.0 engine traces the outer alpha contour into a **beveled 3D cardstock slab** (cream paper-core edge `material[1]`) and maps a `4×` supersampled SVG print + `300gsm cotton normal/roughness` + `Backlit Subsurface` + live `data-eye="1"` blink onto `material[0]`.
2. **Telephoto Multiplane Lens (`fov: 24°`):** Keeps intra-character bone Z-steps (`0.016`) free of perspective joint separation (`< 0.35%` foreshortening) so 2-bone IK `gait` locks feet cleanly to 3D cliff/bridge ledges while preserving deep shadow-box parallax.
3. **Mandatory Multi-Angle & Inline Chat Proof:** Always inspect `frame_oblique_3d.png` (`18°`), `frame_exploded_z.png`, `modelsheet_*.png`, and `motion_sheet.png`, confirm `determinismCheck.status === "PASS"`, and embed the final PNGs directly inline in chat (`![caption](/abs/path.png)`).

