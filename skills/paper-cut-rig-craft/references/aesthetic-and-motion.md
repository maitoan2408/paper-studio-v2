# Universal Handcrafted Shadow-Box Aesthetic & Motion Principles (v2.0)

These principles apply to **ANY theme** (forest, ocean, snow village, cherry blossoms, desert, fairy tale, urban workshop, space) — never hardcode one palette or biome.

## 1. The Light-Box Diorama Formula (Why Art Feels Warm & Alive)
A flat vector drawing feels cold and dry. A real paper-cut shadow-box feels magical because of **five universal craft rules**:

1. **Backlit Focal Glow (`scene.lighting.focalGlow`):**
   - Place the brightest luminous gradient **directly behind the hero or the meeting point between two characters** (like an LED light box glowing through paper).
   - Never make the sky uniformly flat; transition from rich deep top → luminous focal horizon → deep layered foreground silhouettes.
2. **Proscenium Shadow-Box Framing (`scene.frame`):**
   - Default to `style: "proscenium"` with 3–4 nested rounded theater layers colored from your scene's deepest shadow hue to its warm midtone. It creates deep physical box recession without cluttering the scene with giant white clouds.
3. **Leading Lines & Layered Perspective (7–8 Depth Planes):**
   - Avoid a flat horizontal ground strip. Use an **S-curved path, winding river, wave trough, ridge line, or cobblestone road** leading the viewer's eye from the far background straight into the focal hero stage.
   - Frame the bottom-left and bottom-right corners with crisp foreground silhouette clusters (`scene.clusters[]` with `lane: "front"`) so the viewer peers *through* the foreground into the world.
4. **Two-Tone Creased Paper Craft (`scene.clusters[]` & Cardstock Texture):**
   - **BANNED:** Geometric clipart blobs (concentric circles for tree canopies, square-chopped straight rectangles for tree branches, flat untextured fills).
   - **REQUIRED:** Build organic canopies, coral reefs, flower beds, clouds, or snowdrifts using `scene.clusters[]` with a **two-tone folded motif SVG (`FILL_A` / `FILL_B`)** so every leaf, petal, coral fan, or crystal reads like creased, hand-cut cardstock!
   - Layer trunks, rocks, walls, or waves with **2–3 stacked paper strips** in stepping tones to simulate cut-paper woodgrain, geological strata, or ocean foam.
5. **Restrained 4-Hue Color Discipline:**
   - Pick **4 cohesive color families** per scene: (1) Deep Frame/Shadow hue, (2) Rich Midground hue, (3) Warm/Luminous Backlight hue, (4) High-contrast Light Paper hue for the hero's key accents (ensuring crisp figure-ground separation).

## 2. Expressive Cutout Puppet Craft (Not Bolted Plastic Toys)
- **Unified Silhouette Shadow:** Use `groupShadow: "shadowDeep"` on each rig and keep internal bones `"shadow": "none"` (or `"shadowInner"` only on near limbs/head) so bodies read cohesively.
- **Optional Handcrafted Paper Brad Pins (`bone.brad`):** On articulated cutout puppets (quadrupeds, bipeds, mechanical/storybook toys), adding a subtle circular paper fastener pin (`brad: { r, fill, stroke }`) at shoulder/hip pivots turns mechanical joints into deliberate, charming papercraft detail!
- **Sculpted Paper Edges:** Give organic shapes layered silhouettes — fur tufts, scalloped tail tips, pleated robes, curved snouts, small gentle eyes (avoid oversized cartoon eyes unless explicitly requested), and soft rosy accents.
- **Auto Soft Ground Contact Shadows:** Always set `groundY`, `shadowRx`, `shadowRy` on grounded rigs so shadows dynamically track movement and soften during jumps.

## 3. Living 3-Layer Motion & Acting Beats
Always run **3 simultaneous layers** (all 100% deterministic via integer `seed`, zero `Math.random()`):
- **Primary Acting:** Give every interacting character its own rig in `rigs[]` and choreograph a clear emotional arc (Approach → Anticipation/Pause → Mutual Greeting with `vfx.warmGlow` / `emote` → Joyful Reaction with `ease: "back"` → Lingering Quiet Beat).
- **Secondary Overlap:** Use **2-segment limbs** (upper + lower leg/arm) so stepping bends gracefully; propagate progressive phase lag down tails, hair, capes, ribbons, or fins (`phase: 0 → -0.6 → -1.2`).
- **Ambient World:** Pair `falling` particles (leaves, petals, snow, embers, or rising underwater bubbles via negative `speedY`) with `fireflies` or `meteor`, subtle breathing celestial rings (crescent or full moon/sun), and perspective `swarms` (varied sizes & wing/tail rhythms).
