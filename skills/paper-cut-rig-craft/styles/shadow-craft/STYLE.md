# Shadow Craft & Openwork Cutout (`shadow-craft`) — Style Grammar

> Adapted from carved openwork paper-cut & shadow-puppet theatre (MIT `lemo-opuscar/papercut-red` & `shadow-puppet`): jewel-toned carved silhouettes with glowing `evenodd` interior cutouts, riveted jointed articulation, 12 fps stepped stop-motion rhythm, hand-tremor life, and trailing spring strands.

## 1. Essence — and What It Is NOT
- **IS:** Tactile carved parchment/hide/crimson paper laid over a warm glowing screen or pale handmade paper ground. Detail comes from **what is carved away (`openworkCutout` with `fill-rule="evenodd"`)**, translucent `#backlitPulp` dyeing, riveted pivots, **stepped 12 fps** character poses on smooth 60 fps weather/flames, continuous subtle **`tremor`**, and dramatic flowing **`strands[]`** (plumes, ribbons, tassels).
- **IS NOT:** Soft pastel gradient painting or white-bordered pop-up stickers.

## 2. Value Ladder & Colour Logic
- High-contrast theatrical staging: warm cream parchment or lamp-lit amber screen (`#f5ebd6` / `#ffd98a`) behind deep jewel-dyed hero figures (vermilion `#b8211a`, jade `#246b48`, indigo `#224878`, ink `#1a100a`).
- Avoid red-on-red or dark-on-dark mud: separate figure from background with a clear luminosity gap and interior carved holes.

## 3. Motion Cadence & Life
- **12 fps stepped characters (`cadence.charFps: 12`)** with crisp theatrical poses and held beats, while flames, snow, embers, and lamps glide smoothly at 60 fps.
- Mandatory subtle **`tremor`** (`ampX: 0.9, ampY: 0.8, ampDeg: 0.5`) so held poses feel alive in a puppeteer's hand, plus flowing **`strands[]`** tassels/ribbons.

## 4. Native Moves
- **Holes Are Light:** carved interior motifs (`openworkCutout`) glowing against the warm screen.
- **Operatic Freeze Beat:** crisp pose hit followed by quivering tassels/strands during hold.

## 5. Pitfalls
- Flat solid blobs without interior carving lose the craft identity → carve collars, cuffs, patterns, and medallions with `openworkCutout`.
- In profile, keep raised near hands clear of the face silhouette.
