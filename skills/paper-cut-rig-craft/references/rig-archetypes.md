# Universal 2D Paper-Cut Rig Archetypes (v2.0)

Every archetype is **100% data-driven** and works across any species, character, or theme.

## Core Joint & Puppet Rules
1. **Concentric Circular Joint Caps:** Every rotating part ends in an arc centered at `(0, 0)` matching its parent socket radius — zero gaps at extreme bends.
2. **2-Segment Articulated Limbs for Expressive Steps:** For hero quadrupeds and bipeds, split legs/arms into `upper → lower` (`thigh → shin/paw` or `upper-arm → forearm → hand`) so walking lifts and curls paws/knees gracefully instead of stiff peg-legs!
3. **Optional Paper-Fastener Brads (`bone.brad`):** Add `"brad": { "r": 3.8, "fill": "#f0c896", "stroke": "#70391c" }` to primary hip/shoulder joints when aiming for tactile paper-puppet charm; omit for seamless organic creatures.
4. **Cohesive Group Shadow:** Rely on rig-level `groupShadow: "shadowDeep"`; keep bone `shadow: "none"` on spine/tail segments and `"shadowInner"` only on near-side limbs/head.
5. **Non-Degenerate Bone Length:** Every child `attach` anchor MUST satisfy `hypot(attach.x - pivot.x, attach.y - pivot.y) > 0`.

---

## Archetype A — Articulated Quadruped (13–15 Bones: Fox, Deer, Wolf, Cat, Horse)
```text
root (arched body core + light chest/belly paper layer, z: 0)
 ├─ head (sculpted snout, cheek tufts, gentle eye, z: 2, shadow: shadowInner)
 │   ├─ ear.far (z: 1, darker tint)
 │   └─ ear.near (z: 3, layered inner ear)
 ├─ fleg.far.u → fleg.far.l (z: -2, darker tint, staggered rest)
 ├─ bleg.far.u → bleg.far.l (z: -2, darker tint)
 ├─ fleg.near.u (optional brad!) → fleg.near.l (z: 1, shadow: shadowInner)
 ├─ bleg.near.u (optional brad!) → bleg.near.l (z: 1, shadow: shadowInner)
 └─ tail1 → tail2 → tail3 (layered paper fur + jagged/scalloped tip, shadow: none)
```

---

## Archetype B — Small Expressive Companion (6–8 Bones: Rabbit, Owl, Cat, Robot, Bird)
Always give a secondary character its **own rig in `rigs[]`** for mutual acting:
```text
root (plump sculpted body, z: 0)
 ├─ tail (z: -1)
 ├─ limb.near (front paw/wing, z: 1, shadow: shadowInner)
 └─ head (z: 2, shadow: shadowInner)
     ├─ ear.far / wing.far (z: 1)
     └─ ear.near / wing.near (z: 3)
```

---

## Archetype C — Wave & Swimming/Flying Creature (9–13 Bones: Whale, Koi, Dragon, Jellyfish, Crane)
```text
root (core, z: 0)
 ├─ head (z: 2) → jaw (z: 1) + crest/spout (z: 1)
 ├─ fin.far / wing.far (z: -2) & fin.near / wing.near (z: 3)
 └─ mid → tail1 → tail2 → fluke.l / fluke.r (progressive phase lag, shadow: none)
```

---

## Archetype D — Biped Character Rig (15–24 Bones, `paper-studio-v2` M1b Ready)
`pelvis` → `spine` (waist bend) → `torso` → `head` (`hair.back`, `hair.bangs`), symmetric `upper-arm/forearm/hand.{l,r}` (4 hand variants sharing a common `grip` anchor), `thigh/shin/foot/toe.{l,r}`, plus `sides: ["l", "r"]`, `ik`, `contacts`, `ground`.

---

## Archetype E — Universal Scenic Modules (Purely Data-Driven)
- **Proscenium Shadow-Box (`scene.frame`):** 3–4 nested rounded frames in any theme palette.
- **Procedural Motif Clusters (`scene.clusters[]`):** Two-tone creased foliage, coral, blossoms, snowflakes, stars, or wildflowers scattered in `arc`, `line`, or `scatter` zones across `back` and `front` lanes.
- **Celestial Rig (`scene.celestial`):** Concentric rings + crescent moon, full moon, sun, or planet core + orbiting motifs.
- **Perspective Swarms (`scene.swarms[]`):** 2-bone flying/swimming flocks scaled from distant (`0.45`) to foreground (`1.0`) with staggered `phase` and `wagFreq`.
