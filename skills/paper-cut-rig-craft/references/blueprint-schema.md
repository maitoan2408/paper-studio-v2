# Blueprint JSON Schema v2.0 (`blueprint.json`)

100% theme-agnostic declarative contract compiled by `scripts/compile_rig_studio.mjs`.

## Key v2.0 Universal Fields
- **`scene.width` / `scene.height`:** Default `960 × 540` (16:9 cinema widescreen); also supports `960 × 720` (4:3).
- **`scene.frame`:** Universal rounded shadow-box proscenium frame:
  ```json
  "frame": { "style": "proscenium", "radius": 58, "inset": 10, "step": 12, "layers": ["#0d334a", "#3d2247", "#b8502c"] }
  ```
- **`scene.lighting`:** Data-driven light-box focal glow, horizon mist, and cinema vignette:
  ```json
  "lighting": {
    "focalGlow": { "x": 490, "y": 310, "r": 290, "color": "#fff1a8", "midColor": "#f59d45", "opacity": 0.72 },
    "mist": { "y": 290, "height": 160, "color": "#f5b076", "opacity": 0.22 },
    "vignetteOpacity": 0.34
  }
  ```
- **`scene.clusters[]`:** Universal two-tone folded motif generator (leaves, blossoms, corals, snowflakes, grass tufts, clouds — **zero hardcoded biome**):
  ```json
  {
    "lane": "back", "mode": "arc", "cx": 760, "cy": 130, "rx": 220, "ry": 125, "a0": -3.14, "a1": 0.3,
    "count": 42, "seed": 3011, "scaleMin": 0.75, "scaleMax": 1.45, "rotMin": -140, "rotMax": 140,
    "parallax": 14, "sway": 3.5, "filter": "shadowSoft",
    "palette": [["#e84c32","#b83220"], ["#f58238","#c95c22"], ["#ffd059","#dba22c"]],
    "shapeSvg": "<path d=\"M0 -13 L3 -5 L11 -7 L5 0 L9 7 L2 5 L0 13 Z\" fill=\"FILL_A\"/><path d=\"M0 -13 L-3 -5 L-11 -7 L-5 0 L-9 7 L-2 5 L0 13 Z\" fill=\"FILL_B\"/>"
  }
  ```
  Modes supported: `"arc"` (`cx, cy, rx, ry, a0, a1`), `"line"` (`x0, y0, x1, y1, spread`), `"scatter"` (`cx, cy, rx, ry`).
- **`scene.emitters[]`:**
  - `type: "falling"` (leaves, petals, snow, embers, OR rising underwater bubbles when `speedY < 0`!), supports two-tone `palette: [[cA, cB], ...]` with `FILL_A`/`FILL_B` placeholders.
  - `type: "fireflies"` (seeded drifting luminous motes / plankton / embers).
  - `type: "meteor"` (seeded shooting stars / streaks).
- **`rigs[]`:** Multiple independent articulated rigs with:
  - `groundY`, `shadowRx`, `shadowRy`, `shadowOffsetX` (auto soft dynamic ground shadow).
  - `groupShadow: "shadowDeep"` (cohesive silhouette shadow).
  - Per-bone optional `"brad": { "r": 4.0, "fill": "#f0c896", "stroke": "#6e391c" }` for handcrafted paper-fastener joint pins!
  - Synchronized multi-rig story phases in `motions[].phases[].rigs[rigId]` with `rootX`, `rootY`, `arcY`, `ease` (`"smooth"` or `"back"`), `facing`, `emote` (`"warm"` | `"heart"`), `bones`, `waves`, and `phase.vfx` (`warmGlow`, `splashAtY`, `bubbles`).

## Coordinate & Security Contract (`paper-studio-v2`)
- `parts[].svg` coordinates are local to `(0, 0)` (the bone's pivot).
- `parts[].anchors` are in viewBox pixel coordinates matching `parts[].pivot`.
- Every `url(#...)` gradient used in `parts[].svg` MUST be declared in `scene.defsSvg` so exported standalone `.svg` files render identically.
- Strict SVG allowlist: no `<script>`, `<style>`, `<image>`, `<foreignObject>`, `on*`, or external URLs.
