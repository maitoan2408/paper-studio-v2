# 2D Cutout Rig Archetypes & Spine-Grade Joint Rules

## Golden Joint Cutting Rules (Zero Gaps Under Extreme Rotation)
Distilled from professional 2D cutout rigging (Spine / OpenToonz) and `paper-studio-v2`:
1. **Concentric Circular Joint Caps:** Every limb/segment that rotates around `(0, 0)` (its local pivot) MUST terminate in a semicircle or circle centered at `(0, 0)` whose radius matches the parent's joint socket radius. Example:
   ```xml
   <!-- Segment from pivot (0,0) radius 14 to child attach (0,80) radius 11 -->
   <path d="M-14 0 A14 14 0 0 1 14 0 L11 80 A11 11 0 0 1 -11 80 Z" fill="url(#limbGrad)"/>
   ```
2. **Draw Hidden Overlap Areas:** Always extend hair behind the head, neck inside the collar, and tail segments inside their parent socket by at least `radius` pixels so extreme rotations never reveal white background slits.
3. **Neutral Straight Pose in Art:** Draw limbs/tails straight along their primary axis (`+Y` for biped limbs, `+X` for horizontal creature tails) so they bend symmetrically in both `+` and `-` directions.
4. **Separate Front & Back Layers:** Split capes, coats, hair, and paired fins into `*.back` / `*.far` (`z < 0`) and `*.front` / `*.near` (`z > 0`) bones.
5. **Non-Degenerate Bone Length:** Every child bone's `attach` anchor on its parent MUST satisfy `hypot(attach.x - pivot.x, attach.y - pivot.y) > 0`.

---

## Archetype A — Wave Creature Rig (Whale, Dragon, Fish, Fox Tail, Crane)
Best for organic swimming, flying, or diving shadow-box scenes (9–13 bones).

```text
root (body core, z: 0)
 ├─ head (z: 2)
 │   ├─ jaw (z: 1, limits: -5..35)
 │   └─ vfx-head / spout / crest (z: 1)
 ├─ fin.far / wing.far (z: -2, tinted darker)
 ├─ fin.near / wing.near (z: 3, #shadowDeep)
 └─ mid (z: -1, limits: -42..42)
     └─ tail1 (z: -1, limits: -48..48)
         └─ tail2 (z: -1, limits: -52..52)
             ├─ fluke.l (z: -2)
             └─ fluke.r (z: -2)
```
**Wave Motion Rule:** Offset sine phase by `-0.5` to `-0.65 rad` per segment down `mid → tail1 → tail2 → fluke` so propulsion waves visibly travel head-to-tail.

---

## Archetype B — Biped Character Rig (15–24 Bones, M1b Ready)
Compatible with `paper-studio-v2` (`sides: ["l", "r"]`, `ik`, `contacts`, `ground`).

```text
pelvis (root, z: 0, limits: -20..20)
 ├─ coat.back (z: -3, secondary)
 ├─ spine (waist M1b bend, z: 0.5, limits: -35..48)
 │   ├─ coat.front (z: 1.5, secondary)
 │   └─ torso (chest, z: 1, limits: -22..28)
 │       ├─ head (neck, z: 4, limits: -32..32)
 │       │   ├─ hair.back (z: 2.5, secondary)
 │       │   └─ hair.bangs (z: 5.5, secondary)
 │       ├─ upper-arm.l → forearm.l → hand.l [variants: relaxed, grip, open, point]
 │       └─ upper-arm.r → forearm.r → hand.r [variants: relaxed, grip, open, point]
 ├─ thigh.l → shin.l → foot.l → toe.l
 └─ thigh.r → shin.r → foot.r → toe.r
```
**Proportions:** Balanced storybook (~5–5.5 heads, ~400px tall), short/sturdy (~3.5–4 heads), or slender (~6.5 heads). Always place `grip` anchor identically relative to wrist across all 4 hand variants!

---

## Archetype C — Concentric Celestial & Scenic Props
- **Shadow-Box Moon / Sun (`scene.celestial`):** 4–6 concentric circles stepping from deep sky-teal (`r: 106`) to warm cream (`r: 46`) to golden core (`r: 34`) with `#shadowMed` on each ring + slowly orbiting star ring (`orbitSpeed: 10–16 deg/s`).
- **Pendulum Props (`scene.overlayProps`):** Hot-air balloon (5–7 overlapping white/grey paper gores for 3D folded look + swinging basket), hanging paper lantern, or drifting boat.

---

## Archetype D — Mini-Swarms (`scene.swarms`, 2-Bone Micro-Rigs)
For fish schools, fireflies, cranes, or butterflies:
- Split each micro-creature into `bodySvg` + `tailSvg` (or `wingSvg`) rotating around `[tailPivotX, tailPivotY]` at `wagFreq: 11–16 rad/s`, `wagAmp: 20–30°`.
- Split swarm across `lane: "back"` (behind hero) and `lane: "front"` (in front of foreground waves). Enable `jump: true` on 20–30% of fish for lively wave leaps.
