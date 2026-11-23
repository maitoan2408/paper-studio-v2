# Blueprint JSON Schema (`blueprint.json`)

Write one self-contained JSON file matching this structure, then compile it with `scripts/compile_rig_studio.mjs`.

## Top-Level Structure
```json
{
  "meta": {
    "packId": "my-scene-v1",
    "version": "0.1.0",
    "title": "Shadow-Box Rig: Title",
    "subtitle": "Short technical subtitle (bone count, features)",
    "icon": "🦊",
    "seed": 4219
  },
  "scene": {
    "bgColor": "#0b1326",
    "waterlineY": 516,
    "defsSvg": "<linearGradient id=\"skyGrad\" ...>...</linearGradient>",
    "skySvg": "<rect x=\"-40\" y=\"-40\" width=\"1040\" height=\"800\" fill=\"url(#skyGrad)\"/>",
    "stars": { "count": 120, "maxY": 440, "color": "#ffffff" },
    "emitters": [
      { "type": "meteor", "period": 5.5, "offset": 0.8, "dur": 1.0, "x0": 780, "y0": 90, "dx": -300, "dy": 145, "len": 115, "gradId": "meteorTrail", "color": "#fff7c2" },
      { "type": "fireflies", "seed": 901, "count": 18, "xMin": 100, "xMax": 860, "yMin": 260, "yMax": 560, "color": "#ffe985" }
    ],
    "celestial": {
      "x": 360, "y": 210,
      "rings": [{ "r": 104, "fill": "#173647" }, { "r": 84, "fill": "#2b5968" }],
      "coreSvg": "<circle cx=\"0\" cy=\"0\" r=\"34\" fill=\"url(#moonCore)\"/>",
      "orbitSvg": "<path transform=\"translate(66,-30)\" d=\"M0 -6 L2 -2 L6 0 L2 2 L0 6 L-2 2 L-6 0 L-2 -2 Z\" fill=\"#ffe156\"/>",
      "orbitSpeed": 12
    },
    "backLayers": [
      { "parallax": 11, "swayAmp": 14, "swayFreq": 1.4, "phase": 0, "filter": "shadowMed", "svg": "<path .../>" }
    ],
    "frontLayers": [
      { "parallax": 18, "swayAmp": 18, "swayFreq": 1.9, "phase": 2.2, "filter": "shadowDeep", "svg": "<path .../>" }
    ],
    "swarms": [
      {
        "lane": "front", "x0": 240, "y0": 570, "speed": 62, "dir": 1, "scale": 1.0,
        "phase": 0.4, "amp": 14, "jump": true, "jumpPeriod": 5.5, "jumpOffset": 1.0, "jumpHeight": 82,
        "tailPivotX": -14, "tailPivotY": 0, "wagFreq": 14, "wagAmp": 24,
        "bodySvg": "<path .../>", "tailSvg": "<path .../>"
      }
    ],
    "frameSvg": "<path filter=\"url(#shadowDeep)\" fill-rule=\"evenodd\" d=\"M-30 -30 H990 V750 H-30 Z M60 110 ... Z\"/>",
    "cornersSvg": "<g filter=\"url(#shadowSoft)\"><path .../></g>",
    "overlayProps": [
      { "x": 810, "y": 155, "scale": 0.8, "parallax": 22, "freqX": 0.8, "ampX": 10, "freqY": 1.1, "ampY": 10, "tiltAmp": 3.5, "svg": "<g>...</g>" }
    ]
  },
  "parts": [
    {
      "id": "creature-root",
      "category": "body",
      "size": [120, 96],
      "pivot": [60, 48],
      "anchors": { "head": [26, 40], "mid": [94, 52] },
      "svg": "<path d=\"...\" fill=\"url(#bodyGrad)\"/>"
    }
  ],
  "rig": {
    "id": "my-rig-v1",
    "characterId": "hero",
    "rootPos": { "x": 500, "y": 420 },
    "parallax": 15,
    "bones": [
      { "id": "root", "label": "Thân chính", "parent": null, "attach": null, "part": "creature-root", "limits": { "min": -85, "max": 85 }, "rest": 0, "z": 0, "maxDegPerFrame": 12, "shadow": "shadowDeep" },
      { "id": "head", "label": "Đầu", "parent": "root", "attach": "head", "part": "creature-head", "limits": { "min": -30, "max": 30 }, "rest": -5, "z": 2, "maxDegPerFrame": 10, "shadow": "shadowMed" }
    ],
    "ik": {}
  },
  "motions": [
    {
      "id": "main-cycle",
      "name": "🌊 Chu trình chính",
      "type": "cycle",
      "period": 10,
      "phases": [
        {
          "from": 0, "to": 0.5, "label": "Pha 1/2: ...",
          "rootX": [600, 440], "rootY": [620, 380], "arcY": 35,
          "bones": { "root": [45, -25], "head": [8, -10] },
          "waves": { "mid": { "freq": 5, "amp": 16, "phase": -0.6 } },
          "vfx": { "splashAtY": 516, "bubbles": 0 }
        },
        {
          "from": 0.5, "to": 1.0, "label": "Pha 2/2: ...",
          "rootX": [440, 600], "rootY": [380, 620],
          "bones": { "root": [-25, 45], "head": [-10, 8] },
          "vfx": { "splashAtY": 516, "bubbles": 0.8 }
        }
      ]
    },
    {
      "id": "gentle",
      "name": "🌙 Lướt êm",
      "type": "harmonic",
      "label": "Chuyển động êm dịu",
      "rootWaveX": { "freq": 0.5, "amp": 50 },
      "rootWaveY": { "freq": 1.1, "amp": 18 },
      "base": { "root": -10 },
      "waves": { "head": { "freq": 1.6, "amp": 6, "phase": 0 } }
    }
  ]
}
```

## Coordinate Convention (Critical!)
- Inside `parts[].svg`, coordinates are **local to the bone's pivot `(0, 0)`**!
- `parts[].size` is `[width, height]` of the exported standalone `.svg` file; `parts[].pivot` is `[ox, oy]` inside that viewBox.
- `parts[].anchors` are in **viewBox pixel coordinates** (same coordinate space as `pivot`), so child offset is automatically `(anchor.x - pivot.x, anchor.y - pivot.y)`.
- All gradients referenced in `parts[].svg` (like `url(#bodyGrad)`) MUST be declared in `scene.defsSvg` so both the HTML studio and every exported standalone `.svg` file render identically.

## Allowed SVG Tags (`paper-studio-v2` Security Contract)
Only use standard vector & filter primitives: `svg`, `g`, `defs`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `pattern`, `use`, `symbol`, `filter`, `feBlend`, `feColorMatrix`, `feComposite`, `feDropShadow`, `feFlood`, `feGaussianBlur`, `feMerge`, `feMergeNode`, `feOffset`, `feTurbulence`, `feDisplacementMap`, `feComponentTransfer`, `feFuncA/R/G/B`, `feMorphology`.
**Never** include `<script>`, `<style>`, `<image>`, `<foreignObject>`, `on*` handlers, or external `http(s)://` URLs inside SVGs.
