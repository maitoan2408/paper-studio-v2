# Universal 2D Paper-Cut Rig Archetypes (v3.0 — Seamless Limbs & Living Gait)

Every archetype is **100% data-driven** and works across **human characters, mechanical/architectural props, everyday objects, and creatures** — never restrict the skill to one genre.

## Core Anti-Stiffness, Joint & Grounding Rules
1. **Eliminate "Wooden Sausage Joints" (`rig.hoses[]` + `seamGroup`):** Never put an individual `paperBevel` filter on separate upper and lower limb bones. Instead, mark upper/lower limb bones `hiddenInViewer: true` (keeping full kinematic + `validate_pack` integrity), draw a **continuous tapered Bézier `rig.hoses[]`** strip through `(upper, lower, end)` with optional rolled `cuffAt`/`cuffFill`, and group the hose + hand/boot in `seamGroup` (`seamFilter: "paperBevelSoft"` or `"gouacheGrain"`).
2. **2-Spine Articulation (Never One Frozen Block):** Split human torsos into `pelvis` → `torso` and quadruped bodies into `pelvis/rump` → `chest` → `neck` → `head` so breathing, contrapposto, and stride sway flex the body organically.
3. **Analytic 2-Bone IK Locomotion (`gait`) + Stateless `followThrough`:** Use `gait` (`60%` ground-locked stance + `40%` knee-bent swing + `2×` hip bob + foot leveling) for walking, and attach `followThrough: { lag, velGain, rotGain }` to scarves, coat hems, tails, ears, and hair.
4. **3/4 Expressive Heads with Auto-Blink (`data-eye="1"`):** Use `head-3q-storybook` or custom 3/4 heads showing both near & far eyes wrapped in `<g data-eye="1" transform="translate(cx,cy)">` with staggered `rig.blink`.
5. **Exact Ground-Shadow Contact (`groundY` + `chalkShadow`):** Align `groundY` to the exact world Y of the character's lowest sole/hoof/wheel at rest, and use `shadowStyle: "chalk"` for tactile pooled contact shadows.

---

## Archetype A — Expressive 3/4 Human / Biped Character (15–18 Bones + Seamless `hoses[]` + IK `gait`)
Ideal for **artisans, travelers, musicians, children, dancers, shopkeepers, or story heroes**:
```text
pelvis (trousers/skirt waist, contrapposto rest -2°, z: 0)
 ├─ torso (vest/shirt/coat chest, rest +3°, z: 1, subtle breathing scaleWaves)
 │   ├─ scarf.u → scarf.l (2-segment woven cloth, z: 3, followThrough: { lag: 0.15, velGain: 0.2, rotGain: 0.5 })
 │   ├─ head (3/4 head-3q-storybook with near+far data-eye="1" blink, z: 3.5)
 │   │   └─ hat / hairBack (z: 3.8 / -2, followThrough)
 │   ├─ arm.l.u → arm.l.l (hiddenInViewer: true) → hand.l (z: -2, hose: armL_hose, seamGroup: "armFar")
 │   └─ arm.r.u → arm.r.l (hiddenInViewer: true) → hand.r (z: 4.5, IK armR, hose: armR_hose with cuffAt, seamGroup: "armNear")
 ├─ leg.l.u → leg.l.l (hiddenInViewer: true) → foot.l (z: -1.5, IK legL, hose: legL_hose, seamGroup: "legFar", boot-cuffed)
 └─ leg.r.u → leg.r.l (hiddenInViewer: true) → foot.r (z: 0.6, IK legR, hose: legR_hose, seamGroup: "legNear", boot-cuffed on groundY)
```

---

## Archetype B — Mechanical, Architectural & Kinetic Prop Rig (4–10 Bones + 360° `spins`)
Ideal for **windmills, bicycles, clockwork towers, music boxes, trains, swinging signs, lanterns, or cranes**:
```text
root / base (stone/brick/wood tower, frame, or chassis anchored at groundY, z: 0)
 ├─ hub / axle (limits: [-180, 180], spins: { hub: 42 }, brad pin at center, z: 2)
 │   ├─ blade.1 .. blade.4 (mounted at non-zero anchor radius >= 10px to avoid RIG_DEGENERATE_BONE, z: 2)
 ├─ pendulum / sign / lantern (gentle harmonic wave + followThrough tassel, z: 1)
 └─ vane / chimney-puff / flag.u → flag.l (2-segment wind ripple, z: 1)
```

---

## Archetype C — Articulated 2-Spine Quadruped (16–18 Bones + 4-Chain IK `gait` + Seamless `hoses[]`)
Respect real **ungulate/quadruped anatomy** with articulated spine (`rump` → `chest` → `neck` → `head`) and 4-beat IK walk (`fl: 0.0, br: 0.25, fr: 0.5, bl: 0.75`):
```text
rump / pelvis (sculpted haunch + cream belly wrap, z: 0)
 ├─ chest (arched ribcage + warm brisket ruff, z: 0.5, overlaps rump seamlessly)
 │   ├─ neck (graceful S-curved neck, z: 1.2) → head (3/4 brow/muzzle/antlers + near/far data-eye="1", z: 2.5)
 │   │   ├─ ear.far (z: 2.1, followThrough) & ear.near (z: 3.0, followThrough)
 │   ├─ fl.u → fl.l (hiddenInViewer: true) → hoof.fl (z: -1.5, IK fl, hose: fl_hose, seamGroup: "deerFar")
 │   └─ fr.u → fr.l (hiddenInViewer: true) → hoof.fr (z: 1.8, IK fr, hose: fr_hose, seamGroup: "deerNear")
 ├─ bl.u → bl.l (hiddenInViewer: true) → hoof.bl (z: -1.6, IK bl, hose: bl_hose, seamGroup: "deerFar")
 ├─ br.u → br.l (hiddenInViewer: true) → hoof.br (z: 1.6, IK br, hose: br_hose, seamGroup: "deerNear")
 └─ tail (z: -0.5, followThrough: { lag: 0.16, velGain: 0.18, rotGain: 0.55 })
```

---

## Archetype D — Small Expressive Companion (6–8 Bones: Hare, Bird, Cat, Automaton, Spirit)
Sculpt distinct **seated hind haunch + long grounded foot pad** (never a plain round snowball):
```text
root (layered body + distinct tucked thigh/foot base on groundY + scarf/chest ruff, z: 0, scaleWaves)
 ├─ tail (z: -1) & limb.near (paw/wing, z: 2, shadow: shadowInner)
 └─ head (z: 2, shadow: shadowInner) → ear.far (z: 1) & ear.near (z: 3)
```

---

## Archetype E — Wave & Pulsing / Tentacled Creatures (10–13 Bones)
- **Wave / Swimming / Flying (`C1` — Whale, Koi, Dragon, Crane):** Keep ventral/dorsal color bands **continuous across `head`–`root`–`mid`–`tail1` pivots** so arching never breaks the belly into separate patches; place water surface waves in `midLayers[]` / `frontLayers[]` when breaching.
- **Pulsing / Tentacled (`C2` — Jellyfish, Octopus, Floating Spirit):** Pair `root` `scaleWaves` (`ampX: +0.14, ampY: -0.12`) with **2-segment `tent.u → tent.l` chains** (child anchors automatically track parent `scaleWaves`).
