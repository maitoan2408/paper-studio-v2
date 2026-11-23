# Blueprint JSON Schema v1.1 (`blueprint.json`)

Write one clean JSON file and compile it with `scripts/compile_rig_studio.mjs`.

## Key v1.1 Additions (Multi-Rig, Atmosphere, Ground Shadows, Falling Leaves)
- **Multi-character `rigs: [ ... ]`:** Supports 1, 2, or more independent articulated rigs in the same scene (backward-compatible with single `rig`).
- **Cohesive shadows:** Set `groupShadow: "shadowDeep"` on each rig, and leave bone `shadow: "none"` (or `"shadowInner"` on near limbs/head) so segments blend smoothly without plastic black seams.
- **Auto soft ground shadow:** Set `groundY`, `shadowRx`, `shadowRy` on each rig.
- **Cinematic lighting (`scene.atmosphere`):** `lightShaftsSvg` (diagonal moonbeams), `midMistSvg` (horizon haze between hills and characters), `foregroundGlowSvg` (warm vignette / lantern bounce).
- **Falling leaves/petals emitter (`type: "falling"`):** Wind drift + sinusoidal sway + 3D tumble across back & front lanes.
- **Emotional cues:** Inside `phases[].rigs[rigId]`, set `emote: "warm"` or `"heart"`, `ease: "back"` for joyful hops, and `phase.vfx.warmGlow: { x, y, intensity }`.

## Compact Schema Example
```json
{
  "meta": {
    "packId": "fox-rabbit-autumn-v1",
    "version": "1.1.0",
    "title": "Shadow-Box: Cáo Nhỏ & Thỏ Trắng Mùa Thu",
    "subtitle": "2 Rig độc lập (18 xương) · Lá phong rơi · Ánh sáng hoàng hôn",
    "icon": "🦊",
    "seed": 7713
  },
  "scene": {
    "bgColor": "#181024",
    "defsSvg": "<linearGradient ...>...</linearGradient>",
    "skySvg": "<rect x=\"-40\" y=\"-40\" width=\"1040\" height=\"800\" fill=\"url(#skyGrad)\"/>",
    "stars": { "count": 90, "maxY": 380, "color": "#fff5dc" },
    "atmosphere": {
      "lightShaftsSvg": "<polygon points=\"240,120 430,120 720,620 420,620\" fill=\"url(#moonBeam)\"/>",
      "midMistSvg": "<rect x=\"-40\" y=\"340\" width=\"1040\" height=\"210\" fill=\"url(#horizonMist)\"/>",
      "foregroundGlowSvg": "<rect x=\"0\" y=\"0\" width=\"960\" height=\"720\" fill=\"url(#vignette)\" pointer-events=\"none\"/>"
    },
    "emitters": [
      { "type": "fireflies", "seed": 901, "count": 20, "xMin": 120, "xMax": 840, "yMin": 260, "yMax": 560, "color": "#ffe680" },
      {
        "type": "falling", "seed": 404, "count": 24, "speedY": 30, "windX": -28, "swayAmp": 26, "scale": 1.0,
        "colors": ["#f26d38", "#f7b249", "#d9412e", "#ffd166"],
        "shapesSvg": ["<path d=\"M0 -9 L2 -3 L8 -4 L4 1 L7 6 L1 4 L0 10 L-1 4 L-7 6 L-4 1 L-8 -4 L-2 -3 Z\" fill=\"CURRENT\"/>"]
      }
    ],
    "celestial": { "x": 300, "y": 190, "rings": [], "coreSvg": "...", "orbitSvg": "...", "orbitSpeed": 10 },
    "backLayers": [ { "parallax": 8, "filter": "shadowMed", "svg": "..." } ],
    "frontLayers": [ { "parallax": 20, "filter": "shadowDeep", "svg": "..." } ],
    "swarms": [ { "lane": "back", "x0": 140, "y0": 180, "speed": 58, "dir": 1, "scale": 0.85, "tailPivotX": 0, "tailPivotY": -2, "wagFreq": 10, "wagAmp": 32, "bodySvg": "...", "tailSvg": "..." } ],
    "frameSvg": "...",
    "cornersSvg": "...",
    "overlayProps": [ { "x": 800, "y": 150, "scale": 1, "parallax": 22, "freqX": 0.9, "ampX": 6, "freqY": 1.1, "ampY": 5, "tiltAmp": 3.5, "svg": "..." } ]
  },
  "parts": [
    { "id": "fox-body", "category": "body", "size": [140, 84], "pivot": [70, 42], "anchors": { "neck": [108, 32] }, "svg": "..." }
  ],
  "rigs": [
    {
      "id": "fox",
      "label": "🦊 Cáo nhỏ",
      "characterId": "fox-autumn",
      "rootPos": { "x": 380, "y": 495 },
      "groundY": 556, "shadowRx": 64, "shadowRy": 11,
      "groupShadow": "shadowDeep", "z": 2, "parallax": 15,
      "bones": [
        { "id": "root", "label": "Thân cáo", "parent": null, "attach": null, "part": "fox-body", "limits": { "min": -35, "max": 35 }, "rest": 0, "z": 0, "shadow": "none" }
      ]
    },
    {
      "id": "rabbit",
      "label": "🐰 Thỏ trắng",
      "characterId": "rabbit-autumn",
      "rootPos": { "x": 630, "y": 524 },
      "groundY": 556, "shadowRx": 34, "shadowRy": 8,
      "groupShadow": "shadowDeep", "z": 3, "parallax": 15,
      "bones": [
        { "id": "root", "label": "Thân thỏ", "parent": null, "attach": null, "part": "rabbit-body", "limits": { "min": -30, "max": 30 }, "rest": 0, "z": 0, "shadow": "none" }
      ]
    }
  ],
  "motions": [
    {
      "id": "story",
      "name": "🍂 Gặp gỡ mùa thu",
      "type": "cycle",
      "period": 12,
      "phases": [
        {
          "from": 0, "to": 0.5, "label": "🦊 Pha 1: Cáo bước nhẹ tới gặp Thỏ",
          "vfx": { "warmGlow": { "x": 540, "y": 500, "intensity": 0.7 } },
          "rigs": {
            "fox": { "rootX": [240, 455], "rootY": [495, 495], "bones": { "root": [0, 4] }, "emote": "warm" },
            "rabbit": { "rootX": [630, 630], "rootY": [524, 524], "ease": "back", "arcY": 24, "bones": { "root": [0, -10] } }
          }
        }
      ]
    }
  ]
}
```

## Coordinate & Security Rules
- `parts[].svg` coordinates are local to `(0, 0)` (the bone's pivot).
- `parts[].anchors` are in viewBox pixel space matching `parts[].pivot`.
- All `url(#...)` gradients used inside `parts[].svg` MUST be declared in `scene.defsSvg`.
- Strictly obey `paper-studio-v2` SVG allowlist (no `<script>`, `<style>`, `<image>`, `<foreignObject>`, `on*`, or external URLs).
