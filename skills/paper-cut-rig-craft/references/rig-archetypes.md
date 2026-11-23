# 2D Cutout Rig Archetypes & Organic Joint Rules (v1.1)

## Golden Joint Cutting Rules (Seamless & Expressive)
1. **Concentric Circular Joint Caps:** Every limb/tail/neck segment rotating around `(0, 0)` MUST terminate in a circular arc centered at `(0, 0)` matching its parent socket radius — zero gaps even at extreme bends.
2. **Seamless Fur/Paper Overlap (No Plastic Seams):**
   - Rely on the character's unified `groupShadow: "shadowDeep"`.
   - Set `"shadow": "none"` on neck, spine, and tail segments so colors blend organically across joints; use `"shadow": "shadowInner"` only on near-side overlapping limbs or ears.
3. **Line of Action & Appeal:**
   - Avoid stiff horizontal sausages. Sculpt bodies with a subtle chest fullness, tapered waist/haunch, warm cream belly/chest ruff, soft cheek fur tufts, curved smiling/gentle eyes, and tiny rosy cheek blush.
4. **Non-Degenerate Bone Length:** Every child `attach` anchor MUST satisfy `hypot(attach.x - pivot.x, attach.y - pivot.y) > 0`.

---

## Archetype A — Expressive Quadruped Rig (Fox, Deer, Cat, Dog — 11–13 Bones)
```text
root (supple body core + cream chest ruff, z: 0, shadow: none)
 ├─ neck / head (curved snout, cheek fur tuft, warm smiling eye, z: 2, shadow: shadowInner)
 │   ├─ ear.far (z: 1, darker tint)
 │   └─ ear.near (z: 3, soft cream inner ear)
 ├─ fleg.far / bleg.far (z: -2, darker/cooler tint, staggered rest angles!)
 ├─ fleg.near / bleg.near (z: 1, shadow: shadowInner)
 └─ tail1 (z: -1, shadow: none)
     └─ tail2 (z: -1, shadow: none)
         └─ tail3 (fluffy cream tip, z: -1, shadow: none)
```
**Staggered Stance Rule:** Always rest `fleg.near` vs `fleg.far` and `bleg.near` vs `bleg.far` at distinct angles (e.g. `fleg.near: 10°, fleg.far: -14°, bleg.near: -12°, bleg.far: 15°`) so all 4 paws clearly show!

---

## Archetype B — Small Expressive Companion Rig (Rabbit, Squirrel, Owl — 5–7 Bones)
Always give a secondary story character its **own rig in `rigs[]`** instead of drawing it static in the background!
```text
root (plump round paper body + soft tail puff, z: 0, shadow: none)
 ├─ tail (fluffy cotton puff, z: -1, shadow: none)
 ├─ paw (small front paws tucked/reaching, z: 1, shadow: shadowInner)
 └─ head (round warm face, pink blush, happy eye, z: 2, shadow: shadowInner)
     ├─ ear.far (long expressive ear, z: 1, limits: -35..35)
     └─ ear.near (long expressive ear w/ soft pink inner, z: 3, limits: -35..35)
```

---

## Archetype C — Wave Creature Rig (Whale, Dragon, Koi — 9–13 Bones)
```text
root (body core, z: 0)
 ├─ head (z: 2) → jaw (z: 1) + spout/crest (z: 1)
 ├─ fin.far (z: -2) & fin.near (z: 3, shadow: shadowInner)
 └─ mid → tail1 → tail2 → fluke.l / fluke.r (all shadow: none for seamless wave!)
```

---

## Archetype D — Biped Character Rig (15–24 Bones, M1b Ready)
`pelvis` → `spine` (M1b bend) → `torso` → `head` (`hair.back`, `hair.bangs`), symmetric `upper-arm/forearm/hand.{l,r}` (4 hand variants sharing a common `grip` anchor), `thigh/shin/foot/toe.{l,r}`, plus `ik`, `contacts`, `ground`.

---

## Archetype E — Celestial Props & 2-Bone Mini-Swarms
- **Concentric Moon/Sun (`scene.celestial`):** 5–6 concentric shadow-box rings + warm glowing core + slowly orbiting stars.
- **Mini-Swarms (`scene.swarms`):** 2-bone birds (`bodySvg` + flapping `tailSvg` wing) or swimming/jumping fish across `back` and `front` lanes.
