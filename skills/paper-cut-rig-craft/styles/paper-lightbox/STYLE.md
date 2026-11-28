# Paper-Cut Lightbox (`paper-lightbox`) — Style Grammar

> Adapted from the cut-paper shadow-box lamp grammar (纸雕灯, MIT `lemo-opuscar/paper-lantern`): 6–9 parallel sheets of matte cut card stacked in a deep box, lit from behind by a warm lamp shining through fibrous pulp, with carved glowing windows and deep value ladders.

## 1. Essence — and What It Is NOT
- **IS:** One physical shadow-box cavity holding flat cut cardstock planes parallel to the lens. Depth comes from a **strict value ladder** (back layers luminous & translucent → front layers dark & opaque), **warm cloudy `#backlitPulp` translucency**, glowing cut-out windows/moons/lanterns (`#softGlow`), warm top-edge rims, and recessed inter-layer shadows (`#shadowDeep`).
- **IS NOT:** Bright flat daylight cartooning, thick white sticker outlines (`paper-popup`), or multi-hue rainbow clutter.

## 2. Value Ladder & Colour Logic (Mandatory)
- **Back = bright & translucent; Front = dark & opaque.** Never put a pale sheet in front of a dark background — it flattens the box instantly.
- **One temperature family per scene:** e.g. Night Village (`#0a1330` sky → `#6a86c2` far → `#3f5a92` mid → `#1a2b4c` hero-stage → `#0d152a` front) or Desert Dusk (`#f0c890` → `#c07850` → `#6a3020` → `#1e0e08`).
- **Light is warm amber-to-gold (`#ffe599` / `#ffb862`)** — the only saturated glow besides **at most one story accent** (e.g. a crimson scarf or signal lantern).

## 3. Motion Cadence & Life
- Characters move with deliberate articulated restraint (`cadence.charFps: 12` or `24`), while light glows, snow/embers, and handheld `cameraDrift` glide smoothly at 60 fps.
- Light cues carry the drama: focal halo pulse + window glow + subtle `tremor`.

## 4. Native Moves
- **Lamp Turn-On:** warm focal backlight swelling behind layered mountain/eave silhouettes.
- **Two Windows, One Light:** moon or lantern illuminating both hero and architectural cutouts.
- **Depth as Distance:** strong multi-plane parallax across 6+ stacked sheets.

## 5. Pitfalls
- Pale front layer destroys shadow-box depth → keep `frontLayers` and `frame` darkest.
- Over-bright glow over fine foreground text/faces washes contrast out → frame dark silhouettes against the warm light core.
