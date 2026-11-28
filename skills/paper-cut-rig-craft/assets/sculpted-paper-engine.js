/**
 * Paper Studio v2 — Cinema-Grade 3D Sculpted & Backlit Paper-Cut Engine (v5.0)
 *
 * Pure deterministic (t -> SceneFrame) Three.js WebGL2 engine supporting:
 * 1. Dual-Path 3D Geometry:
 *    - Multi-Layer Sculpted 3D Relief (folded/pleated/tiered-slab mountains, multi-ply shadow-box frames,
 *      curved pagoda eaves with rafters, arched bridges, cupped 3D lotus/peony clusters, sculpted pines).
 *    - Die-Cut Printed Cardstock Slabs (marching-squares alpha contour -> extruded 3D beveled cardstock +
 *      4x supersampled crisp SVG front cap preserving strokes, gradients, patterns & live data-eye="1" blink,
 *      plus 3D extruded seamless hoses[] and flowing strands[] with ZERO Z-fighting and positive determinants).
 * 2. Physical Cut-Paper Optics:
 *    - Deterministic 512x512 300gsm cold-press cotton normalMap + roughnessMap.
 *    - Thin-paper Backlit Subsurface Scattering shader (onBeforeCompile) + cream paper-core cut bevels.
 *    - 4x MSAA HalfFloat EffectComposer + deterministic seeded GTAOPass + selective Bloom + SMAAPass + ACES.
 * 3. Single-Context Multi-Shot Sheet Renderer (?sheet=motion6, ?sheet=modelsheet&rig=<id>) & Bit-Exact Seek.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  Shape,
  ShapeUtils,
  SphereGeometry,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  EffectComposer,
  RenderPass,
  SMAAPass,
  UnrealBloomPass,
  OutputPass,
  createDeterministicGTAOPass,
} from 'three-sculpted';

// ============================================================================
// 1. DETERMINISTIC MATH & RNG (Park-Miller LCG — zero non-deterministic RNG)
// ============================================================================
export function makeRng(seed) {
  let s = ((seed >>> 0) % 2147483647) || 4219;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const easeOutBack = (t) => {
  const c = clamp(t, 0, 1), c1 = 1.35, c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
};
function wrapDeg180(d) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

// ============================================================================
// 2. 300GSM COLD-PRESS COTTON NORMAL + ROUGHNESS MAPS & BACKLIT PAPER SHADER
// ============================================================================
export function createCottonPaperPbrMaps(seed = 20261127, size = 512) {
  const rng = makeRng(seed);
  const hRaw = new Float32Array(size * size);
  const fine = new Float32Array(size * size);

  for (let i = 0; i < hRaw.length; i++) {
    hRaw[i] = (rng() - 0.5);
    fine[i] = (rng() - 0.5) * 0.45;
  }

  // Two-pass separable box blur on hRaw for soft cold-press cotton dimples
  const tmp = new Float32Array(size * size);
  const blurPass = (src, dst, radius) => {
    const norm = 1 / (radius * 2 + 1);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += src[y * size + ((x + k + size) % size)];
         tmp[y * size + x] = sum * norm;
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += tmp[((y + k + size) % size) * size + x];
        dst[y * size + x] = sum * norm;
      }
    }
  };

  const height = new Float32Array(size * size);
  blurPass(hRaw, height, 2);
  for (let i = 0; i < height.length; i++) {
    height[i] = height[i] * 1.45 + fine[i] * 0.32;
  }

  const normBytes = new Uint8Array(size * size * 4);
  const roughBytes = new Uint8Array(size * size * 4);
  const strength = 2.15;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
      const invLen = 1.0 / Math.hypot(dx, dy, 1.0);
      const nx = -dx * invLen;
      const ny = -dy * invLen;
      const nz = invLen;

      const idx = (y * size + x) * 4;
      normBytes[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normBytes[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normBytes[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normBytes[idx + 3] = 255;

      // Valleys slightly rougher (0.94), fiber crests slightly silkier (0.83)
      const rVal = clamp(Math.round((0.89 - height[y * size + x] * 0.08) * 255), 195, 248);
      roughBytes[idx] = rVal;
      roughBytes[idx + 1] = rVal;
      roughBytes[idx + 2] = rVal;
      roughBytes[idx + 3] = 255;
    }
  }

  const normalMap = new DataTexture(normBytes, size, size, RGBAFormat, UnsignedByteType);
  normalMap.wrapS = RepeatWrapping;
  normalMap.wrapT = RepeatWrapping;
  normalMap.repeat.set(3.2, 3.2);
  normalMap.minFilter = LinearMipmapLinearFilter;
  normalMap.magFilter = LinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.needsUpdate = true;

  const roughnessMap = new DataTexture(roughBytes, size, size, RGBAFormat, UnsignedByteType);
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.repeat.set(3.2, 3.2);
  roughnessMap.minFilter = LinearMipmapLinearFilter;
  roughnessMap.magFilter = LinearFilter;
  roughnessMap.generateMipmaps = true;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

function attachBacklitPaperShader(material, backlightUniforms, translucency = 0.28) {
  if (translucency <= 0.001 || !backlightUniforms) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBacklightPos = backlightUniforms.uBacklightPos;
    shader.uniforms.uBacklightColor = backlightUniforms.uBacklightColor;
    shader.uniforms.uBacklightRange = backlightUniforms.uBacklightRange;
    shader.uniforms.uBacklightGain = backlightUniforms.uBacklightGain;
    shader.uniforms.uPaperTranslucency = { value: translucency };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vPaperWorldPos;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPaperWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPaperWorldPos;
        uniform vec3 uBacklightPos;
        uniform vec3 uBacklightColor;
        uniform float uBacklightRange;
        uniform float uBacklightGain;
        uniform float uPaperTranslucency;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 toBack = uBacklightPos - vPaperWorldPos;
        float backDist = length(toBack);
        vec3 backDir = toBack / max(backDist, 0.0001);
        float backAtten = clamp(1.0 - backDist / max(uBacklightRange, 0.1), 0.0, 1.0);
        backAtten = backAtten * backAtten;
        vec3 viewDirW = normalize(cameraPosition - vPaperWorldPos);
        float forwardScatter = pow(clamp(dot(viewDirW, -backDir), 0.0, 1.0), 2.35);
        float wrapBack = clamp((uBacklightPos.z < vPaperWorldPos.z) ? 1.0 : 0.35, 0.0, 1.0);
        float sss = (forwardScatter * 0.78 + 0.22) * backAtten * wrapBack * uPaperTranslucency * uBacklightGain;
        totalEmissiveRadiance += diffuseColor.rgb * uBacklightColor * sss * 0.65 + uBacklightColor * sss * 0.35;`,
      );
  };
  material.customProgramCacheKey = () => `paper-sss-${translucency.toFixed(2)}`;
}

function computePaperCoreEdgeColor(baseHex, explicitEdgeHex, lift = 0.32) {
  if (explicitEdgeHex && /^#[0-9a-fA-F]{3,8}$/.test(explicitEdgeHex)) {
    return new Color(explicitEdgeHex);
  }
  const c = new Color(baseHex || '#dce6f2');
  return c.lerp(new Color('#fffaf0'), lift);
}

export function createCardstockPair(opts, pbrMaps, backlightUniforms) {
  const {
    color = '#dce6f2',
    map = null,
    edgeColor = null,
    roughness = 0.90,
    edgeRoughness = 0.55,
    normalScale = 0.28,
    emissive = '#000000',
    emissiveIntensity = 0.0,
    edgeEmissive = null,
    edgeEmissiveIntensity = 0.08,
    translucency = 0.24,
    flatShading = false,
  } = opts;

  const capMat = new MeshStandardMaterial({
    color: map ? new Color('#ffffff') : new Color(color),
    map,
    roughness,
    metalness: 0.0,
    normalMap: pbrMaps.normalMap,
    normalScale: new Vector2(normalScale, normalScale),
    roughnessMap: pbrMaps.roughnessMap,
    emissive: new Color(emissive),
    emissiveIntensity,
    flatShading,
  });
  attachBacklitPaperShader(capMat, backlightUniforms, translucency);

  const rimCol = computePaperCoreEdgeColor(color, edgeColor, 0.34);
  const edgeMat = new MeshStandardMaterial({
    color: rimCol,
    roughness: edgeRoughness,
    metalness: 0.0,
    normalMap: pbrMaps.normalMap,
    normalScale: new Vector2(normalScale * 0.45, normalScale * 0.45),
    emissive: new Color(edgeEmissive || rimCol),
    emissiveIntensity: edgeEmissiveIntensity,
    flatShading: false,
  });
  attachBacklitPaperShader(edgeMat, backlightUniforms, translucency * 1.15);

  return [capMat, edgeMat];
}

// ============================================================================
// 3. DETERMINISTIC SVG PATH PARSER (3D Y-UP NATIVE OR 2D SVG Y-DOWN CONVERTED)
// ============================================================================
export function parsePathToShape(pathStr, flipY = false, ox = 0, oy = 0, scale = 1, mirrorX = false) {
  const tokens = pathStr.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const rawPts = [];
  const shape = new Shape();
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, started = false;
  const nextNum = () => parseFloat(tokens[i++]);
  const isCmd = (t) => t && /^[a-zA-Z]$/.test(t);
  const tx = (x) => ((x - ox) * scale) * (mirrorX ? -1 : 1);
  const ty = (y) => (flipY ? -(y - oy) : (y - oy)) * scale;

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'm') {
      const x = nextNum(), y = nextNum();
      cx = cmd === 'm' ? cx + x : x;
      cy = cmd === 'm' ? cy + y : y;
      sx = cx; sy = cy;
      shape.moveTo(tx(cx), ty(cy));
      rawPts.push(new Vector2(tx(cx), ty(cy)));
      started = true;
      cmd = cmd === 'm' ? 'l' : 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      const x = nextNum(), y = nextNum();
      cx = cmd === 'l' ? cx + x : x;
      cy = cmd === 'l' ? cy + y : y;
      shape.lineTo(tx(cx), ty(cy));
      rawPts.push(new Vector2(tx(cx), ty(cy)));
    } else if (cmd === 'H' || cmd === 'h') {
      const x = nextNum();
      cx = cmd === 'h' ? cx + x : x;
      shape.lineTo(tx(cx), ty(cy));
      rawPts.push(new Vector2(tx(cx), ty(cy)));
    } else if (cmd === 'V' || cmd === 'v') {
      const y = nextNum();
      cy = cmd === 'v' ? cy + y : y;
      shape.lineTo(tx(cx), ty(cy));
      rawPts.push(new Vector2(tx(cx), ty(cy)));
    } else if (cmd === 'C' || cmd === 'c') {
      const x1 = nextNum(), y1 = nextNum(), x2 = nextNum(), y2 = nextNum(), x = nextNum(), y = nextNum();
      const ax1 = cmd === 'c' ? cx + x1 : x1, ay1 = cmd === 'c' ? cy + y1 : y1;
      const ax2 = cmd === 'c' ? cx + x2 : x2, ay2 = cmd === 'c' ? cy + y2 : y2;
      const ax = cmd === 'c' ? cx + x : x, ay = cmd === 'c' ? cy + y : y;
      shape.bezierCurveTo(tx(ax1), ty(ay1), tx(ax2), ty(ay2), tx(ax), ty(ay));
      rawPts.push(new Vector2(tx(ax), ty(ay)));
      cx = ax; cy = ay;
    } else if (cmd === 'Q' || cmd === 'q') {
      const x1 = nextNum(), y1 = nextNum(), x = nextNum(), y = nextNum();
      const ax1 = cmd === 'q' ? cx + x1 : x1, ay1 = cmd === 'q' ? cy + y1 : y1;
      const ax = cmd === 'q' ? cx + x : x, ay = cmd === 'q' ? cy + y : y;
      shape.quadraticCurveTo(tx(ax1), ty(ay1), tx(ax), ty(ay));
      rawPts.push(new Vector2(tx(ax), ty(ay)));
      cx = ax; cy = ay;
    } else if (cmd === 'Z' || cmd === 'z') {
      if (started) shape.closePath();
      cx = sx; cy = sy;
    } else {
      i++;
    }
  }

  // Ensure positive CCW outer winding so ExtrudeGeometry normals always point +Z!
  const pts = shape.getPoints(16);
  if (pts.length >= 3 && ShapeUtils.isClockWise(pts)) {
    const rev = new Shape();
    rev.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    for (let k = pts.length - 2; k >= 0; k--) rev.lineTo(pts[k].x, pts[k].y);
    rev.closePath();
    return rev;
  }
  return shape;
}

function buildExtrudedShapeMesh(shapes, opts, pbrMaps, backlightUniforms) {
  const thickness = opts.thickness ?? 0.14;
  const bevel = opts.bevel ?? Math.min(0.022, thickness * 0.20);
  const geom = new ExtrudeGeometry(shapes, {
    depth: thickness,
    bevelEnabled: bevel > 0.001,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: opts.curveSegments ?? 24,
  });

  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  if (uv && pos) {
    if (opts.uvBounds) {
      // Exact planar UV projection for Die-Cut Printed Cardstock Slabs!
      const { minX, maxX, minY, maxY, flipU } = opts.uvBounds;
      const spanX = (maxX - minX) || 1;
      const spanY = (maxY - minY) || 1;
      for (let i = 0; i < pos.count; i++) {
        let u = (pos.getX(i) - minX) / spanX;
        if (flipU) u = 1.0 - u;
        const v = (pos.getY(i) - minY) / spanY;
        uv.setXY(i, clamp(u, 0.002, 0.998), clamp(v, 0.002, 0.998));
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) * 0.26, pos.getY(i) * 0.26);
      }
    }
    uv.needsUpdate = true;
  }

  const mats = createCardstockPair(opts, pbrMaps, backlightUniforms);
  const mesh = new Mesh(geom, mats);
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = opts.receiveShadow !== false;
  return mesh;
}

// ============================================================================
// 4. DIE-CUT PRINTED CARDSTOCK SLAB BUILDER (FOR ALL 48 LIBRARY SVGS & PARTS)
// Traces outer alpha contour -> 3D beveled cardstock + 4x DPI crisp SVG texture
// ============================================================================
function rdpSimplify(pts, epsilon) {
  if (pts.length <= 4) return pts;
  let maxDist = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy || 1e-6;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq, 0, 1);
    const projX = a[0] + t * dx, projY = a[1] + t * dy;
    const d = Math.hypot(p[0] - projX, p[1] - projY);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(pts.slice(0, idx + 1), epsilon);
    const right = rdpSimplify(pts.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function chaikinSmoothClosed(pts, iterations = 1) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 4) break;
    const next = [];
    for (let i = 0; i < cur.length; i++) {
      const p0 = cur[i];
      const p1 = cur[(i + 1) % cur.length];
      next.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
      next.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
    }
    cur = next;
  }
  return cur;
}

function traceAlphaContours(alphaGrid, gw, gh) {
  // Pad 1px border of zeros so boundary loops always close cleanly
  const W = gw + 2, H = gh + 2;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (alphaGrid[y * gw + x] > 18) mask[(y + 1) * W + (x + 1)] = 1;
    }
  }
  // Morphological 1px dilation so thin eyelashes/stems merge cleanly into the cardstock die-cut margin!
  const dilated = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (
        mask[y * W + x] || mask[y * W + x - 1] || mask[y * W + x + 1] ||
        mask[(y - 1) * W + x] || mask[(y + 1) * W + x]
      ) {
        dilated[y * W + x] = 1;
      }
    }
  }

  // Extract directed outer boundary edges between solid (1) and empty (0) cells
  // Grid vertices are [0..W, 0..H]
  const adj = new Map();
  const addEdge = (x0, y0, x1, y1) => {
    const k = `${x0},${y0}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push([x1, y1]);
  };

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!dilated[y * W + x]) continue;
      if (!dilated[(y - 1) * W + x]) addEdge(x, y, x + 1, y);         // top edge -> right
      if (!dilated[y * W + x + 1])   addEdge(x + 1, y, x + 1, y + 1); // right edge -> down
      if (!dilated[(y + 1) * W + x]) addEdge(x + 1, y + 1, x, y + 1); // bottom edge -> left
      if (!dilated[y * W + x - 1])   addEdge(x, y + 1, x, y);         // left edge -> up
    }
  }

  const loops = [];
  for (const [startKey, list] of adj.entries()) {
    while (list.length > 0) {
      const [sx, sy] = startKey.split(',').map(Number);
      const pts = [[sx - 1, sy - 1]];
      let [cx, cy] = list.pop();
      let guard = 0;
      while ((cx !== sx || cy !== sy) && guard++ < W * H * 4) {
        pts.push([cx - 1, cy - 1]);
        const k = `${cx},${cy}`;
        const nextList = adj.get(k);
        if (!nextList || nextList.length === 0) break;
        [cx, cy] = nextList.pop();
      }
      if (pts.length >= 6) loops.push(pts);
    }
  }

  // Compute signed area in pixel space; keep positive (outer) loops with area >= 10px^2
  const validOuter = [];
  for (const lp of loops) {
    let area2 = 0;
    for (let i = 0; i < lp.length; i++) {
      const a = lp[i], b = lp[(i + 1) % lp.length];
      area2 += a[0] * b[1] - b[0] * a[1];
    }
    if (area2 > 20) {
      const simp = chaikinSmoothClosed(rdpSimplify(lp.concat([lp[0]]), 1.15).slice(0, -1), 2);
      if (simp.length >= 4) validOuter.push({ pts: simp, area: area2 * 0.5 });
    }
  }
  validOuter.sort((a, b) => b.area - a.area);
  return validOuter.slice(0, 6).map((v) => v.pts);
}

async function rasterizeSvgToCanvas(svgMarkup, pixelW, pixelH) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelW;
  canvas.height = pixelH;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  await new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
    img.src = encoded;
  });
  ctx.clearRect(0, 0, pixelW, pixelH);
  if (img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, pixelW, pixelH);
  }
  return canvas;
}

function makeClosedBlinkSvg(svgFragment) {
  // Transform <g data-eye="1" transform="translate(cx,cy)">...</g> into a gentle closed eyelash arc!
  return svgFragment.replace(
    /<g\b([^>]*\bdata-eye\s*=\s*["']1["'][^>]*)>([\s\S]*?)<\/g>/gi,
    (_full, attrs) => `<g${attrs}><path d="M-3.2 0.2 Q0 2.6 3.4 0.1" fill="none" stroke="#241612" stroke-width="1.6" stroke-linecap="round"/></g>`,
  );
}

function computePaperFlexOffset(x, y, span, flex, evalT, mirrorX) {
  const mode = flex.mode || 'cloth_billow';
  const freq = flex.freq ?? 4.2;
  const phase = flex.phase ?? 0;
  const lag = flex.lag ?? 2.4;
  const sign = mirrorX ? -1 : 1;
  const r = clamp(Math.hypot(x, y) / Math.max(0.05, span), 0, 1.2);
  const rPow = Math.pow(r, flex.power ?? 1.55);

  if (mode === 'wing_cup') {
    const ampZ = flex.ampZ ?? 0.24;
    const ampY = flex.ampY ?? 0.12;
    const w = evalT * freq + phase - r * lag;
    const dz = Math.sin(w) * ampZ * rPow;
    const dy = Math.cos(w) * ampY * rPow;
    return [0, dy, dz];
  }
  if (mode === 'tail_wave') {
    const ampZ = flex.ampZ ?? 0.14;
    const ampY = flex.ampY ?? 0.08;
    const w = evalT * freq + phase - r * lag;
    return [0, Math.sin(w) * ampY * rPow, Math.cos(w) * ampZ * rPow];
  }
  if (mode === 'branch_sway') {
    const ampX = flex.ampX ?? 0.12;
    const ampZ = flex.ampZ ?? 0.09;
    const w = evalT * freq + phase - r * (lag * 0.5);
    return [Math.sin(w) * ampX * rPow * sign, 0, Math.cos(w * 0.85) * ampZ * rPow];
  }
  // cloth_billow (cloaks, gowns, robes, sashes)
  const ampX = flex.ampX ?? 0.10;
  const ampZ = flex.ampZ ?? 0.16;
  const w = evalT * freq + phase - r * lag;
  return [Math.sin(w) * ampX * rPow * sign, 0, Math.sin(w - 0.55) * ampZ * rPow];
}

function buildFlexCardstockGroup(opts, loops, gw, gh, totW, totH, pivX, pivY, worldScale, mirrorX, pbrMaps, backlightUniforms) {
  const sign = mirrorX ? -1 : 1;
  const minX = mirrorX ? -(totW - pivX) * worldScale : -pivX * worldScale;
  const maxX = mirrorX ? pivX * worldScale : (totW - pivX) * worldScale;
  const minY = -(totH - pivY) * worldScale;
  const maxY = pivY * worldScale;
  const wWorld = maxX - minX;
  const hWorld = maxY - minY;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const thickness = opts.thickness ?? 0.075;
  const halfT = thickness * 0.5;
  const maxSpan = Math.max(0.25, Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY))));

  const [capMat, edgeMat] = createCardstockPair({
    ...opts,
    edgeEmissiveIntensity: 0.12,
  }, pbrMaps, backlightUniforms);
  capMat.alphaTest = 0.45;
  capMat.side = DoubleSide;
  edgeMat.side = DoubleSide;

  const segX = 20, segY = 14;
  const frontGeom = new PlaneGeometry(wWorld, hWorld, segX, segY);
  frontGeom.translate(cx, cy, halfT);
  if (mirrorX) {
    const uv = frontGeom.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1.0 - uv.getX(i));
    uv.needsUpdate = true;
  }

  const backGeom = new PlaneGeometry(wWorld, hWorld, segX, segY);
  backGeom.translate(cx, cy, -halfT);
  if (mirrorX) {
    const uv = backGeom.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1.0 - uv.getX(i));
    uv.needsUpdate = true;
  }

  // Dense perimeter edge strip connecting front and back caps along traced alpha contour
  const edgePos = [];
  const edgeUv = [];
  for (const lp of loops) {
    const pts = lp.map(([gx, gy]) => [
      ((gx / gw) * totW - pivX) * worldScale * sign,
      -((gy / gh) * totH - pivY) * worldScale,
    ]);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const subs = Math.max(1, Math.min(6, Math.ceil(segLen / 0.08)));
      for (let s = 0; s < subs; s++) {
        const u0 = s / subs, u1 = (s + 1) / subs;
        const x0 = lerp(a[0], b[0], u0), y0 = lerp(a[1], b[1], u0);
        const x1 = lerp(a[0], b[0], u1), y1 = lerp(a[1], b[1], u1);
        edgePos.push(
          x0, y0, halfT, x1, y1, halfT, x1, y1, -halfT,
          x0, y0, halfT, x1, y1, -halfT, x0, y0, -halfT,
        );
        edgeUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
  }
  const edgeGeom = new BufferGeometry();
  edgeGeom.setAttribute('position', new Float32BufferAttribute(edgePos, 3));
  edgeGeom.setAttribute('uv', new Float32BufferAttribute(edgeUv, 2));
  edgeGeom.computeVertexNormals();

  const frontMesh = new Mesh(frontGeom, capMat);
  const backMesh = new Mesh(backGeom, capMat);
  const edgeMesh = new Mesh(edgeGeom, edgeMat);
  frontMesh.castShadow = true; frontMesh.receiveShadow = true;
  backMesh.castShadow = true; backMesh.receiveShadow = true;
  edgeMesh.castShadow = true; edgeMesh.receiveShadow = true;

  const group = new Group();
  group.add(frontMesh, backMesh, edgeMesh);

  const geoms = [frontGeom, backGeom, edgeGeom];
  const baseArrs = geoms.map((g) => new Float32Array(g.attributes.position.array));

  const deformAt = (evalT) => {
    for (let gIdx = 0; gIdx < geoms.length; gIdx++) {
      const g = geoms[gIdx];
      const pos = g.attributes.position;
      const base = baseArrs[gIdx];
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
        const [dx, dy, dz] = computePaperFlexOffset(bx, by, maxSpan, opts.paperFlex, evalT, mirrorX);
        pos.setXYZ(i, bx + dx, by + dy, bz + dz);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
  };

  group.userData = {
    isFlexGroup: true,
    capMat,
    edgeMat,
    frontMesh,
    backMesh,
    edgeMesh,
    deformAt,
  };
  return group;
}

async function buildPrintedCardstockPart(part, sharedDefsMarkup, worldScale, pbrMaps, backlightUniforms) {
  const [w, h] = part.size;
  const [px, py] = part.pivot;
  const pad = 6; // extra bleed margin so thick strokes or filters never clip at box edge
  const totW = w + pad * 2;
  const totH = h + pad * 2;
  const pivX = px + pad;
  const pivY = py + pad;
  const dpi = clamp(Math.round(512 / Math.max(totW, totH)), 3, 6);
  const texW = Math.min(1024, Math.max(128, Math.round(totW * dpi)));
  const texH = Math.min(1024, Math.max(128, Math.round(totH * dpi)));

  const wrapMarkup = (innerSvg) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totW} ${totH}" width="${texW}" height="${texH}">` +
    `<defs>${sharedDefsMarkup}</defs>` +
    `<g transform="translate(${pivX},${pivY})">${innerSvg}</g></svg>`;

  const openCanvas = await rasterizeSvgToCanvas(wrapMarkup(part.svg), texW, texH);
  const openTex = new CanvasTexture(openCanvas);
  openTex.colorSpace = SRGBColorSpace;
  openTex.anisotropy = 8;
  openTex.needsUpdate = true;

  let blinkTex = null;
  if (/data-eye\s*=\s*["']1["']/i.test(part.svg)) {
    const blinkCanvas = await rasterizeSvgToCanvas(wrapMarkup(makeClosedBlinkSvg(part.svg)), texW, texH);
    blinkTex = new CanvasTexture(blinkCanvas);
    blinkTex.colorSpace = SRGBColorSpace;
    blinkTex.anisotropy = 8;
    blinkTex.needsUpdate = true;
  }

  // Downsample alpha to 96x96 grid for fast, deterministic marching contour extraction
  const gw = 96, gh = 96;
  const aCan = document.createElement('canvas');
  aCan.width = gw; aCan.height = gh;
  const aCtx = aCan.getContext('2d');
  aCtx.drawImage(openCanvas, 0, 0, gw, gh);
  const aData = aCtx.getImageData(0, 0, gw, gh).data;
  const alphaGrid = new Uint8Array(gw * gh);
  let rSum = 0, gSum = 0, bSum = 0, cCount = 0;
  for (let i = 0; i < gw * gh; i++) {
    const a = aData[i * 4 + 3];
    alphaGrid[i] = a;
    if (a > 140) {
      rSum += aData[i * 4];
      gSum += aData[i * 4 + 1];
      bSum += aData[i * 4 + 2];
      cCount++;
    }
  }
  const avgHex = cCount > 0
    ? '#' + [rSum / cCount, gSum / cCount, bSum / cCount].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
    : '#e2e8f0';

  const loops = traceAlphaContours(alphaGrid, gw, gh);

  const cs = part.cardstock || {};
  const thickness = cs.thickness ?? 0.085;
  const bevel = cs.bevel ?? Math.min(0.015, thickness * 0.20);
  const translucency = cs.translucency ?? 0.22;

  if (cs.paperFlex) {
    const makeFlex = (mirrorX) => buildFlexCardstockGroup({
      thickness,
      color: avgHex,
      map: openTex,
      edgeColor: cs.edgeColor ?? null,
      roughness: cs.roughness ?? 0.89,
      translucency,
      paperFlex: cs.paperFlex,
    }, loops, gw, gh, totW, totH, pivX, pivY, worldScale, mirrorX, pbrMaps, backlightUniforms);

    return {
      id: part.id,
      isFlex: true,
      openTex,
      blinkTex,
      avgHex,
      thickness,
      makeNormalFlex: () => makeFlex(false),
      makeFlippedFlex: () => makeFlex(true),
      normalMesh: makeFlex(false),
      flippedMesh: makeFlex(true),
    };
  }

  const makeDirectionalMesh = (mirrorX) => {
    const sign = mirrorX ? -1 : 1;
    const minX = mirrorX ? -(totW - pivX) * worldScale : -pivX * worldScale;
    const maxX = mirrorX ? pivX * worldScale : (totW - pivX) * worldScale;
    const minY = -(totH - pivY) * worldScale;
    const maxY = pivY * worldScale;

    let shapes = [];
    if (loops.length > 0) {
      for (const lp of loops) {
        const v2 = lp.map(([gx, gy]) => {
          const sx = (gx / gw) * totW;
          const sy = (gy / gh) * totH;
          return new Vector2((sx - pivX) * worldScale * sign, -(sy - pivY) * worldScale);
        });
        if (ShapeUtils.isClockWise(v2)) v2.reverse();
        const sh = new Shape(v2);
        sh.closePath();
        shapes.push(sh);
      }
    } else {
      const sh = new Shape([
        new Vector2(minX * 0.7, minY * 0.7),
        new Vector2(maxX * 0.7, minY * 0.7),
        new Vector2(maxX * 0.7, maxY * 0.7),
        new Vector2(minX * 0.7, maxY * 0.7),
      ]);
      sh.closePath();
      shapes.push(sh);
    }

    const mesh = buildExtrudedShapeMesh(shapes, {
      thickness,
      bevel,
      curveSegments: 10,
      color: avgHex,
      map: openTex,
      edgeColor: cs.edgeColor ?? null,
      roughness: cs.roughness ?? 0.89,
      translucency,
      uvBounds: { minX, maxX, minY, maxY, flipU: mirrorX },
    }, pbrMaps, backlightUniforms);
    mesh.position.z = -thickness * 0.5;
    return mesh;
  };

  return {
    id: part.id,
    isFlex: false,
    openTex,
    blinkTex,
    avgHex,
    thickness,
    normalMesh: makeDirectionalMesh(false),
    flippedMesh: makeDirectionalMesh(true),
  };
}

// ============================================================================
// 5. SCULPTED 3D RELIEF BUILDERS (MOUNTAINS, FRAMES, ARCHITECTURE, FLORA)
// ============================================================================
function buildMultiPlyShadowBoxFrame(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const outerW = cfg.outerWidth ?? 24;
  const outerH = cfg.outerHeight ?? 15;
  const totalDepth = cfg.depth ?? 4.8;
  const rx = cfg.apertureRx ?? 6.45;
  const ry = cfg.apertureRy ?? 4.08;
  const cy = cfg.apertureCy ?? 0.0;
  const plies = cfg.plies ?? 3;
  const steps = cfg.steps ?? 108;

  const plyColors = cfg.plyColors || [
    cfg.wallColor ?? '#1c2436',
    cfg.midWallColor ?? '#28354f',
    cfg.innerWallColor ?? '#37496b',
  ];

  for (let p = 0; p < plies; p++) {
    const shrink = p * (cfg.plyStep ?? 0.22);
    const prx = rx - shrink;
    const pry = ry - shrink * 0.72;
    const pDepth = p === 0 ? totalDepth : Math.max(0.18, (totalDepth * 0.22));
    const zFront = -p * (cfg.plyZGap ?? 0.26);

    const apPts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      let rMod = 1.0;
      if (cfg.frameShape === 'scalloped_arch') {
        rMod = 1.0 + Math.sin(a * (cfg.scallops ?? 11) + p * 0.3) * (cfg.scallopAmp ?? 0.042);
      } else if (cfg.frameShape === 'oval_scallop_bottom') {
        if (Math.sin(a) < -0.50) rMod = 1.0 + Math.abs(Math.sin(a * 14)) * 0.044;
      } else if (cfg.frameShape === 'pagoda_lantern_window') {
        // Traditional lobed lantern shadow-box frame (inspired by Hoi An / Chùa Cầu lightboxes!)
        rMod = 1.0 + Math.cos(a * 4) * 0.055 + Math.sin(a * 12) * 0.018;
      }
      if (cfg.frameShape === 'rounded_rect' || cfg.frameShape === 'proscenium') {
        // Superellipse rounded rectangle opening
        const n = 4.6;
        const ca = Math.cos(a), sa = Math.sin(a);
        const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) * prx;
        const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n) * pry;
        apPts.push([sx, cy + sy]);
      } else {
        apPts.push([Math.cos(a) * prx * rMod, cy + Math.sin(a) * pry * rMod]);
      }
    }

    const outer = new Shape();
    outer.moveTo(-outerW * 0.5, -outerH * 0.5);
    outer.lineTo(outerW * 0.5, -outerH * 0.5);
    outer.lineTo(outerW * 0.5, outerH * 0.5);
    outer.lineTo(-outerW * 0.5, outerH * 0.5);
    outer.closePath();

    const hole = new Path();
    hole.moveTo(apPts[apPts.length - 1][0], apPts[apPts.length - 1][1]);
    for (let i = apPts.length - 2; i >= 0; i--) hole.lineTo(apPts[i][0], apPts[i][1]);
    hole.closePath();
    outer.holes.push(hole);

    const col = plyColors[Math.min(p, plyColors.length - 1)];
    const mesh = buildExtrudedShapeMesh(outer, {
      thickness: pDepth,
      bevel: 0.045,
      color: col,
      edgeColor: cfg.rimHighlightColor ?? null,
      roughness: 0.86,
      edgeRoughness: 0.50,
      translucency: 0.10,
      castShadow: cfg.frameCastShadow ?? (p > 0),
      receiveShadow: true,
    }, pbrMaps, backlightUniforms);
    mesh.position.z = zFront - pDepth;
    group.add(mesh);
  }

  return group;
}

function buildFoldedRidgeRelief(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const baseY = cfg.baseY ?? -4.8;
  const style = cfg.foldStyle ?? 'faceted';
  const translucency = cfg.translucency ?? 0.24;

  if (style === 'pleated') {
    const peaks = cfg.peaks || [[0, 2.2, 0.72, 3.6]];
    for (const pk of peaks) {
      const [px, py, zH, hw] = pk;
      const pleats = cfg.pleats ?? 24;
      const positions = [], uvs = [];
      const rimPts = [];
      for (let i = 0; i <= pleats; i++) {
        const u = i / pleats;
        const bx = (px - hw) + (hw * 2) * u;
        const isRidge = i % 2 === 1;
        const distNorm = Math.abs(u - 0.5) * 2.0;
        const shoulderLift = Math.pow(1.0 - distNorm, 1.35) * 0.44;
        const mx = px + (bx - px) * 0.52;
        const my = py + (baseY - py) * 0.48 + shoulderLift + (isRidge ? 0.045 : -0.025);
        const mz = (isRidge ? zH * 0.60 : zH * 0.42) * (1.0 - distNorm * 0.40);
        const bz = (isRidge ? zH * 0.22 : zH * 0.12) * (1.0 - distNorm * 0.48);
        rimPts.push({ mx, my, mz, bx, by: baseY, bz });
      }
      const pushTri = (a, b, c) => {
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        uvs.push(a[0] * 0.28, a[1] * 0.28, b[0] * 0.28, b[1] * 0.28, c[0] * 0.28, c[1] * 0.28);
      };
      const apex = [px, py, zH];
      for (let i = 0; i < pleats; i++) {
        const p0 = rimPts[i], p1 = rimPts[i + 1];
        pushTri(apex, [p0.mx, p0.my, p0.mz], [p1.mx, p1.my, p1.mz]);
        pushTri([p0.mx, p0.my, p0.mz], [p0.bx, p0.by, p0.bz], [p1.bx, p1.by, p1.bz]);
        pushTri([p0.mx, p0.my, p0.mz], [p1.bx, p1.by, p1.bz], [p1.mx, p1.my, p1.mz]);
      }
      const geom = new BufferGeometry();
      geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geom.computeVertexNormals();
      const [capMat] = createCardstockPair({ ...cfg, flatShading: true, translucency }, pbrMaps, backlightUniforms);
      capMat.side = DoubleSide;
      const m = new Mesh(geom, capMat);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
  } else if (style === 'tiered_cliff_slabs') {
    // Stratified multi-step carved cliff slabs + overhangs (inspired by architectural castle cliffs!)
    const slabs = cfg.slabs || [];
    slabs.forEach((sl, idx) => {
      const x = sl.x ?? 0, y = sl.y ?? -1.5, w = sl.w ?? 3.2, h = sl.h ?? 2.2;
      const zOff = (sl.zOffset ?? 0) + idx * (sl.zStep ?? 0.14);
      const notches = sl.notches ?? 5;
      const pts = [new Vector2(-w * 0.52, -h)];
      for (let i = 0; i <= notches; i++) {
        const u = i / notches;
        const nx = -w * 0.5 + w * u;
        const ny = Math.sin(u * Math.PI) * 0.22 + ((i % 2 === 0) ? 0.08 : -0.06) + (sl.slope ?? 0) * (u - 0.5);
        pts.push(new Vector2(nx, ny));
      }
      pts.push(new Vector2(w * 0.52, -h));
      if (ShapeUtils.isClockWise(pts)) pts.reverse();
      const sh = new Shape(pts);
      sh.closePath();

      const rock = buildExtrudedShapeMesh(sh, {
        thickness: sl.thickness ?? 0.22,
        bevel: 0.026,
        color: sl.color ?? cfg.color ?? '#2c4f66',
        edgeColor: sl.edgeColor ?? cfg.edgeColor ?? '#b5d8eb',
        translucency: translucency * 0.7,
      }, pbrMaps, backlightUniforms);
      rock.position.set(x, y, zOff);
      group.add(rock);

      // Optional contrasting grass/snow cap ledge along top of cliff slab!
      if (sl.capColor) {
        const capPts = [];
        for (let i = 0; i <= notches; i++) {
          const u = i / notches;
          const nx = -w * 0.51 + w * 1.02 * u;
          const ny = Math.sin(u * Math.PI) * 0.22 + ((i % 2 === 0) ? 0.08 : -0.06) + (sl.slope ?? 0) * (u - 0.5);
          capPts.push([nx, ny + 0.08]);
        }
        const capV = capPts.map(([cx, cy]) => new Vector2(cx, cy));
        for (let i = capPts.length - 1; i >= 0; i--) {
          capV.push(new Vector2(capPts[i][0], capPts[i][1] - (sl.capHeight ?? 0.16)));
        }
        if (ShapeUtils.isClockWise(capV)) capV.reverse();
        const capShape = new Shape(capV);
        capShape.closePath();
        const capMesh = buildExtrudedShapeMesh(capShape, {
          thickness: (sl.thickness ?? 0.22) + 0.05,
          bevel: 0.022,
          color: sl.capColor,
          edgeColor: '#ffffff',
          translucency: 0.25,
        }, pbrMaps, backlightUniforms);
        capMesh.position.set(x, y, zOff + 0.02);
        group.add(capMesh);
      }
    });
  } else {
    // Sculptural Faceted Origami Mountain Range with secondary spur creases & paper rim!
    const rPts = cfg.ridgePoints || [[-6, 0, 0.2], [-3, 3.0, 0.9], [0, 1.2, 0.35], [3.5, 3.4, 1.0], [6.5, 0, 0.2]];
    const spineShiftX = cfg.spineShiftX ?? 0.24;
    const thickness = cfg.thickness ?? 0.18;
    const positions = [], uvs = [];
    const pushTri = (a, b, c) => {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      uvs.push(a[0] * 0.26, a[1] * 0.26, b[0] * 0.26, b[1] * 0.26, c[0] * 0.26, c[1] * 0.26);
    };

    for (let i = 0; i < rPts.length - 1; i++) {
      const a = rPts[i], b = rPts[i + 1];
      const midX = (a[0] + b[0]) * 0.5 + spineShiftX * ((i % 2 === 0) ? 1 : -0.8);
      const midY = Math.min(a[1], b[1]) * 0.52 + baseY * 0.48;
      const midZ = Math.max(a[2], b[2]) * 0.76;

      const pa = [a[0], a[1], a[2]], pb = [b[0], b[1], b[2]];
      const m = [midX, midY, midZ];
      const fa = [a[0], baseY, a[2] * 0.12], fb = [b[0], baseY, b[2] * 0.12], fm = [midX, baseY, midZ * 0.45];

      pushTri(pa, fa, m);
      pushTri(pa, m, pb);
      pushTri(pb, m, fb);
      pushTri(m, fa, fm);
      pushTri(m, fm, fb);

      const paBack = [a[0], a[1], a[2] - thickness], pbBack = [b[0], b[1], b[2] - thickness];
      pushTri(pa, pb, pbBack);
      pushTri(pa, pbBack, paBack);
    }

    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geom.computeVertexNormals();
    const [capMat, edgeMat] = createCardstockPair({ ...cfg, flatShading: true, translucency }, pbrMaps, backlightUniforms);
    capMat.side = DoubleSide;
    const mesh = new Mesh(geom, capMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);

    if (cfg.highlightRim !== false) {
      const rimPositions = [], rimUvs = [];
      const rimH = cfg.rimStrip ?? 0.042;
      for (let i = 0; i < rPts.length - 1; i++) {
        const a = rPts[i], b = rPts[i + 1];
        const a0 = [a[0], a[1] + 0.01, a[2] + 0.012], b0 = [b[0], b[1] + 0.01, b[2] + 0.012];
        const a1 = [a[0], a[1] - rimH, a[2] + 0.016], b1 = [b[0], b[1] - rimH, b[2] + 0.016];
        rimPositions.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
        rimUvs.push(0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1);
      }
      const rGeom = new BufferGeometry();
      rGeom.setAttribute('position', new Float32BufferAttribute(rimPositions, 3));
      rGeom.setAttribute('uv', new Float32BufferAttribute(rimUvs, 2));
      rGeom.computeVertexNormals();
      edgeMat.side = DoubleSide;
      const rMesh = new Mesh(rGeom, edgeMat);
      rMesh.receiveShadow = true;
      group.add(rMesh);
    }
  }
  return group;
}

function buildCuppedPetalsCluster(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const rings = cfg.rings || [
    { count: 12, len: 1.02, wid: 0.34, tiltDeg: 36, z: 0.00, color: cfg.color || '#eed5a8' },
    { count: 9,  len: 0.78, wid: 0.28, tiltDeg: 24, z: 0.13, color: cfg.midColor || '#f9e8c8' },
    { count: 7,  len: 0.52, wid: 0.22, tiltDeg: 12, z: 0.25, color: cfg.innerColor || '#fff8ea' },
  ];
  const baseRot = (cfg.rotationDeg ?? 0) * DEG;

  rings.forEach((ring, rIdx) => {
    const l = ring.len, w = ring.wid;
    const sh = new Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(-w * 0.88, l * 0.30, -w * 0.68, l * 0.78, 0, l);
    sh.bezierCurveTo(w * 0.68, l * 0.78, w * 0.88, l * 0.30, 0, 0);
    sh.closePath();

    const geom = new ExtrudeGeometry(sh, {
      depth: cfg.petalThickness ?? 0.045,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 14,
    });
    const mats = createCardstockPair({
      color: ring.color,
      edgeColor: cfg.edgeColor || '#ffffff',
      translucency: 0.42,
      edgeEmissiveIntensity: 0.12,
    }, pbrMaps, backlightUniforms);

    const n = ring.count;
    const phase = rIdx * (Math.PI / n) + baseRot;
    for (let i = 0; i < n; i++) {
      const holder = new Group();
      holder.position.z = ring.z + (i % 2) * 0.014;
      holder.rotation.z = phase + (i / n) * Math.PI * 2;
      const m = new Mesh(geom, mats);
      m.rotation.x = -(ring.tiltDeg ?? 20) * DEG;
      m.castShadow = true; m.receiveShadow = true;
      holder.add(m);
      group.add(holder);
    }
  });

  const cGeom = new SphereGeometry(cfg.centerRadius ?? 0.15, 16, 12);
  cGeom.scale(1, 1, 0.55);
  const [cMat] = createCardstockPair({
    color: cfg.centerColor ?? '#ebb95e',
    emissive: '#8f5f14',
    emissiveIntensity: 0.25,
    translucency: 0.3,
  }, pbrMaps, backlightUniforms);
  const cm = new Mesh(cGeom, cMat);
  cm.position.z = (rings[rings.length - 1]?.z ?? 0.25) + 0.06;
  cm.castShadow = true;
  group.add(cm);
  return group;
}

function buildPineFanTree(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  if (cfg.trunkPath) {
    const sh = parsePathToShape(cfg.trunkPath);
    group.add(buildExtrudedShapeMesh(sh, {
      thickness: cfg.trunkThickness ?? 0.11,
      bevel: 0.02,
      color: cfg.trunkColor ?? '#e6cc9c',
      edgeColor: cfg.trunkEdgeColor ?? '#fff8e6',
      translucency: 0.22,
    }, pbrMaps, backlightUniforms));
  }

  for (const pad of (cfg.fanPads || [])) {
    const padGroup = new Group();
    padGroup.position.set(pad.x, pad.y, pad.z ?? 0.08);
    padGroup.rotation.z = (pad.rotDeg ?? 0) * DEG;
    const r = pad.radius ?? 0.72, h = pad.height ?? 0.38, ribs = pad.ribs ?? 24, zPeak = pad.zPeak ?? 0.11;
    const positions = [], uvs = [], pts = [];
    const base = [0, -h * 0.18, 0];

    for (let i = 0; i <= ribs; i++) {
      const t = i / ribs;
      const ang = Math.PI * (0.04 + t * 0.92);
      const dome = Math.sin(t * Math.PI);
      const rad = r * (0.86 + 0.16 * dome) * (i % 2 === 1 ? 1.0 : 0.91);
      pts.push([Math.cos(ang) * rad, Math.sin(ang) * h * (0.78 + 0.28 * dome), i % 2 === 1 ? zPeak : 0.03]);
    }
    for (let i = 0; i < ribs; i++) {
      positions.push(...base, ...pts[i], ...pts[i + 1]);
      uvs.push(0.5, 0, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geom.computeVertexNormals();
    const [mat] = createCardstockPair({
      color: pad.color ?? cfg.padColor ?? '#faeed4',
      flatShading: true,
      translucency: 0.36,
      emissive: '#3b2d16',
      emissiveIntensity: 0.12,
    }, pbrMaps, backlightUniforms);
    mat.side = DoubleSide;
    const fm = new Mesh(geom, mat);
    fm.castShadow = true; fm.receiveShadow = true;
    padGroup.add(fm);

    const backSh = new Shape();
    backSh.moveTo(-r * 0.92, -h * 0.05);
    backSh.quadraticCurveTo(0, h * 1.14, r * 0.92, -h * 0.05);
    backSh.quadraticCurveTo(0, -h * 0.24, -r * 0.92, -h * 0.05);
    backSh.closePath();
    const backM = buildExtrudedShapeMesh(backSh, {
      thickness: 0.055,
      bevel: 0.012,
      color: pad.backColor ?? cfg.padBackColor ?? '#d1ba8e',
      edgeColor: '#fff7e2',
      translucency: 0.32,
    }, pbrMaps, backlightUniforms);
    backM.position.z = -0.065;
    padGroup.add(backM);
    group.add(padGroup);
  }
  return group;
}

function buildBotanicalFrond(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  if (cfg.stemPath) {
    group.add(buildExtrudedShapeMesh(parsePathToShape(cfg.stemPath), {
      thickness: 0.055,
      bevel: 0.01,
      color: cfg.stemColor ?? cfg.color ?? '#c95c4d',
      edgeColor: cfg.edgeColor ?? '#ffcec4',
      translucency: 0.3,
    }, pbrMaps, backlightUniforms));
  }
  const mats = createCardstockPair({
    color: cfg.color ?? '#d96e5d',
    edgeColor: cfg.edgeColor ?? '#ffcec4',
    translucency: 0.38,
  }, pbrMaps, backlightUniforms);

  for (const lf of (cfg.leaves || [])) {
    const l = lf.len ?? 0.52, w = lf.wid ?? 0.13;
    const sh = new Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(-w, l * 0.34, -w * 0.72, l * 0.78, 0, l);
    sh.bezierCurveTo(w * 0.72, l * 0.78, w, l * 0.34, 0, 0);
    sh.closePath();
    const m = new Mesh(new ExtrudeGeometry(sh, {
      depth: 0.045, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 10,
    }), mats);
    m.position.set(lf.x ?? 0, lf.y ?? 0, lf.z ?? 0);
    m.rotation.z = (lf.rotDeg ?? 0) * DEG;
    m.rotation.x = -(lf.tiltDeg ?? 14) * DEG;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function buildTieredPineTree(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const h = cfg.height ?? 2.2, w = cfg.width ?? 0.95, tiers = cfg.tiers ?? 5;
  const tw = w * 0.13;
  const tSh = new Shape([new Vector2(-tw, 0), new Vector2(tw, 0), new Vector2(tw * 0.65, h * 0.36), new Vector2(-tw * 0.65, h * 0.36)]);
  tSh.closePath();
  const trunk = buildExtrudedShapeMesh(tSh, {
    thickness: 0.08, bevel: 0.01, color: cfg.trunkColor ?? '#593928', edgeColor: '#8c6248', translucency: 0.1,
  }, pbrMaps, backlightUniforms);
  trunk.position.z = -0.04;
  group.add(trunk);

  const [boughMat] = createCardstockPair({
    color: cfg.color ?? '#2b6f54', flatShading: true, translucency: 0.25,
  }, pbrMaps, backlightUniforms);
  boughMat.side = DoubleSide;

  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y0 = h * (0.18 + f * 0.68);
    const th = h * (0.37 - f * 0.03);
    const bw = w * (1.0 - f * 0.60) * 0.58;
    const zSpine = 0.17 * (1.0 - f * 0.42);
    const zBase = i * 0.02;
    const asym = ((i % 2 === 0) ? 1 : -1) * w * 0.025;
    const positions = [
      asym, y0 + th, zBase + zSpine * 0.45,
      -bw, y0 - th * 0.06, zBase,
      0, y0 + th * 0.14, zBase + zSpine,
      asym, y0 + th, zBase + zSpine * 0.45,
      0, y0 + th * 0.14, zBase + zSpine,
      bw, y0 - th * 0.04, zBase,
    ];
    const uvs = [0.5, 1, 0, 0, 0.5, 0.2, 0.5, 1, 0.5, 0.2, 1, 0];
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geom.computeVertexNormals();
    const m = new Mesh(geom, boughMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function buildArchitectureStack(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const animTargets = [];

  for (const part of (cfg.parts || [])) {
    let node = null;
    if (part.shape === 'svg') {
      const sh = parsePathToShape(part.svgPath);
      for (const hp of (part.holes || [])) {
        const hs = parsePathToShape(hp);
        const pts = hs.getPoints(16);
        if (!ShapeUtils.isClockWise(pts)) pts.reverse();
        sh.holes.push(new Path(pts));
      }
      node = buildExtrudedShapeMesh(sh, part, pbrMaps, backlightUniforms);
    } else if (part.shape === 'rect') {
      const hw = (part.w ?? 1) * 0.5, hh = (part.h ?? 1) * 0.5;
      const sh = new Shape([new Vector2(-hw, -hh), new Vector2(hw, -hh), new Vector2(hw, hh), new Vector2(-hw, hh)]);
      sh.closePath();
      for (const [ax, ay, aw, ah] of (part.holeArches || [])) {
        const r = aw * 0.5;
        const hp = new Path();
        hp.moveTo(ax + r, ay);
        hp.lineTo(ax + r, ay + ah - r);
        hp.absarc(ax, ay + ah - r, r, 0, Math.PI, false);
        hp.lineTo(ax - r, ay);
        hp.closePath();
        const pts = hp.getPoints(14);
        if (!ShapeUtils.isClockWise(pts)) pts.reverse();
        sh.holes.push(new Path(pts));
      }
      node = buildExtrudedShapeMesh(sh, part, pbrMaps, backlightUniforms);
    } else if (part.shape === 'cone') {
      const geom = new ConeGeometry(part.radius ?? 0.4, part.height ?? 1.0, part.sides ?? 8);
      const [mat] = createCardstockPair({ ...part, flatShading: true, translucency: 0.18 }, pbrMaps, backlightUniforms);
      node = new Mesh(geom, mat);
      node.castShadow = true; node.receiveShadow = true;
    } else if (part.shape === 'pagoda_roof') {
      const rGroup = new Group();
      const w = part.w ?? 2.4, h = part.h ?? 0.48;
      const sh = new Shape();
      sh.moveTo(-w * 0.56, 0.06);
      sh.quadraticCurveTo(-w * 0.34, -0.06, -w * 0.22, h * 0.84);
      sh.lineTo(0, h);
      sh.lineTo(w * 0.22, h * 0.84);
      sh.quadraticCurveTo(w * 0.34, -0.06, w * 0.56, 0.06);
      sh.quadraticCurveTo(w * 0.30, -0.14, 0, -0.08);
      sh.quadraticCurveTo(-w * 0.30, -0.14, -w * 0.56, 0.06);
      sh.closePath();
      const roof = buildExtrudedShapeMesh(sh, {
        ...part, thickness: part.thickness ?? 0.22, bevel: 0.024, translucency: 0.24,
      }, pbrMaps, backlightUniforms);
      rGroup.add(roof);

      // Decorative carved rafter dentils along the underside of the pagoda eave!
      const rafterCount = Math.max(5, Math.round(w * 3.5));
      const rSh = new Shape([new Vector2(-0.025, -0.05), new Vector2(0.025, -0.05), new Vector2(0.025, 0.02), new Vector2(-0.025, 0.02)]);
      rSh.closePath();
      const rGeom = new ExtrudeGeometry(rSh, { depth: (part.thickness ?? 0.22) * 0.85, bevelEnabled: false });
      const rMats = createCardstockPair({ color: part.edgeColor || '#fff8ea', translucency: 0.3 }, pbrMaps, backlightUniforms);
      for (let k = 0; k < rafterCount; k++) {
        const u = (k + 0.5) / rafterCount - 0.5;
        const rm = new Mesh(rGeom, rMats);
        rm.position.set(u * w * 0.86, -0.07 + Math.abs(u) * 0.04, 0.01);
        rm.castShadow = true;
        rGroup.add(rm);
      }
      node = rGroup;
    }

    if (node) {
      node.position.set(part.x ?? 0, part.y ?? 0, part.z ?? 0);
      if (part.rotZ) node.rotation.z = part.rotZ * DEG;
      if (part.rotY) node.rotation.y = part.rotY * DEG;
      group.add(node);
      if (part.anim) animTargets.push({ node, anim: part.anim });
    }
  }
  return { group, animTargets };
}

// ============================================================================
// 5B. HIGH-CRAFT ORGANIC & CUTOUT RELIEF BUILDERS (v5.1 — ZERO LOW-POLY LOOK!)
// ============================================================================
function createStratumGradientTexture(topHex, midHex, botHex, fluteCount, seed) {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, topHex);
  grad.addColorStop(0.32, midHex);
  grad.addColorStop(1.0, botHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle curved topographic erosion flutes + paper fiber stipple (deterministic!)
  const rng = makeRng(seed);
  if (fluteCount > 0) {
    ctx.strokeStyle = 'rgba(255, 250, 238, 0.08)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < fluteCount; i++) {
      const x0 = (i + 0.5) / fluteCount * w + (rng() - 0.5) * 14;
      const sway = (rng() - 0.5) * 44;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + sway * 0.4, h * 0.35, x0 + sway, h * 0.7, x0 + sway * 1.15, h);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255, 248, 232, 0.035)';
  for (let i = 0; i < 650; i++) {
    ctx.fillRect(rng() * w, rng() * h, 1.5, 1.5);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildOrganicStrataRange(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const strata = Array.isArray(cfg.strata) ? cfg.strata : [];
  const baseY = cfg.baseY ?? -4.8;
  const xMin = cfg.xMin ?? -7.4;
  const xMax = cfg.xMax ?? 7.4;
  const samples = cfg.samples ?? 88;
  const seed = cfg.seed ?? 5101;

  strata.forEach((st, idx) => {
    const zOff = st.zOffset ?? (idx * (cfg.zStep ?? 0.24));
    const thickness = st.thickness ?? 0.14;
    const bevel = st.bevel ?? 0.022;
    const rng = makeRng(seed + idx * 173);
    const peaks = Array.isArray(st.peaks) ? st.peaks : [];
    const baseH = st.baseH ?? -0.5;
    const fbmAmp = st.fbmAmp ?? 0.22;
    const ph1 = rng() * 6.28, ph2 = rng() * 6.28, ph3 = rng() * 6.28;

    const evalCurve = (x) => {
      let y = baseH;
      for (const pk of peaks) {
        const [px, py, pw, skew = 0] = pk;
        const dx = (x - px) / Math.max(0.25, pw);
        const adj = dx * (dx < 0 ? (1 - skew * 0.35) : (1 + skew * 0.35));
        y += py * Math.exp(-adj * adj * 1.35);
      }
      // Smooth multi-octave organic rolling ridges (zero zigzag triangles!)
      y += Math.sin(x * 0.72 + ph1) * fbmAmp
        + Math.sin(x * 1.58 + ph2) * (fbmAmp * 0.42)
        + Math.cos(x * 3.15 + ph3) * (fbmAmp * 0.15);
      return y;
    };

    let yMax = -Infinity;
    const ridgePts = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = lerp(xMin, xMax, u);
      const y = evalCurve(x);
      if (y > yMax) yMax = y;
      ridgePts.push(new Vector2(x, y));
    }

    const poly = [new Vector2(xMin, baseY), ...ridgePts, new Vector2(xMax, baseY)];
    if (ShapeUtils.isClockWise(poly)) poly.reverse();
    const sh = new Shape(poly);
    sh.closePath();

    const gradTex = createStratumGradientTexture(
      st.topColor ?? st.color ?? '#3b577c',
      st.midColor ?? st.color ?? '#1c2f4d',
      st.bottomColor ?? '#060c18',
      st.flutes ?? 16,
      seed + idx * 97,
    );

    const mesh = buildExtrudedShapeMesh(sh, {
      thickness,
      bevel,
      curveSegments: 6,
      color: st.midColor ?? st.color ?? '#1c2f4d',
      map: gradTex,
      edgeColor: st.edgeColor ?? '#b8d0eb',
      roughness: st.roughness ?? 0.91,
      translucency: st.translucency ?? 0.22,
      uvBounds: { minX: xMin, maxX: xMax, minY: baseY, maxY: Math.max(baseY + 1.0, yMax), flipU: false },
    }, pbrMaps, backlightUniforms);
    mesh.position.z = zOff;
    group.add(mesh);
  });

  return group;
}

function sampleCubicBezier(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, it = 1 - t;
    const x = it * it * it * p0[0] + 3 * it * it * t * p1[0] + 3 * it * t * t * p2[0] + t * t * t * p3[0];
    const y = it * it * it * p0[1] + 3 * it * it * t * p1[1] + 3 * it * t * t * p2[1] + t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

function buildBonsaiCalligraphyTree(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const animTargets = [];
  const seed = cfg.seed ?? 6101;
  const rng = makeRng(seed);

  // 1. Sinuous, tapering calligraphy cubic-Bezier trunks & twigs
  const branches = Array.isArray(cfg.branches) ? cfg.branches : [];
  for (const br of branches) {
    const pts = br.pts;
    if (!Array.isArray(pts) || pts.length < 4) continue;
    const spine = sampleCubicBezier(pts[0], pts[1], pts[2], pts[3], br.steps ?? 20);
    const sh = buildRibbonPolygonPoints(spine, br.w0 ?? 0.24, br.w1 ?? 0.045);
    if (!sh) continue;
    const bm = buildExtrudedShapeMesh(sh, {
      thickness: br.thickness ?? cfg.trunkThickness ?? 0.095,
      bevel: 0.015,
      color: br.color ?? cfg.trunkColor ?? '#ead5ad',
      edgeColor: cfg.trunkEdgeColor ?? '#fff9eb',
      translucency: 0.28,
    }, pbrMaps, backlightUniforms);
    bm.position.z = br.z ?? 0;
    group.add(bm);
  }

  // 2. Lush, finely-fringed feathered pine-needle tufts (zero stiff cardboard fans!)
  const tufts = Array.isArray(cfg.tufts) ? cfg.tufts : [];
  tufts.forEach((tf, tIdx) => {
    const tuftHolder = new Group();
    tuftHolder.position.set(tf.x, tf.y, tf.z ?? 0.08);
    tuftHolder.rotation.z = (tf.rotDeg ?? 0) * DEG;

    const layers = [
      { z: -0.045, scale: 1.06, count: tf.needleCount ?? 36, color: tf.backColor ?? cfg.padBackColor ?? '#c9b389', tilt: 14 },
      { z: 0.025,  scale: 0.96, count: Math.round((tf.needleCount ?? 36) * 0.9), color: tf.color ?? cfg.padColor ?? '#fbf1da', tilt: 22 },
    ];
    const baseR = tf.radius ?? 0.84;
    const baseH = tf.height ?? 0.44;

    layers.forEach((ly, lIdx) => {
      const positions = [];
      const uvs = [];
      const n = ly.count;
      const spread = (tf.spreadDeg ?? 162) * DEG;
      const startA = Math.PI * 0.5 - spread * 0.5;
      for (let i = 0; i < n; i++) {
        const u = i / Math.max(1, n - 1);
        const ang = startA + u * spread + (rng() - 0.5) * 0.045;
        const arch = Math.sin(u * Math.PI);
        const len = (baseR * 0.56 + baseH * 0.95 * arch) * ly.scale * (0.86 + rng() * 0.28);
        const hw = (0.017 + 0.012 * arch) * ly.scale;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        const px = -sy, py = cx;
        const bx = (u - 0.5) * baseR * 0.34;
        const by = -0.04;
        const tipX = bx + cx * len;
        const tipY = by + sy * len;
        const midX = bx + cx * len * 0.56 + px * hw * 0.35;
        const midY = by + sy * len * 0.56 + py * hw * 0.35;
        const zTip = ly.z + (0.04 + 0.09 * arch) * (lIdx === 1 ? 1.15 : 0.65) + (rng() - 0.5) * 0.02;

        // Tapered 2-segment curved paper needle blade with +Z front-facing winding!
        const p0 = [bx - px * hw, by - py * hw, ly.z];
        const p1 = [bx + px * hw, by + py * hw, ly.z];
        const p2 = [midX - px * hw * 0.65, midY - py * hw * 0.65, (ly.z + zTip) * 0.55];
        const p3 = [midX + px * hw * 0.65, midY + py * hw * 0.65, (ly.z + zTip) * 0.55];
        const pt = [tipX, tipY, zTip];

        positions.push(...p0, ...p3, ...p1, ...p0, ...p2, ...p3, ...p2, ...pt, ...p3);
        uvs.push(0, 0, 1, 0.5, 1, 0, 0, 0, 0, 0.5, 1, 0.5, 0, 0.5, 0.5, 1, 1, 0.5);
      }

      const geom = new BufferGeometry();
      geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geom.computeVertexNormals();
      const [mat] = createCardstockPair({
        color: ly.color,
        edgeColor: '#ffffff',
        roughness: 0.85,
        translucency: 0.44,
        flatShading: false,
      }, pbrMaps, backlightUniforms);
      mat.side = DoubleSide;
      const m = new Mesh(geom, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      tuftHolder.add(m);
    });

    group.add(tuftHolder);
    if (cfg.paperFlex || tf.swayDeg) {
      animTargets.push({
        node: tuftHolder,
        baseRotZ: tuftHolder.rotation.z,
        baseRotX: 0,
        anim: {
          softTuftSway: true,
          swayDeg: tf.swayDeg ?? cfg.paperFlex?.swayDeg ?? 2.2,
          curlDeg: cfg.paperFlex?.curlDeg ?? 4.5,
          freq: cfg.paperFlex?.freq ?? 1.45,
          phase: tIdx * 0.95 + (cfg.paperFlex?.phase ?? 0),
        },
      });
    }
  });

  return { group, animTargets };
}

function buildBillowingCloudsLayer(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const animTargets = [];
  const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
  const xMin = cfg.xMin ?? -7.4;
  const xMax = cfg.xMax ?? 7.4;
  const outerY = cfg.edge === 'bottom' ? -5.0 : 5.0;

  tiers.forEach((tier, tIdx) => {
    const puffs = Array.isArray(tier.puffs) ? tier.puffs : [];
    const samples = 110;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const x = lerp(xMin, xMax, i / samples);
      let y = tier.baseY ?? (cfg.edge === 'bottom' ? -3.4 : 3.2);
      for (const [cx, cy, rx, ry] of puffs) {
        const dx = (x - cx) / Math.max(0.15, rx);
        if (Math.abs(dx) < 1.0) {
          const arc = Math.sqrt(Math.max(0, 1 - dx * dx)) * ry;
          const cand = cfg.edge === 'bottom' ? (cy + arc) : (cy - arc);
          y = cfg.edge === 'bottom' ? Math.max(y, cand) : Math.min(y, cand);
        }
      }
      pts.push(new Vector2(x, y));
    }
    const poly = [new Vector2(xMin, outerY), ...pts, new Vector2(xMax, outerY)];
    if (ShapeUtils.isClockWise(poly)) poly.reverse();
    const sh = new Shape(poly);
    sh.closePath();

    const m = buildExtrudedShapeMesh(sh, {
      thickness: tier.thickness ?? 0.14,
      bevel: tier.bevel ?? 0.025,
      curveSegments: 6,
      color: tier.color ?? '#f5e6c8',
      edgeColor: tier.edgeColor ?? '#ffffff',
      emissive: tier.emissive ?? '#000000',
      emissiveIntensity: tier.emissiveIntensity ?? 0.0,
      translucency: tier.translucency ?? 0.45,
    }, pbrMaps, backlightUniforms);
    m.position.z = tier.zOffset ?? (tIdx * 0.22);
    group.add(m);

    if (tier.driftX || tier.driftY) {
      animTargets.push({
        node: m,
        baseX: 0,
        baseY: 0,
        anim: {
          cloudDrift: true,
          driftX: tier.driftX ?? 0,
          driftY: tier.driftY ?? 0,
          freq: tier.freq ?? 0.45,
          phase: tier.phase ?? tIdx * 1.3,
        },
      });
    }
  });

  return { group, animTargets };
}

function buildSculptedPeonyCluster(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const animTargets = [];
  const rng = makeRng(cfg.seed ?? 7301);

  for (const bl of (cfg.blooms || [])) {
    const bGroup = new Group();
    bGroup.position.set(bl.x ?? 0, bl.y ?? 0, bl.z ?? 0);
    const sc = bl.scale ?? 1.0;
    bGroup.scale.setScalar(sc);

    const rings = bl.rings || [
      { count: 14, len: 0.96, wid: 0.31, tiltDeg: 38, z: 0.00, color: bl.outerColor ?? '#e6cc9d' },
      { count: 11, len: 0.78, wid: 0.27, tiltDeg: 27, z: 0.11, color: bl.midColor ?? '#f5e4c2' },
      { count: 9,  len: 0.56, wid: 0.22, tiltDeg: 18, z: 0.21, color: bl.innerColor ?? '#fdf4e1' },
      { count: 7,  len: 0.36, wid: 0.16, tiltDeg: 10, z: 0.29, color: bl.coreColor ?? '#fffaf0' },
    ];
    rings.forEach((ring, rIdx) => {
      for (let i = 0; i < ring.count; i++) {
        const l = ring.len * (0.86 + rng() * 0.28);
        const w = ring.wid * (0.88 + rng() * 0.24);
        const notch = (rng() - 0.5) * 0.06;
        const sh = new Shape();
        sh.moveTo(0, 0);
        sh.bezierCurveTo(-w * 0.95, l * 0.28, -w * 0.78, l * 0.76, -w * 0.14, l * 0.96);
        sh.quadraticCurveTo(notch, l * 1.04, w * 0.14, l * 0.96);
        sh.bezierCurveTo(w * 0.78, l * 0.76, w * 0.95, l * 0.28, 0, 0);
        sh.closePath();

        const pMesh = buildExtrudedShapeMesh(sh, {
          thickness: 0.036,
          bevel: 0.010,
          curveSegments: 10,
          color: ring.color,
          edgeColor: '#ffffff',
          translucency: 0.42,
        }, pbrMaps, backlightUniforms);
        const holder = new Group();
        holder.position.z = ring.z + (i % 3) * 0.012;
        holder.rotation.z = (i / ring.count) * Math.PI * 2 + rIdx * 0.42 + (rng() - 0.5) * 0.16;
        pMesh.rotation.x = -(ring.tiltDeg + (rng() - 0.5) * 8) * DEG;
        holder.add(pMesh);
        bGroup.add(holder);
      }
    });

    // Recessed gold stamen cluster (multi-dot organic center instead of 1 plain sphere!)
    const sGeom = new SphereGeometry(0.038, 8, 6);
    const [sMat] = createCardstockPair({ color: '#e3b04b', emissive: '#8f5d10', emissiveIntensity: 0.28, translucency: 0.2 }, pbrMaps, backlightUniforms);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rad = k === 0 ? 0 : 0.085 + rng() * 0.04;
      const sm = new Mesh(sGeom, sMat);
      sm.position.set(Math.cos(a) * rad, Math.sin(a) * rad, 0.34 + rng() * 0.03);
      bGroup.add(sm);
    }
    group.add(bGroup);
  }

  for (const fn of (cfg.ferns || [])) {
    const fNode = buildBotanicalFrond(fn, pbrMaps, backlightUniforms);
    fNode.position.set(fn.x ?? 0, fn.y ?? 0, fn.z ?? 0);
    if (fn.rotDeg) fNode.rotation.z = fn.rotDeg * DEG;
    group.add(fNode);
    if (fn.swayDeg) {
      animTargets.push({
        node: fNode,
        baseRotZ: fNode.rotation.z,
        baseRotX: 0,
        anim: { softTuftSway: true, swayDeg: fn.swayDeg, curlDeg: 3.0, freq: 1.25, phase: rng() * 6.28 },
      });
    }
  }

  return { group, animTargets };
}

async function buildCutoutReliefLayer(cfg, pbrMaps, backlightUniforms) {
  const group = new Group();
  const animTargets = [];

  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
    img.src = cfg.imageDataUrl;
  });

  const iw = img.naturalWidth || 1024;
  const ih = img.naturalHeight || 576;
  const maxDim = Math.min(1280, Math.max(iw, ih));
  const sc = maxDim / Math.max(iw, ih);
  const cw = Math.max(64, Math.round(iw * sc));
  const ch = Math.max(64, Math.round(ih * sc));

  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  // Build luminance-derived 3D sculpted relief normalMap blended with 300gsm paper tooth!
  const nw = 512, nh = Math.max(128, Math.round(512 * (ch / cw)));
  const nCan = document.createElement('canvas');
  nCan.width = nw; nCan.height = nh;
  const nCtx = nCan.getContext('2d');
  nCtx.drawImage(c, 0, 0, nw, nh);
  const px = nCtx.getImageData(0, 0, nw, nh).data;
  const lum = new Float32Array(nw * nh);
  for (let i = 0; i < nw * nh; i++) {
    const a = px[i * 4 + 3] / 255;
    lum[i] = ((px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255) * a;
  }

  const normBytes = new Uint8Array(nw * nh * 4);
  const rStrength = cfg.reliefStrength ?? 2.4;
  for (let y = 0; y < nh; y++) {
    const ym = Math.max(0, y - 1), yp = Math.min(nh - 1, y + 1);
    for (let x = 0; x < nw; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(nw - 1, x + 1);
      const dx = (lum[y * nw + xp] - lum[y * nw + xm]) * rStrength;
      const dy = (lum[yp * nw + x] - lum[ym * nw + x]) * rStrength;
      const inv = 1.0 / Math.hypot(dx, dy, 1.0);
      const idx = (y * nw + x) * 4;
      normBytes[idx] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normBytes[idx + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      normBytes[idx + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normBytes[idx + 3] = 255;
    }
  }
  const reliefNormalMap = new DataTexture(normBytes, nw, nh, RGBAFormat, UnsignedByteType);
  reliefNormalMap.flipY = true;
  reliefNormalMap.minFilter = LinearMipmapLinearFilter;
  reliefNormalMap.magFilter = LinearFilter;
  reliefNormalMap.generateMipmaps = true;
  reliefNormalMap.needsUpdate = true;

  const wWorld = cfg.width ?? 14.2;
  const hWorld = cfg.height ?? (wWorld * (ch / cw));
  const thickness = cfg.thickness ?? 0.11;
  const segX = cfg.paperFlex ? 28 : 4;
  const segY = cfg.paperFlex ? 18 : 4;

  const frontMat = new MeshStandardMaterial({
    color: new Color(cfg.tint ?? '#ffffff'),
    map: tex,
    normalMap: reliefNormalMap,
    normalScale: new Vector2(cfg.normalScale ?? 0.65, cfg.normalScale ?? 0.65),
    roughness: cfg.roughness ?? 0.88,
    roughnessMap: pbrMaps?.roughnessMap ?? null,
    metalness: 0.0,
    alphaTest: cfg.alphaTest ?? 0.42,
    side: DoubleSide,
    emissive: new Color(cfg.emissive ?? '#000000'),
    emissiveIntensity: cfg.emissiveIntensity ?? 0.0,
  });
  attachBacklitPaperShader(frontMat, backlightUniforms, cfg.translucency ?? 0.26);

  // Cream paper-core backing card offset slightly behind front face so oblique angles show crisp cardstock rim!
  const edgeMat = new MeshStandardMaterial({
    color: new Color(cfg.edgeColor ?? '#f6ebd4'),
    map: tex,
    roughness: 0.65,
    metalness: 0.0,
    alphaTest: cfg.alphaTest ?? 0.42,
    side: DoubleSide,
    emissive: new Color(cfg.edgeColor ?? '#f6ebd4'),
    emissiveIntensity: 0.08,
  });
  // Tint backing card completely to cream paper-core color while preserving exact cutout alpha!
  edgeMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        diffuseColor.a *= sampledDiffuseColor.a;
      #endif`,
    );
  };
  edgeMat.customProgramCacheKey = () => 'cutout-paper-core-edge';

  const frontGeom = new PlaneGeometry(wWorld, hWorld, segX, segY);
  const frontMesh = new Mesh(frontGeom, frontMat);
  frontMesh.castShadow = cfg.castShadow !== false;
  frontMesh.receiveShadow = cfg.receiveShadow !== false;
  group.add(frontMesh);

  // Stack 2 subtle cream core slices behind front face so oblique 18° view reveals real 300gsm paper thickness!
  const sliceGeoms = [frontGeom];
  const sliceSteps = Math.max(1, Math.min(3, Math.round(thickness / 0.045)));
  for (let s = 1; s <= sliceSteps; s++) {
    const sGeom = new PlaneGeometry(wWorld, hWorld, segX, segY);
    sGeom.translate(0, 0, -(thickness * (s / sliceSteps)));
    const sMesh = new Mesh(sGeom, edgeMat);
    sMesh.castShadow = false;
    sMesh.receiveShadow = true;
    group.add(sMesh);
    sliceGeoms.push(sGeom);
  }

  if (cfg.paperFlex) {
    const baseArrs = sliceGeoms.map((g) => new Float32Array(g.attributes.position.array));
    const anchorMode = cfg.paperFlex.anchor || 'edges'; // 'edges' (left/right bonsai anchored to outer frame) or 'bottom'
    const ampX = cfg.paperFlex.ampX ?? 0.14;
    const ampZ = cfg.paperFlex.ampZ ?? 0.18;
    const freq = cfg.paperFlex.freq ?? 1.4;
    const phase = cfg.paperFlex.phase ?? 0;

    animTargets.push({
      node: group,
      anim: {
        customFlex: (evalT) => {
          for (let gIdx = 0; gIdx < sliceGeoms.length; gIdx++) {
            const g = sliceGeoms[gIdx];
            const pos = g.attributes.position;
            const base = baseArrs[gIdx];
            for (let i = 0; i < pos.count; i++) {
              const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
              let weight = 0;
              if (anchorMode === 'edges') {
                // Anchored near outer frame edges & bottom corners; inner branch tips gently sway in 3D!
                const distFromEdge = clamp(1.0 - Math.abs(bx) / (wWorld * 0.5), 0, 1);
                const liftFromBottom = clamp((by + hWorld * 0.5) / hWorld, 0, 1);
                weight = Math.pow(distFromEdge, 1.35) * Math.pow(liftFromBottom, 1.25);
              } else {
                const lift = clamp((by + hWorld * 0.5) / hWorld, 0, 1);
                weight = Math.pow(lift, 1.6);
              }
              const wave = Math.sin(evalT * freq + phase + bx * 0.45 + by * 0.35);
              const waveZ = Math.cos(evalT * freq * 0.85 + phase + bx * 0.35);
              pos.setXYZ(i, bx + wave * ampX * weight, by, bz + waveZ * ampZ * weight);
            }
            pos.needsUpdate = true;
            g.computeVertexNormals();
          }
        },
      },
    });
  }

  return { group, animTargets };
}

// ============================================================================
// 6. DYNAMIC 3D SEAMLESS HOSES & STRANDS BUILDER (REAL THICKNESS & SHADOWS!)
// ============================================================================
function buildRibbonPolygonPoints(spinePts, wStart, wEnd) {
  const n = spinePts.length;
  if (n < 2) return null;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const pPrev = spinePts[Math.max(0, i - 1)];
    const pNext = spinePts[Math.min(n - 1, i + 1)];
    const tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;
    const hw = lerp(wStart, wEnd, i / (n - 1)) * 0.5;
    left.push(new Vector2(spinePts[i][0] + nx * hw, spinePts[i][1] + ny * hw));
    right.push(new Vector2(spinePts[i][0] - nx * hw, spinePts[i][1] - ny * hw));
  }
  const poly = [...left, ...right.reverse()];
  if (ShapeUtils.isClockWise(poly)) poly.reverse();
  const sh = new Shape(poly);
  sh.closePath();
  return sh;
}

// ============================================================================
// 7. MAIN ENGINE INSTANCE CREATOR (createBlueprint3dStage)
// ============================================================================
export async function createBlueprint3dStage(glCanvas, overlayCanvas, bp, sharedDefsMarkup = '') {
  const VW = bp.scene?.width ?? 960;
  const VH = bp.scene?.height ?? 540;
  const WORLD_W = 16.0;
  const WORLD_H = WORLD_W * (VH / VW);
  const WORLD_SCALE = WORLD_W / VW;
  const pxToWX = (x) => (x - VW * 0.5) * WORLD_SCALE;
  const pyToWY = (y) => -(y - VH * 0.5) * WORLD_SCALE;

  const seed = bp.meta?.seed ?? 20261127;
  const renderer = new WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  const lit3d = bp.scene?.lighting3d || {};
  renderer.toneMappingExposure = lit3d.exposure ?? 1.12;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const bgHex = lit3d.bgColor ?? bp.scene?.bgColor ?? '#0e1526';
  scene.background = new Color(bgHex);
  if (lit3d.fog) {
    scene.fog = new Fog(lit3d.fog.color ?? bgHex, lit3d.fog.near ?? 18, lit3d.fog.far ?? 34);
  }

  // Telephoto studio lens (fov = 24 deg) -> zero puppet joint perspective distortion + authentic 3D box depth!
  const fov = lit3d.fov ?? 24;
  const camDist = (WORLD_H * 0.5) / Math.tan((fov * 0.5) * DEG);
  const camera = new PerspectiveCamera(fov, VW / VH, 2.0, 56.0);
  const baseLookAt = new Vector3(0, 0, 0);
  camera.position.set(0, 0, camDist);
  camera.lookAt(baseLookAt);

  const pbrMaps = createCottonPaperPbrMaps(seed, 512);

  // Backlight uniforms shared across all translucent cardstock materials!
  const primaryBack = (lit3d.pointLights && lit3d.pointLights[0]) || {
    pos: [0.0, 1.4, -2.1],
    color: '#ffe8b5',
    distance: 13.5,
  };
  const backlightUniforms = {
    uBacklightPos: { value: new Vector3(...(primaryBack.pos || [0, 1.4, -2.1])) },
    uBacklightColor: { value: new Color(primaryBack.color || '#ffe8b5') },
    uBacklightRange: { value: primaryBack.distance ?? 13.5 },
    uBacklightGain: { value: lit3d.backlightGain ?? 1.15 },
  };

  // Lighting Rig
  const hemi = new HemisphereLight(
    lit3d.hemiLight?.sky ?? '#5e80bd',
    lit3d.hemiLight?.ground ?? '#0b1428',
    lit3d.hemiLight?.intensity ?? 0.78,
  );
  scene.add(hemi);

  const key = new DirectionalLight(
    lit3d.keyLight?.color ?? '#fff5e0',
    lit3d.keyLight?.intensity ?? 2.55,
  );
  key.position.set(...(lit3d.keyLight?.pos || [5.2, 6.8, 11.2]));
  key.castShadow = true;
  const smSize = lit3d.keyLight?.shadowMapSize ?? 2048;
  key.shadow.mapSize.set(smSize, smSize);
  const sf = lit3d.keyLight?.shadowFrustum ?? 9.2;
  key.shadow.camera.left = -sf;
  key.shadow.camera.right = sf;
  key.shadow.camera.top = sf * 0.65;
  key.shadow.camera.bottom = -sf * 0.65;
  key.shadow.camera.near = 1.0;
  key.shadow.camera.far = 32.0;
  key.shadow.bias = lit3d.keyLight?.shadowBias ?? -0.0004;
  key.shadow.normalBias = lit3d.keyLight?.shadowNormalBias ?? 0.045;
  key.shadow.radius = lit3d.keyLight?.shadowRadius ?? 2.4;
  scene.add(key);

  const rim = new DirectionalLight(
    lit3d.rimLight?.color ?? '#b8d4ff',
    lit3d.rimLight?.intensity ?? 0.85,
  );
  rim.position.set(...(lit3d.rimLight?.pos || [-6.5, 4.0, 5.5]));
  scene.add(rim);

  const pointLights = [];
  for (const plCfg of (lit3d.pointLights || [primaryBack])) {
    const pl = new PointLight(
      plCfg.color ?? '#ffe9b8',
      plCfg.intensity ?? 24.0,
      plCfg.distance ?? 14.0,
      plCfg.decay ?? 1.5,
    );
    pl.position.set(...(plCfg.pos || [0, 1.4, -2.0]));
    scene.add(pl);
    pointLights.push({ light: pl, baseIntensity: pl.intensity, cfg: plCfg });
  }

  // Post-processing Composer (4x MSAA HalfFloat + Deterministic Seeded GTAO + Subtle Lightbox Bloom + SMAA + ACES)
  let composer = null;
  let gtaoPass = null;
  let smaaPass = null;
  let bloomPass = null;

  function buildComposer(w, h) {
    if (composer) {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
    }
    const maxSamples = Math.min(4, renderer.capabilities.maxSamples || 0);
    const rt = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      samples: maxSamples,
    });
    composer = new EffectComposer(renderer, rt);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));

    gtaoPass = createDeterministicGTAOPass(scene, camera, w, h, seed + 77, {
      radius: lit3d.aoRadius ?? 0.36,
      distanceExponent: 1.65,
      thickness: 0.85,
      scale: lit3d.aoScale ?? 1.15,
      samples: 16,
      distanceFallOff: 1.0,
      screenSpaceRadius: false,
    }, {
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      rings: 2,
      samples: 12,
    });
    gtaoPass.blendIntensity = lit3d.aoIntensity ?? 0.82;
    composer.addPass(gtaoPass);

    bloomPass = new UnrealBloomPass(
      new Vector2(w, h),
      lit3d.bloomStrength ?? 0.20,
      lit3d.bloomRadius ?? 0.42,
      lit3d.bloomThreshold ?? 0.90,
    );
    composer.addPass(bloomPass);

    smaaPass = new SMAAPass(w, h);
    composer.addPass(smaaPass);
    composer.addPass(new OutputPass());
  }

  let composerW = 0;
  let composerH = 0;

  // --------------------------------------------------------------------------
  // BUILD ENVIRONMENT: 3D LAYERS + AUTO-PROMOTED 2D SVG LAYERS + BOX CAVITY
  // --------------------------------------------------------------------------
  const worldRoot = new Group();
  scene.add(worldRoot);
  const envGroup = new Group();
  worldRoot.add(envGroup);

  const layerEntries = [];
  const subAnimTargets = [];

  // Default recessed backdrop if none explicitly supplied in layers3d
  const layers3d = Array.isArray(bp.scene?.layers3d) ? [...bp.scene.layers3d] : [];
  if (!layers3d.some((l) => l.kind === 'backdrop')) {
    layers3d.unshift({
      id: '__auto_backdrop__',
      kind: 'backdrop',
      z: -3.45,
      color: bp.scene?.bgColor ?? '#0b152b',
      backlightGlow: bp.scene?.lighting?.focalGlow ? {
        x: pxToWX(bp.scene.lighting.focalGlow.x ?? VW * 0.5),
        y: pyToWY(bp.scene.lighting.focalGlow.y ?? VH * 0.45),
        size: ((bp.scene.lighting.focalGlow.r ?? 260) * 2.2) * WORLD_SCALE,
        innerColor: bp.scene.lighting.focalGlow.color ?? '#fff2c2',
        midColor: bp.scene.lighting.focalGlow.midColor ?? '#6090d8',
        opacity: 0.88,
      } : { x: 0, y: 1.2, size: 9.2, opacity: 0.85 },
      stars: bp.scene?.stars?.count ? {
        seed: seed + 31,
        count: bp.scene.stars.count,
        color: bp.scene.stars.color ?? '#fff8e2',
      } : null,
    });
  }

  // If blueprint has classic 2D backLayers/midLayers/frontLayers and NO custom sculpted terrain, promote them to 3D cardstock planes!
  const hasCustomTerrain = (bp.scene?.layers3d || []).length > 0;
  if (!hasCustomTerrain) {
    const promoteSvgList = async (list, zStart, zEnd, pfx) => {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item?.svg) continue;
        const z = list.length === 1 ? zStart : lerp(zStart, zEnd, i / (list.length - 1));
        const partLike = {
          id: `${pfx}_${i}`,
          size: [VW, VH],
          pivot: [VW * 0.5, VH * 0.5],
          svg: `<g transform="translate(${-VW * 0.5},${-VH * 0.5})">${item.svg}</g>`,
          cardstock: { thickness: 0.11, bevel: 0.018, translucency: 0.25 },
        };
        const built = await buildPrintedCardstockPart(partLike, sharedDefsMarkup, WORLD_SCALE, pbrMaps, backlightUniforms);
        const g = new Group();
        g.add(built.normalMesh);
        g.position.set(0, 0, z);
        envGroup.add(g);
        layerEntries.push({ id: partLike.id, group: g, baseX: 0, baseY: 0, baseZ: z, baseRotZ: 0, explodeFactor: 0.8, anim: null });
      }
    };
    await promoteSvgList(bp.scene?.backLayers || [], -2.4, -1.4, 'auto_back');
    await promoteSvgList(bp.scene?.midLayers || [], -0.6, -0.15, 'auto_mid');
    await promoteSvgList(bp.scene?.frontLayers || [], 0.55, 0.95, 'auto_front');
  }

  for (const layer of layers3d) {
    const node = new Group();
    node.name = layer.id;

    if (layer.kind === 'backdrop') {
      const geom = new PlaneGeometry(layer.width ?? 24, layer.height ?? 15);
      const [mat] = createCardstockPair({
        color: layer.color ?? '#0b162d',
        roughness: 0.95,
        translucency: 0.0,
      }, pbrMaps, null);
      const m = new Mesh(geom, mat);
      m.receiveShadow = true;
      node.add(m);

      if (layer.backlightGlow) {
        const g = layer.backlightGlow;
        const c = document.createElement('canvas');
        c.width = 512; c.height = 512;
        const gctx = c.getContext('2d');
        const grad = gctx.createRadialGradient(256, 256, 8, 256, 256, 256);
        grad.addColorStop(0.0, g.innerColor || 'rgba(255, 246, 218, 0.94)');
        grad.addColorStop(0.38, g.midColor || 'rgba(110, 160, 226, 0.34)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, 512, 512);
        const glowTex = new CanvasTexture(c);
        glowTex.colorSpace = SRGBColorSpace;
        const glowMesh = new Mesh(
          new PlaneGeometry(g.size ?? 9.5, g.size ?? 9.5),
          new MeshBasicMaterial({
            map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: g.opacity ?? 0.88,
          }),
        );
        glowMesh.position.set(g.x ?? 0, g.y ?? 1.2, 0.02);
        node.add(glowMesh);
      }

      if (layer.stars) {
        const rng = makeRng(layer.stars.seed ?? 9911);
        const sGeom = new CircleGeometry(1, 6);
        const sMat = new MeshBasicMaterial({ color: layer.stars.color ?? '#fff9e6' });
        for (let i = 0; i < (layer.stars.count ?? 85); i++) {
          const sm = new Mesh(sGeom, sMat);
          sm.scale.setScalar(0.016 + rng() * 0.032);
          sm.position.set(
            (rng() - 0.5) * (layer.stars.spreadX ?? 13.0),
            (layer.stars.minY ?? -0.4) + rng() * (layer.stars.spreadY ?? 4.8),
            0.03,
          );
          node.add(sm);
        }
      }
    } else if (layer.kind === 'celestial_disk') {
      // Stepped multi-ring glowing cardstock moon / sun!
      const haloCount = layer.haloRings ?? 2;
      const baseR = layer.radius ?? 0.90;
      for (let hr = haloCount; hr >= 1; hr--) {
        const hSh = new Shape();
        hSh.absarc(0, 0, baseR * (1 + hr * 0.24), 0, Math.PI * 2, false);
        const hm = buildExtrudedShapeMesh(hSh, {
          thickness: 0.03,
          bevel: 0.008,
          color: layer.haloColor ?? '#4a6b9c',
          emissive: layer.emissive ?? '#ffe8b5',
          emissiveIntensity: 0.22 / hr,
          translucency: 0.65,
          castShadow: false,
          receiveShadow: true,
        }, pbrMaps, backlightUniforms);
        hm.position.z = -hr * 0.04;
        node.add(hm);
      }
      const sh = new Shape();
      sh.absarc(0, 0, baseR, 0, Math.PI * 2, false);
      node.add(buildExtrudedShapeMesh(sh, {
        thickness: layer.thickness ?? 0.09,
        bevel: 0.02,
        color: layer.color ?? '#fffdf5',
        edgeColor: '#ffffff',
        emissive: layer.emissive ?? '#fff2cf',
        emissiveIntensity: layer.emissiveIntensity ?? 0.90,
        edgeEmissive: '#ffffff',
        edgeEmissiveIntensity: 0.95,
        translucency: 0.0,
        castShadow: layer.castShadow ?? false,
        receiveShadow: false,
      }, pbrMaps, null));
    } else if (layer.kind === 'box_frame') {
      node.add(buildMultiPlyShadowBoxFrame(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'extruded_svg') {
      const paths = layer.svgPaths || [layer.svgPath];
      paths.forEach((p, idx) => {
        const sh = parsePathToShape(p);
        for (const hp of (layer.holes || [])) {
          const hs = parsePathToShape(hp);
          const pts = hs.getPoints(16);
          if (!ShapeUtils.isClockWise(pts)) pts.reverse();
          sh.holes.push(new Path(pts));
        }
        const m = buildExtrudedShapeMesh(sh, { ...layer, translucency: layer.translucency ?? 0.35 }, pbrMaps, backlightUniforms);
        m.position.z = idx * 0.024;
        node.add(m);
      });
    } else if (layer.kind === 'folded_ridge') {
      node.add(buildFoldedRidgeMeshWrapper(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'cupped_petals') {
      node.add(buildCuppedPetalsCluster(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'pine_fan_tree') {
      node.add(buildPineFanTree(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'botanical_frond') {
      node.add(buildBotanicalFrond(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'tiered_pine_group') {
      for (const tr of (layer.trees || [])) {
        const tNode = buildTieredPineTree({ ...layer, ...tr }, pbrMaps, backlightUniforms);
        tNode.position.set(tr.x ?? 0, tr.y ?? 0, tr.z ?? 0);
        if (tr.rotZ) tNode.rotation.z = tr.rotZ * DEG;
        node.add(tNode);
      }
    } else if (layer.kind === 'architecture') {
      const { group: aGroup, animTargets } = buildArchitectureStack(layer, pbrMaps, backlightUniforms);
      node.add(aGroup);
      subAnimTargets.push(...animTargets);
    } else if (layer.kind === 'organic_strata') {
      node.add(buildOrganicStrataRange(layer, pbrMaps, backlightUniforms));
    } else if (layer.kind === 'bonsai_calligraphy') {
      const { group: bGroup, animTargets } = buildBonsaiCalligraphyTree(layer, pbrMaps, backlightUniforms);
      node.add(bGroup);
      subAnimTargets.push(...animTargets);
    } else if (layer.kind === 'billowing_clouds') {
      const { group: cGroup, animTargets } = buildBillowingCloudsLayer(layer, pbrMaps, backlightUniforms);
      node.add(cGroup);
      subAnimTargets.push(...animTargets);
    } else if (layer.kind === 'sculpted_peony') {
      const { group: pGroup, animTargets } = buildSculptedPeonyCluster(layer, pbrMaps, backlightUniforms);
      node.add(pGroup);
      subAnimTargets.push(...animTargets);
    } else if (layer.kind === 'cutout_relief') {
      const { group: rGroup, animTargets } = await buildCutoutReliefLayer(layer, pbrMaps, backlightUniforms);
      node.add(rGroup);
      subAnimTargets.push(...animTargets);
    }

    const bx = layer.x ?? 0, by = layer.y ?? 0, bz = layer.z ?? 0;
    node.position.set(bx, by, bz);
    if (layer.rotZ) node.rotation.z = layer.rotZ * DEG;
    if (layer.scale) node.scale.setScalar(layer.scale);
    envGroup.add(node);
    layerEntries.push({
      id: layer.id,
      group: node,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      baseRotZ: (layer.rotZ ?? 0) * DEG,
      explodeFactor: layer.explodeFactor ?? 1.0,
      anim: layer.anim || null,
    });
  }

  // Add preset boxCavity frame if not already added in layers3d
  let boxFrameGroup = null;
  if (bp.scene?.boxCavity && bp.scene.boxCavity.frameShape !== 'none' && !layers3d.some((l) => l.kind === 'box_frame')) {
    boxFrameGroup = buildMultiPlyShadowBoxFrame(bp.scene.boxCavity, pbrMaps, backlightUniforms);
    const fz = bp.scene.boxCavity.z ?? 1.38;
    boxFrameGroup.position.z = fz;
    envGroup.add(boxFrameGroup);
    layerEntries.push({
      id: '__preset_box_cavity__',
      group: boxFrameGroup,
      baseX: 0, baseY: 0, baseZ: fz, baseRotZ: 0,
      explodeFactor: 0.55,
      anim: null,
    });
  }

  // Deterministic 3D Dust Motes / Fireflies floating inside the lightbox!
  const motes = [];
  const moteCount = lit3d.moteCount ?? 28;
  if (moteCount > 0) {
    const mRng = makeRng(seed + 509);
    const mGeom = new CircleGeometry(0.032, 6);
    for (let i = 0; i < moteCount; i++) {
      const mMat = new MeshBasicMaterial({
        color: lit3d.moteColor ?? '#fff4c8',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const mm = new Mesh(mGeom, mMat);
      const item = {
        mesh: mm,
        bx: (mRng() - 0.5) * 11.5,
        by: (mRng() - 0.5) * 6.8,
        bz: -2.2 + mRng() * 3.0,
        ph: mRng() * 6.283,
        fr: 0.55 + mRng() * 0.9,
      };
      envGroup.add(mm);
      motes.push(item);
    }
  }

  // --------------------------------------------------------------------------
  // BUILD ALL PARTS AS 3D DIE-CUT PRINTED CARDSTOCK SLABS & WIRE RIG KINEMATICS
  // --------------------------------------------------------------------------
  const partCache = new Map();
  for (const part of (bp.parts || [])) {
    const built = await buildPrintedCardstockPart(part, sharedDefsMarkup, WORLD_SCALE, pbrMaps, backlightUniforms);
    partCache.set(part.id, built);
  }

  const PART_BY_ID = Object.fromEntries((bp.parts || []).map((p) => [p.id, p]));
  const RAW_RIGS = Array.isArray(bp.rigs) && bp.rigs.length > 0 ? bp.rigs : [bp.rig];

  function topoSort(rawBones) {
    const out = [], byP = new Map();
    for (const b of rawBones) {
      const k = b.parent ?? '__root__';
      byP.set(k, [...(byP.get(k) ?? []), b]);
    }
    const visit = (pid) => { for (const b of byP.get(pid) ?? []) { out.push(b); visit(b.id); } };
    visit('__root__');
    return out;
  }

  const RIGS = RAW_RIGS.map((r) => {
    const bones = topoSort(r.bones);
    return { ...r, label: r.label ?? r.characterId ?? r.id, bones, boneById: Object.fromEntries(bones.map((b) => [b.id, b])) };
  });

  const rigStates = {};
  for (const r of RIGS) {
    rigStates[r.id] = {
      rootX: r.rootPos?.x ?? VW * 0.5,
      rootY: r.rootPos?.y ?? VH * 0.72,
      facing: r.facing ?? 1,
      userFlip: 1,
      scale: r.scale ?? 1,
      breath: 0,
      angles: Object.fromEntries(r.bones.map((b) => [b.id, b.rest ?? 0])),
      scales: Object.fromEntries(r.bones.map((b) => [b.id, { x: 1, y: 1 }])),
      variants: Object.fromEntries(Object.entries(r.variants ?? {}).map(([k, list]) => [k, list[0]])),
    };
  }

  function resolvePartId(rigObj, bone) {
    if (bone.variantGroup && bone.variants) {
      const vKey = rigStates[rigObj.id].variants[bone.variantGroup];
      if (vKey && bone.variants[vKey]) return bone.variants[vKey];
    }
    return bone.part;
  }

  function computeWorld(rigObj) {
    const rs = rigStates[rigObj.id];
    const world = {};
    for (const b of rigObj.bones) {
      const localDeg = rs.angles[b.id] ?? 0;
      if (b.parent === null) {
        world[b.id] = { x: rs.rootX, y: rs.rootY, deg: localDeg };
      } else {
        const pw = world[b.parent], pb = rigObj.boneById[b.parent];
        const pp = PART_BY_ID[resolvePartId(rigObj, pb)];
        const anc = pp?.anchors?.[b.attach] ?? pp?.pivot ?? [0, 0];
        const piv = pp?.pivot ?? [0, 0];
        const psc = rs.scales?.[b.parent] ?? { x: 1, y: 1 };
        const lx = (anc[0] - piv[0]) * rs.scale * psc.x;
        const ly = (anc[1] - piv[1]) * rs.scale * psc.y;
        const rad = pw.deg * DEG, c = Math.cos(rad), s = Math.sin(rad);
        world[b.id] = { x: pw.x + lx * c - ly * s, y: pw.y + lx * s + ly * c, deg: pw.deg + localDeg };
      }
    }
    return world;
  }

  const REST_WORLD = {};
  for (const r of RIGS) {
    const w = computeWorld(r);
    const rx = rigStates[r.id].rootX, ry = rigStates[r.id].rootY;
    REST_WORLD[r.id] = {};
    for (const b of r.bones) {
      REST_WORLD[r.id][b.id] = { dx: w[b.id].x - rx, dy: w[b.id].y - ry, deg: w[b.id].deg };
    }
  }

  function solveIk(rigObj, chain, target) {
    const rs = rigStates[rigObj.id], world = computeWorld(rigObj);
    const uB = rigObj.boneById[chain.upper], lB = rigObj.boneById[chain.lower];
    const endB = rigObj.boneById[chain.end];
    if (!uB || !lB || !endB) return;
    const uP = PART_BY_ID[resolvePartId(rigObj, uB)], lP = PART_BY_ID[resolvePartId(rigObj, lB)];
    const uA = uP?.anchors?.[lB.attach], lA = lP?.anchors?.[endB.attach];
    if (!uA || !lA) return;
    const L1 = Math.hypot(uA[0] - uP.pivot[0], uA[1] - uP.pivot[1]) * rs.scale;
    const L2 = Math.hypot(lA[0] - lP.pivot[0], lA[1] - lP.pivot[1]) * rs.scale;
    const off = Math.atan2(uA[1] - uP.pivot[1], uA[0] - uP.pivot[0]);
    const org = world[chain.upper];
    const pDeg = uB.parent != null && world[uB.parent] ? world[uB.parent].deg : 0;
    const dx = target.x - org.x, dy = target.y - org.y;
    const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
    const aim = Math.atan2(dy, dx);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const b = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const bend = chain.bend ?? 1;
    const uLocal = wrapDeg180((aim + bend * a - off) * RAD - pDeg);
    rs.angles[chain.upper] = clamp(uLocal, uB.limits.min, uB.limits.max);
    rs.angles[chain.lower] = clamp(-bend * (Math.PI - b) * RAD, lB.limits.min, lB.limits.max);
  }

  function computeBoneScale(sw, t) {
    if (!sw) return { x: 1, y: 1 };
    const s = Math.sin(t * (sw.freq ?? 2) + (sw.phase ?? 0));
    const ax = sw.ampX ?? sw.amp ?? 0;
    const ay = sw.ampY ?? (sw.amp != null ? -sw.amp : 0);
    return { x: clamp(1 + s * ax, 0.55, 1.55), y: clamp(1 + s * ay, 0.55, 1.55) };
  }

  function computeSpinAngle(sp, baseDeg, t) {
    const speed = typeof sp === 'number' ? sp : (sp.speed ?? 90);
    const off = (typeof sp === 'object' && sp.offset != null) ? sp.offset : baseDeg;
    return (((off + t * speed) % 360) + 540) % 360 - 180;
  }

  function evaluateGroundCurve(curve, xVal, fallbackY) {
    if (!curve) return fallbackY;
    if (curve.kind === 'arch') {
      const cx = curve.cx ?? 0, cy = curve.cy ?? fallbackY;
      const rx = Math.max(1, curve.rx ?? 180), ry = curve.ry ?? 40;
      const u = clamp((xVal - cx) / rx, -1, 1);
      return cy - Math.sqrt(Math.max(0, 1 - u * u)) * ry;
    }
    if (curve.kind === 'parabola') {
      const cx = curve.cx ?? 0, cy = curve.cy ?? fallbackY;
      const rx = Math.max(1, curve.rx ?? 180), ry = curve.ry ?? 36;
      const u = clamp((xVal - cx) / rx, -1.2, 1.2);
      return cy + (u * u) * ry;
    }
    if (curve.kind === 'polyline' && Array.isArray(curve.points) && curve.points.length >= 2) {
      const pts = curve.points;
      if (xVal <= pts[0][0]) return pts[0][1];
      if (xVal >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (xVal >= a[0] && xVal <= b[0]) {
          const t = (xVal - a[0]) / Math.max(0.0001, b[0] - a[0]);
          return lerp(a[1], b[1], t);
        }
      }
    }
    return fallbackY;
  }

  function applyGaitToRig(rigObj, gait, sampleT, travelDir, phaseSpec = null) {
    if (!gait) return;
    const rs = rigStates[rigObj.id];
    const scaleRatio = rs.scale / (rigObj.scale ?? 1);
    const freq = gait.freq ?? 1.0, stride = gait.stride ?? 34, lift = gait.lift ?? 16, bob = gait.bob ?? 5;
    const stanceFrac = clamp(gait.stanceFrac ?? 0.6, 0.25, 0.85);
    const facing = rs.facing >= 0 ? 1 : -1;

    // Optional terrain-following rootY derived from groundCurve at rootX!
    const refChain = gait.chains?.[0] ? rigObj.ik?.[gait.chains[0].ik] : null;
    const refRestEnd = refChain ? REST_WORLD[rigObj.id]?.[refChain.end] : null;
    let yBase = rs.rootY;
    if (gait.groundCurve && refRestEnd) {
      const gAtRoot = evaluateGroundCurve(gait.groundCurve, rs.rootX, yBase + refRestEnd.dy * scaleRatio);
      yBase = gAtRoot - refRestEnd.dy * scaleRatio - (gait.hipClearance ?? 0);
      rs.rootY = yBase;
    }

    // Analytical zero-slide mode: cycle phase is driven directly by horizontal distance traveled!
    const lockTravel = Boolean(gait.lockToTravel && Array.isArray(phaseSpec?.rootX) && Math.abs(phaseSpec.rootX[1] - phaseSpec.rootX[0]) > 2);
    const startX = lockTravel ? phaseSpec.rootX[0] : rs.rootX;
    const stepSpan = Math.max(12, gait.stepSpan ?? stride * 1.15); // distance per half-cycle (1 step)
    const cycleDist = stepSpan * 2.0;
    const travelSign = lockTravel ? (Math.sign(phaseSpec.rootX[1] - phaseSpec.rootX[0]) || 1) : (gait.dir ?? travelDir ?? 1);
    const cycleProgress = lockTravel
      ? ((rs.rootX - startX) * travelSign) / cycleDist
      : (sampleT * freq);
    const omegaT = 2 * Math.PI * cycleProgress + (gait.phase ?? 0);

    rs.rootY = yBase - bob * Math.abs(Math.sin(omegaT));
    if (gait.swayX) rs.rootX += Math.sin(omegaT) * gait.swayX;
    if (gait.spineBone && rigObj.boneById[gait.spineBone]) {
      const sb = rigObj.boneById[gait.spineBone];
      rs.angles[sb.id] = clamp((rs.angles[sb.id] ?? 0) + Math.sin(omegaT) * (gait.spineSway ?? 3.2), sb.limits.min, sb.limits.max);
    }
    if (gait.headBone && rigObj.boneById[gait.headBone]) {
      const hb = rigObj.boneById[gait.headBone];
      rs.angles[hb.id] = clamp((rs.angles[hb.id] ?? 0) - Math.sin(omegaT * 2 - 0.45) * (gait.headBob ?? 2.4), hb.limits.min, hb.limits.max);
    }
    for (const swArm of gait.swingBones ?? []) {
      const ab = rigObj.boneById[swArm.bone];
      if (!ab) continue;
      rs.angles[ab.id] = clamp((rs.angles[ab.id] ?? 0) + Math.sin(2 * Math.PI * (cycleProgress + (swArm.phase ?? 0))) * (swArm.amp ?? 18), ab.limits.min, ab.limits.max);
    }

    for (const chSpec of gait.chains ?? []) {
      const chain = rigObj.ik?.[chSpec.ik];
      const restEnd = chain ? REST_WORLD[rigObj.id]?.[chain.end] : null;
      if (!chain || !restEnd) continue;
      const chLift = chSpec.lift ?? lift;
      const chPhase = chSpec.phase ?? 0;
      const dir = chSpec.dir ?? gait.dir ?? travelDir ?? 1;
      const toeOff = chSpec.toeOff ?? 12, heelStrike = chSpec.heelStrike ?? -8;

      let targetX, targetY, footPitch = 0;

      if (lockTravel) {
        // EXACT ZERO-SLIDE STEP-PINNING:
        // While u < stanceFrac, footWorldX stays mathematically CONSTANT on the bridge/ground!
        const p = cycleProgress + chPhase;
        const stepIdx = Math.floor(p);
        const u = p - stepIdx;
        const pinWorldX = (idx) => startX + travelSign * (idx + stanceFrac * 0.5) * cycleDist + (chSpec.offsetX ?? 0);
        const xCurr = pinWorldX(stepIdx);
        const xNext = pinWorldX(stepIdx + 1);

        let footWorldX = xCurr;
        let dyLift = 0;
        if (u < stanceFrac) {
          const su = u / stanceFrac;
          footWorldX = xCurr; // 0.000 px foot slide!
          footPitch = su < 0.2 ? lerp(heelStrike, 0, su / 0.2) : (su > 0.72 ? lerp(0, toeOff, (su - 0.72) / 0.28) : 0);
        } else {
          const wu = (u - stanceFrac) / (1 - stanceFrac);
          const sw = 0.5 - 0.5 * Math.cos(wu * Math.PI);
          footWorldX = lerp(xCurr, xNext, sw);
          dyLift = -Math.sin(wu * Math.PI) * chLift;
          footPitch = lerp(toeOff, heelStrike, smoothstep(wu));
        }

        // Convert world foot X into solveIk's unflipped local-rig coordinate space
        targetX = rs.rootX + (footWorldX - rs.rootX) * facing;
        const defaultGroundY = chSpec.groundY ?? gait.groundY ?? (yBase + restEnd.dy * scaleRatio + (chSpec.offsetY ?? 0));
        const footGroundY = gait.groundCurve
          ? evaluateGroundCurve(gait.groundCurve, footWorldX, defaultGroundY)
          : defaultGroundY;
        targetY = footGroundY + dyLift;
      } else {
        const u = (((sampleT * freq + chPhase) % 1) + 1) % 1;
        const chStride = chSpec.stride ?? stride;
        const baseEndX = rs.rootX + restEnd.dx * scaleRatio + (chSpec.offsetX ?? 0);
        let dxStride = 0, dyLift = 0;
        if (u < stanceFrac) {
          const su = u / stanceFrac;
          dxStride = dir * lerp(chStride * 0.5, -chStride * 0.5, su);
          footPitch = su < 0.2 ? lerp(heelStrike, 0, su / 0.2) : (su > 0.72 ? lerp(0, toeOff, (su - 0.72) / 0.28) : 0);
        } else {
          const wu = (u - stanceFrac) / (1 - stanceFrac);
          dxStride = dir * lerp(-chStride * 0.5, chStride * 0.5, 0.5 - 0.5 * Math.cos(wu * Math.PI));
          dyLift = -Math.sin(wu * Math.PI) * chLift;
          footPitch = lerp(toeOff, heelStrike, smoothstep(wu));
        }
        targetX = baseEndX + dxStride;
        const footWorldX = rs.rootX + (targetX - rs.rootX) * facing;
        const defaultGroundY = chSpec.groundY ?? gait.groundY ?? (yBase + restEnd.dy * scaleRatio + (chSpec.offsetY ?? 0));
        targetY = (gait.groundCurve ? evaluateGroundCurve(gait.groundCurve, footWorldX, defaultGroundY) : defaultGroundY) + dyLift;
      }

      solveIk(rigObj, chain, { x: targetX, y: targetY });
      const footId = chSpec.footBone ?? chain.end;
      const fBone = footId ? rigObj.boneById[footId] : null;
      if (fBone && fBone.parent && REST_WORLD[rigObj.id]?.[footId]) {
        const wNow = computeWorld(rigObj);
        const targetLocal = wrapDeg180((REST_WORLD[rigObj.id][footId].deg + dir * footPitch) - wNow[fBone.parent].deg);
        rs.angles[footId] = clamp(targetLocal, fBone.limits.min, fBone.limits.max);
      }
    }
  }

  function applyPhaseToRig(rigObj, spec, localT, t) {
    const rs = rigStates[rigObj.id];
    const baseX = rigObj.rootPos?.x ?? VW * 0.5, baseY = rigObj.rootPos?.y ?? VH * 0.72, baseFacing = rigObj.facing ?? 1;
    rs.breath = Math.sin(t * 2.3 + rigObj.id.length * 0.7) * 0.015;
    if (!spec) {
      rs.rootX = baseX; rs.rootY = baseY; rs.facing = baseFacing * rs.userFlip;
      for (const b of rigObj.bones) { rs.angles[b.id] = clamp(b.rest ?? 0, b.limits.min, b.limits.max); rs.scales[b.id] = { x: 1, y: 1 }; }
      return;
    }
    const e = spec.ease === 'back' ? easeOutBack(localT) : (spec.ease === 'linear' ? localT : smoothstep(localT));
    rs.rootX = Array.isArray(spec.rootX) ? lerp(spec.rootX[0], spec.rootX[1], e) : (typeof spec.rootX === 'number' ? spec.rootX : baseX);
    const yLin = Array.isArray(spec.rootY) ? lerp(spec.rootY[0], spec.rootY[1], e) : (typeof spec.rootY === 'number' ? spec.rootY : baseY);
    rs.rootY = yLin - (spec.arcY ? Math.sin(localT * Math.PI) * spec.arcY : 0);
    rs.facing = (spec.facing ?? baseFacing) * rs.userFlip;
    for (const b of rigObj.bones) {
      const k = spec.bones?.[b.id];
      let deg = Array.isArray(k) ? lerp(k[0], k[1], e) : (typeof k === 'number' ? k : (b.rest ?? 0));
      if (spec.spins?.[b.id] != null) deg = computeSpinAngle(spec.spins[b.id], deg, t);
      const wv = spec.waves?.[b.id];
      if (wv) deg += Math.sin(t * wv.freq + (wv.phase ?? 0)) * wv.amp;
      rs.angles[b.id] = clamp(deg, b.limits.min, b.limits.max);
      rs.scales[b.id] = computeBoneScale(spec.scaleWaves?.[b.id], t);
    }
    if (spec.gait) {
      let travelDir = 1;
      if (Array.isArray(spec.rootX) && Math.abs(spec.rootX[1] - spec.rootX[0]) > 1) {
        travelDir = Math.sign((spec.rootX[1] - spec.rootX[0]) * (spec.facing ?? baseFacing)) || 1;
      }
      applyGaitToRig(rigObj, spec.gait, t, travelDir, spec);
    }
  }

  function applyHarmonicToRig(r, hm, t) {
    const rs = rigStates[r.id];
    rs.breath = Math.sin(t * 2.2 + r.id.length * 0.5) * 0.016;
    if (!hm) {
      rs.rootX = r.rootPos?.x ?? VW * 0.5; rs.rootY = r.rootPos?.y ?? VH * 0.7; rs.facing = (r.facing ?? 1) * rs.userFlip;
      for (const b of r.bones) { rs.angles[b.id] = clamp(b.rest ?? 0, b.limits.min, b.limits.max); rs.scales[b.id] = { x: 1, y: 1 }; }
      return;
    }
    rs.rootX = (r.rootPos?.x ?? VW * 0.5) + (hm.rootWaveX ? Math.sin(t * hm.rootWaveX.freq + (hm.rootWaveX.phase ?? 0)) * hm.rootWaveX.amp : 0);
    rs.rootY = (r.rootPos?.y ?? VH * 0.7) + (hm.rootWaveY ? Math.sin(t * hm.rootWaveY.freq + (hm.rootWaveY.phase ?? 0)) * hm.rootWaveY.amp : 0);
    rs.facing = (hm.facing ?? r.facing ?? 1) * rs.userFlip;
    for (const b of r.bones) {
      let deg = hm.base?.[b.id] ?? b.rest ?? 0;
      if (hm.spins?.[b.id] != null) deg = computeSpinAngle(hm.spins[b.id], deg, t);
      const wv = hm.waves?.[b.id];
      if (wv) deg += Math.sin(t * wv.freq + (wv.phase ?? 0)) * wv.amp;
      rs.angles[b.id] = clamp(deg, b.limits.min, b.limits.max);
      rs.scales[b.id] = computeBoneScale(hm.scaleWaves?.[b.id], t);
    }
    if (hm.gait) applyGaitToRig(r, hm.gait, t, 1);
  }

  function evalSingleRigAt(m, r, sampleT) {
    if (m.type === 'cycle' && Array.isArray(m.phases) && m.phases.length > 0) {
      const period = m.period ?? 10;
      const u = (((sampleT % period) + period) % period) / period;
      let phase = m.phases[m.phases.length - 1], lt = 0;
      for (const ph of m.phases) {
        if (u >= ph.from && u <= ph.to) { phase = ph; lt = (u - ph.from) / Math.max(0.0001, ph.to - ph.from); break; }
      }
      const spec = phase.rigs ? phase.rigs[r.id] : (r.id === RIGS[0].id ? phase : null);
      applyPhaseToRig(r, spec, lt, sampleT);
    } else if (m.type === 'harmonic') {
      const hm = m.rigs ? m.rigs[r.id] : (r.id === RIGS[0].id ? m : null);
      applyHarmonicToRig(r, hm, sampleT);
    }
  }

  function applyFollowThroughToRig(m, r, t) {
    const ftBones = r.bones.filter((b) => b.followThrough);
    if (ftBones.length === 0) return;
    const rs = rigStates[r.id];
    const snap = {
      rootX: rs.rootX, rootY: rs.rootY, facing: rs.facing, breath: rs.breath,
      angles: { ...rs.angles },
      scales: Object.fromEntries(Object.entries(rs.scales).map(([k, v]) => [k, { ...v }])),
    };
    const worldNow = computeWorld(r);
    const deltas = {};
    for (const b of ftBones) {
      const ft = b.followThrough, lag = clamp(ft.lag ?? 0.14, 0.02, 0.6);
      evalSingleRigAt(m, r, t - lag);
      const worldLag = computeWorld(r);
      const dx = snap.rootX - rs.rootX, dy = snap.rootY - rs.rootY;
      const vx = Math.abs(dx) < 160 ? (dx / lag) * snap.facing : 0;
      const vy = Math.abs(dy) < 120 ? (dy / lag) : 0;
      const pDegNow = b.parent && worldNow[b.parent] ? worldNow[b.parent].deg : snap.angles[b.id];
      const pDegLag = b.parent && worldLag[b.parent] ? worldLag[b.parent].deg : rs.angles[b.id];
      const dParent = wrapDeg180(pDegLag - pDegNow);
      const velGain = ft.velGain ?? 0.16;
      deltas[b.id] = -vx * velGain + vy * (ft.vertGain ?? velGain * 0.35) + dParent * (ft.rotGain ?? 0.45);
    }
    Object.assign(rs, snap);
    for (const b of ftBones) {
      rs.angles[b.id] = clamp((rs.angles[b.id] ?? 0) + (deltas[b.id] ?? 0), b.limits.min, b.limits.max);
    }
  }

  function applyTremorToRig(r, evalT) {
    if (!r.tremor) return;
    const rs = rigStates[r.id], seedOff = r.id.length * 1.37;
    if (r.tremor.ampX > 0) rs.rootX += Math.sin(evalT * 7.3 + seedOff) * r.tremor.ampX;
    if (r.tremor.ampY > 0) rs.rootY += Math.cos(evalT * 5.9 + seedOff * 1.4) * r.tremor.ampY;
    if (r.tremor.ampDeg > 0 && r.bones.length > 0) {
      const rb = r.bones[0];
      rs.angles[rb.id] = clamp((rs.angles[rb.id] ?? 0) + Math.sin(evalT * 6.4 + seedOff * 0.8) * r.tremor.ampDeg, rb.limits.min, rb.limits.max);
    }
  }

  function isRigBlinking(rigObj, evalT) {
    if (rigObj.blink === false) return false;
    const bl = typeof rigObj.blink === 'object' && rigObj.blink ? rigObj.blink : {};
    const period = bl.period ?? 4.1;
    const dur = bl.duration ?? 0.14;
    const ph = bl.phase ?? (rigObj.id.length * 0.73);
    const loc = (((evalT + ph) % period) + period) % period;
    return loc < dur;
  }

  // Create 3D scene graph nodes for each rig (bone holders + dynamic hoses + strands + silhouette clones)
  const rigSceneNodes = new Map();
  const silhouetteInkMat = new MeshBasicMaterial({ color: '#11141f', side: DoubleSide });

  for (const r of RIGS) {
    const rGroup = new Group();
    rGroup.name = `rig_${r.id}`;
    worldRoot.add(rGroup);

    const boneHolders = new Map();
    for (const b of r.bones) {
      const holder = new Group();
      holder.visible = !b.hiddenInViewer;
      rGroup.add(holder);
      boneHolders.set(b.id, { holder, activePartId: null, activeFlip: null, normalClone: null, flipClone: null });
    }

    // Dynamic 3D hoses & strands groups
    const dynamicGroup = new Group();
    rGroup.add(dynamicGroup);

    rigSceneNodes.set(r.id, { rGroup, boneHolders, dynamicGroup });
  }

  function syncBonePartInstance(bEntry, partId, isFlipped, isBlinking, silhouetteMode, evalT = 0, restPose = false) {
    const built = partCache.get(partId);
    if (!built) return;
    if (bEntry.activePartId !== partId) {
      bEntry.holder.clear();
      if (built.isFlex) {
        bEntry.normalClone = built.makeNormalFlex();
        bEntry.flipClone = built.makeFlippedFlex();
      } else {
        bEntry.normalClone = built.normalMesh.clone();
        bEntry.normalClone.material = [built.normalMesh.material[0].clone(), built.normalMesh.material[1]];
        bEntry.flipClone = built.flippedMesh.clone();
        bEntry.flipClone.material = [built.flippedMesh.material[0].clone(), built.flippedMesh.material[1]];
      }
      bEntry.holder.add(bEntry.normalClone);
      bEntry.holder.add(bEntry.flipClone);
      bEntry.activePartId = partId;
    }
    bEntry.normalClone.visible = !isFlipped;
    bEntry.flipClone.visible = isFlipped;
    const activeObj = isFlipped ? bEntry.flipClone : bEntry.normalClone;

    if (built.isFlex && activeObj.userData?.isFlexGroup) {
      const ud = activeObj.userData;
      if (typeof ud.deformAt === 'function') ud.deformAt(restPose ? 0 : evalT);
      if (silhouetteMode) {
        if (!ud._silMat) {
          ud._silMat = new MeshBasicMaterial({ color: '#11141f', map: built.openTex, alphaTest: 0.45, side: DoubleSide });
          ud._silMat.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
                vec4 sampledDiffuseColor = texture2D( map, vMapUv );
                diffuseColor.a *= sampledDiffuseColor.a;
              #endif`,
            );
          };
        }
        ud.frontMesh.material = ud._silMat;
        ud.backMesh.material = ud._silMat;
        ud.edgeMesh.material = silhouetteInkMat;
      } else {
        ud.frontMesh.material = ud.capMat;
        ud.backMesh.material = ud.capMat;
        ud.edgeMesh.material = ud.edgeMat;
        const targetTex = (isBlinking && built.blinkTex) ? built.blinkTex : built.openTex;
        if (ud.capMat.map !== targetTex) {
          ud.capMat.map = targetTex;
          ud.capMat.needsUpdate = true;
        }
      }
      return;
    }

    if (silhouetteMode) {
      activeObj.userData._savedMat = activeObj.userData._savedMat || activeObj.material;
      activeObj.material = silhouetteInkMat;
    } else {
      if (activeObj.userData._savedMat) activeObj.material = activeObj.userData._savedMat;
      const capMat = activeObj.material[0];
      const targetTex = (isBlinking && built.blinkTex) ? built.blinkTex : built.openTex;
      if (capMat.map !== targetTex) {
        capMat.map = targetTex;
        capMat.needsUpdate = true;
      }
    }
  }

  function rebuildDynamicHosesAndStrands(r, worldMap, evalT, rigBaseZ, explodeMul, silhouetteMode) {
    const nodeInfo = rigSceneNodes.get(r.id);
    const dyn = nodeInfo.dynamicGroup;
    while (dyn.children.length > 0) {
      const ch = dyn.children.pop();
      if (ch.geometry) ch.geometry.dispose();
    }
    const rs = rigStates[r.id];
    const facing = rs.facing >= 0 ? 1 : -1;
    const toStagePt = (lx, ly) => {
      const sx = rs.rootX + (lx - rs.rootX) * facing;
      return [pxToWX(sx), pyToWY(ly)];
    };

    // 1. 3D Extruded Seamless Hoses!
    for (const h of (r.hoses || [])) {
      const p0 = worldMap[h.upper], p1 = worldMap[h.lower], p2 = worldMap[h.end];
      if (!p0 || !p1 || !p2) continue;
      const a = toStagePt(p0.x, p0.y), b = toStagePt(p1.x, p1.y), c = toStagePt(p2.x, p2.y);
      const spine = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, iu = 1 - u;
        spine.push([
          iu * iu * a[0] + 2 * iu * u * b[0] + u * u * c[0],
          iu * iu * a[1] + 2 * iu * u * b[1] + u * u * c[1],
        ]);
      }
      const w0 = (h.widthStart ?? 14) * WORLD_SCALE * rs.scale;
      const w1 = (h.widthEnd ?? 9) * WORLD_SCALE * rs.scale;
      const sh = buildRibbonPolygonPoints(spine, w0, w1);
      if (!sh) continue;
      const hex = (typeof h.fill === 'string' && h.fill.startsWith('#')) ? h.fill : (typeof h.lowerFill === 'string' && h.lowerFill.startsWith('#') ? h.lowerFill : '#d9a074');
      const m = silhouetteMode
        ? new Mesh(new ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), silhouetteInkMat)
        : buildExtrudedShapeMesh(sh, {
            thickness: 0.075, bevel: 0.014, color: hex, edgeColor: h.rimColor?.startsWith?.('#') ? h.rimColor : null, translucency: 0.2,
          }, pbrMaps, backlightUniforms);
      m.position.z = rigBaseZ * explodeMul + (h.z ?? 2) * 0.016 - 0.038;
      dyn.add(m);
    }

    // 2. 3D Extruded Flowing Multi-Link Strands (scarves, ribbons, hair, tails)!
    for (const st of (r.strands || [])) {
      const bW = worldMap[st.bone];
      if (!bW) continue;
      let ax = bW.x, ay = bW.y;
      if (st.anchor) {
        const pSpec = PART_BY_ID[resolvePartId(r, r.boneById[st.bone])];
        const anc = pSpec?.anchors?.[st.anchor];
        if (anc && pSpec) {
          const lx = (anc[0] - pSpec.pivot[0]) * rs.scale;
          const ly = (anc[1] - pSpec.pivot[1]) * rs.scale;
          const rad = bW.deg * DEG;
          ax += lx * Math.cos(rad) - ly * Math.sin(rad);
          ay += lx * Math.sin(rad) + ly * Math.cos(rad);
        }
      }
      const startW = toStagePt(ax, ay);
      const segs = clamp(st.segments ?? 6, 3, 12);
      const totalLen = (st.length ?? 48) * WORLD_SCALE * rs.scale;
      const baseAng = ((st.dirDeg ?? 165) + (st.inheritRot !== false ? bW.deg * 0.35 : 0)) * DEG;
      const dirX = Math.cos(baseAng) * facing;
      const dirY = -Math.sin(baseAng);
      const perpX = -dirY, perpY = dirX;
      const spine = [startW];
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const wave = Math.sin(evalT * (st.waveFreq ?? 3.4) - u * 3.2) * ((st.waveAmp ?? 8) * WORLD_SCALE * u);
        const sag = -((st.sag ?? 6) * WORLD_SCALE) * u * u;
        spine.push([
          startW[0] + dirX * totalLen * u + perpX * wave,
          startW[1] + dirY * totalLen * u + perpY * wave + sag,
        ]);
      }
      const sh = buildRibbonPolygonPoints(
        spine,
        (st.widthStart ?? 10) * WORLD_SCALE * rs.scale,
        (st.widthEnd ?? 3.5) * WORLD_SCALE * rs.scale,
      );
      if (!sh) continue;
      const hex = (typeof st.fill === 'string' && st.fill.startsWith('#')) ? st.fill : '#c94c38';
      const m = silhouetteMode
        ? new Mesh(new ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), silhouetteInkMat)
        : buildExtrudedShapeMesh(sh, {
            thickness: 0.065, bevel: 0.012, color: hex, edgeColor: st.rimColor?.startsWith?.('#') ? st.rimColor : null, translucency: 0.34,
          }, pbrMaps, backlightUniforms);
      m.position.z = rigBaseZ * explodeMul + (st.z ?? 3) * 0.016 - 0.032;
      dyn.add(m);
    }
  }

  // --------------------------------------------------------------------------
  // 2D DIAGNOSTIC OVERLAY (BONES, ANCHORS, LABELS)
  // --------------------------------------------------------------------------
  function drawDiagnosticOverlay(worldSnapshots, showBones, showAnchors) {
    if (!overlayCanvas) return;
    const octx = overlayCanvas.getContext('2d');
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!showBones && !showAnchors) return;

    const cw = overlayCanvas.width, ch = overlayCanvas.height;
    const project3d = (wx, wy, wz) => {
      const v = new Vector3(wx, wy, wz).project(camera);
      return [(v.x * 0.5 + 0.5) * cw, (-v.y * 0.5 + 0.5) * ch];
    };

    for (const snap of worldSnapshots) {
      const { r, worldMap, rigBaseZ, facing } = snap;
      const rs = rigStates[r.id];
      const mapStage = (lx, ly, bz) => {
        const sx = rs.rootX + (lx - rs.rootX) * facing;
        return project3d(pxToWX(sx), pyToWY(ly), rigBaseZ + (bz ?? 0) * 0.016);
      };

      if (showBones) {
        octx.strokeStyle = '#fbbf24';
        octx.lineWidth = 2.4;
        for (const b of r.bones) {
          if (!b.parent) continue;
          const p0 = worldMap[b.parent], p1 = worldMap[b.id];
          const [x0, y0] = mapStage(p0.x, p0.y, b.z);
          const [x1, y1] = mapStage(p1.x, p1.y, b.z);
          octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke();
        }
        for (const b of r.bones) {
          const p = worldMap[b.id];
          const [x, y] = mapStage(p.x, p.y, b.z);
          octx.fillStyle = '#ffffff';
          octx.beginPath(); octx.arc(x, y, 4.2, 0, Math.PI * 2); octx.fill();
          octx.strokeStyle = '#f59e0b'; octx.lineWidth = 1.8; octx.stroke();
        }
      }

      if (showAnchors) {
        for (const b of r.bones) {
          const pSpec = PART_BY_ID[resolvePartId(r, b)];
          const bw = worldMap[b.id];
          for (const [, anc] of Object.entries(pSpec?.anchors || {})) {
            const lx = (anc[0] - pSpec.pivot[0]) * rs.scale;
            const ly = (anc[1] - pSpec.pivot[1]) * rs.scale;
            const rad = bw.deg * DEG;
            const ax = bw.x + lx * Math.cos(rad) - ly * Math.sin(rad);
            const ay = bw.y + lx * Math.sin(rad) + ly * Math.cos(rad);
            const [sx, sy] = mapStage(ax, ay, (b.z ?? 0) + 1);
            octx.fillStyle = '#38bdf8';
            octx.beginPath(); octx.arc(sx, sy, 3.6, 0, Math.PI * 2); octx.fill();
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // PURE FRAME EVALUATOR & RENDERER
  // --------------------------------------------------------------------------
  function evaluateAndRender(t, opts = {}) {
    const {
      presetId = bp.motions?.[0]?.id ?? 'manual',
      restPose = false,
      steppedOverride = null,
      tiltXDeg = 0,
      tiltYDeg = 0,
      explode = 0,
      keyMul = 1.0,
      backMul = 1.0,
      aoMul = 1.0,
      wireframe = false,
      silhouette = false,
      showBones = false,
      showAnchors = false,
      cropRig = null,
      cropPad = 110,
      manualAngles = null,
      activeManualRigId = null,
    } = opts;

    const charFps = steppedOverride != null
      ? steppedOverride
      : Number(bp.scene?.cadence?.charFps ?? 0);
    const evalT = charFps > 0 ? Math.floor(t * charFps) / charFps : t;

    // 1. Evaluate motion or rest pose
    if (restPose) {
      for (const r of RIGS) {
        const rs = rigStates[r.id];
        rs.rootX = r.rootPos?.x ?? VW * 0.5;
        rs.rootY = r.rootPos?.y ?? VH * 0.72;
        rs.facing = (r.facing ?? 1) * rs.userFlip;
        rs.breath = 0;
        for (const b of r.bones) {
          rs.angles[b.id] = clamp(b.rest ?? 0, b.limits.min, b.limits.max);
          rs.scales[b.id] = { x: 1, y: 1 };
        }
      }
    } else if (presetId === 'manual' && manualAngles && activeManualRigId && rigStates[activeManualRigId]) {
      const r = RIGS.find((x) => x.id === activeManualRigId);
      const rs = rigStates[activeManualRigId];
      for (const b of r.bones) {
        rs.angles[b.id] = clamp(manualAngles[b.id] ?? b.rest ?? 0, b.limits.min, b.limits.max);
      }
    } else {
      const m = (bp.motions ?? []).find((x) => x.id === presetId);
      if (m) {
        if (m.type === 'cycle' && Array.isArray(m.phases) && m.phases.length > 0) {
          const period = m.period ?? 10;
          const u = (((evalT % period) + period) % period) / period;
          let phase = m.phases[m.phases.length - 1], lt = 0;
          for (const ph of m.phases) {
            if (u >= ph.from && u <= ph.to) { phase = ph; lt = (u - ph.from) / Math.max(0.0001, ph.to - ph.from); break; }
          }
          if (phase.rigs) for (const r of RIGS) applyPhaseToRig(r, phase.rigs[r.id], lt, evalT);
          else {
            applyPhaseToRig(RIGS[0], phase, lt, evalT);
            for (let i = 1; i < RIGS.length; i++) applyPhaseToRig(RIGS[i], null, lt, evalT);
          }
          for (const r of RIGS) { applyFollowThroughToRig(m, r, evalT); applyTremorToRig(r, evalT); }
        } else if (m.type === 'harmonic') {
          if (m.rigs) for (const r of RIGS) applyHarmonicToRig(r, m.rigs[r.id], evalT);
          else {
            applyHarmonicToRig(RIGS[0], m, evalT);
            for (let i = 1; i < RIGS.length; i++) applyHarmonicToRig(RIGS[i], null, evalT);
          }
          for (const r of RIGS) { applyFollowThroughToRig(m, r, evalT); applyTremorToRig(r, evalT); }
        }
      }
    }

    // 2. Environment visibility, lights, motes & explode Z
    envGroup.visible = !silhouette;
    scene.background.set(silhouette ? '#f4efe6' : bgHex);
    key.intensity = (lit3d.keyLight?.intensity ?? 2.55) * keyMul;
    backlightUniforms.uBacklightGain.value = (lit3d.backlightGain ?? 1.15) * backMul;
    for (const pl of pointLights) {
      const pulse = 1.0 + Math.sin(t * 1.35 + (pl.cfg.phase ?? 0)) * (pl.cfg.pulseAmp ?? 0.04);
      pl.light.intensity = pl.baseIntensity * backMul * pulse;
    }
    if (gtaoPass) gtaoPass.blendIntensity = silhouette ? 0.0 : (lit3d.aoIntensity ?? 0.82) * aoMul;
    if (bloomPass) bloomPass.enabled = !silhouette && (lit3d.bloomStrength ?? 0.20) > 0.01;

    const explodeScale = 1.0 + explode * 1.18;
    for (const entry of layerEntries) {
      let dx = 0, dy = 0, drot = 0;
      if (entry.anim) {
        const a = entry.anim, ph = a.phase ?? 0;
        if (a.driftX) dx = Math.sin(t * (a.freq ?? 0.5) + ph) * a.driftX;
        if (a.driftY) dy = Math.cos(t * (a.freq ?? 0.5) + ph) * a.driftY;
        if (a.swayDeg) drot = Math.sin(t * (a.freq ?? 0.9) + ph) * a.swayDeg * DEG;
      }
      entry.group.position.set(entry.baseX + dx, entry.baseY + dy, entry.baseZ * (1.0 + explode * 1.18 * entry.explodeFactor));
      entry.group.rotation.z = entry.baseRotZ + drot;
    }
    for (const st of subAnimTargets) {
      if (st.anim.flutterDeg) {
        st.node.rotation.y = Math.sin(evalT * (st.anim.freq ?? 5.5) + (st.anim.phase ?? 0)) * st.anim.flutterDeg * DEG;
      }
      if (st.anim.softTuftSway) {
        const w = evalT * (st.anim.freq ?? 1.45) + (st.anim.phase ?? 0);
        st.node.rotation.z = (st.baseRotZ ?? 0) + Math.sin(w) * (st.anim.swayDeg ?? 2.0) * DEG;
        st.node.rotation.x = (st.baseRotX ?? 0) + Math.cos(w * 0.85) * (st.anim.curlDeg ?? 4.0) * DEG;
      }
      if (st.anim.cloudDrift) {
        const w = evalT * (st.anim.freq ?? 0.45) + (st.anim.phase ?? 0);
        st.node.position.x = (st.baseX ?? 0) + Math.sin(w) * (st.anim.driftX ?? 0);
        st.node.position.y = (st.baseY ?? 0) + Math.cos(w * 0.8) * (st.anim.driftY ?? 0);
      }
      if (typeof st.anim.customFlex === 'function') {
        st.anim.customFlex(restPose ? 0 : evalT);
      }
    }
    for (const mt of motes) {
      mt.mesh.position.set(
        mt.bx + Math.sin(t * 0.55 * mt.fr + mt.ph) * 0.35,
        mt.by + Math.cos(t * 0.72 * mt.fr + mt.ph) * 0.24,
        mt.bz * explodeScale,
      );
      mt.mesh.material.opacity = 0.22 + 0.68 * Math.pow((Math.sin(t * 1.8 * mt.fr + mt.ph) + 1) * 0.5, 2);
    }

    // 3. Position all 3D Die-Cut Puppet Rigs
    const worldSnapshots = [];
    for (let rIdx = 0; rIdx < RIGS.length; rIdx++) {
      const r = RIGS[rIdx];
      const rs = rigStates[r.id];
      const facing = rs.facing >= 0 ? 1 : -1;
      const isFlipped = facing < 0;
      const blinkClosed = !restPose && isRigBlinking(r, evalT);
      const worldMap = computeWorld(r);
      const rigBaseZ = (r.z3d != null ? r.z3d : -0.35 + ((r.z ?? rIdx) * 0.14));
      const nodeInfo = rigSceneNodes.get(r.id);

      nodeInfo.rGroup.visible = !cropRig || cropRig === r.id || !silhouette;

      for (let bIdx = 0; bIdx < r.bones.length; bIdx++) {
        const b = r.bones[bIdx];
        const bEntry = nodeInfo.boneHolders.get(b.id);
        if (b.hiddenInViewer) { bEntry.holder.visible = false; continue; }
        bEntry.holder.visible = true;
        const partId = resolvePartId(r, b);
        syncBonePartInstance(bEntry, partId, isFlipped, blinkClosed, silhouette, evalT, restPose);

        const bw = worldMap[b.id];
        const stageX = rs.rootX + (bw.x - rs.rootX) * facing;
        const stageY = bw.y;
        const zOrder = b.z ?? bIdx;
        bEntry.holder.position.set(
          pxToWX(stageX),
          pyToWY(stageY),
          rigBaseZ * explodeScale + zOrder * 0.016,
        );
        const rotRad = (isFlipped ? bw.deg : -bw.deg) * DEG;
        bEntry.holder.rotation.set(0, 0, rotRad);
        const bsc = rs.scales[b.id] ?? { x: 1, y: 1 };
        const breathMul = 1.0 + (b.parent === null ? rs.breath : 0);
        bEntry.holder.scale.set(rs.scale * bsc.x, rs.scale * bsc.y * breathMul, 1.0);
      }

      rebuildDynamicHosesAndStrands(r, worldMap, evalT, rigBaseZ, explodeScale, silhouette);
      worldSnapshots.push({ r, worldMap, rigBaseZ: rigBaseZ * explodeScale, facing });
    }

    // Toggle wireframe if requested
    worldRoot.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material !== silhouetteInkMat) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) if ('wireframe' in m) m.wireframe = wireframe;
      }
    });

    // 4. Camera framing (full stage OR close-up cropRig for Model Sheets & Hero Closeups!)
    let targetLook = baseLookAt.clone();
    let dist = camDist;
    if (cropRig && rigStates[cropRig]) {
      const snap = worldSnapshots.find((s) => s.r.id === cropRig);
      if (snap) {
        // Compute stage bounding box of all bones in cropRig
        let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
        const rs = rigStates[cropRig];
        for (const b of snap.r.bones) {
          const pSpec = PART_BY_ID[resolvePartId(snap.r, b)];
          const bw = snap.worldMap[b.id];
          const sx = rs.rootX + (bw.x - rs.rootX) * snap.facing;
          const sy = bw.y;
          const radR = Math.max(pSpec?.size?.[0] ?? 60, pSpec?.size?.[1] ?? 60) * 0.65 * rs.scale;
          minSX = Math.min(minSX, sx - radR); maxSX = Math.max(maxSX, sx + radR);
          minSY = Math.min(minSY, sy - radR); maxSY = Math.max(maxSY, sy + radR);
        }
        const cxW = pxToWX((minSX + maxSX) * 0.5);
        const cyW = pyToWY((minSY + maxSY) * 0.5);
        const spanH = Math.max(1.8, (maxSY - minSY + cropPad * 1.4) * WORLD_SCALE);
        const spanW = Math.max(2.4, (maxSX - minSX + cropPad * 1.4) * WORLD_SCALE) / camera.aspect;
        const fitH = Math.max(spanH, spanW);
        targetLook.set(cxW, cyW, snap.rigBaseZ);
        dist = (fitH * 0.5) / Math.tan((fov * 0.5) * DEG);
      }
    }

    const driftAmp = (!restPose && !cropRig && !silhouette) ? (bp.scene?.cadence?.cameraDrift ?? 0.12) * 0.08 : 0;
    const yaw = tiltXDeg * DEG + Math.sin(t * 0.42) * driftAmp * DEG;
    const pitch = tiltYDeg * DEG + Math.cos(t * 0.34) * driftAmp * 0.6 * DEG;
    camera.position.set(
      targetLook.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      targetLook.y + Math.sin(pitch) * dist,
      targetLook.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(targetLook);
    camera.updateMatrixWorld();

    if (silhouette) {
      renderer.render(scene, camera);
    } else {
      if (!composer) {
        composerW = glCanvas.width || 1280;
        composerH = glCanvas.height || 720;
        buildComposer(composerW, composerH);
      }
      composer.render();
    }

    drawDiagnosticOverlay(worldSnapshots, showBones, showAnchors);
  }

  function resize(w, h) {
    const rw = Math.max(320, Math.round(w));
    const rh = Math.max(180, Math.round(h));
    if (composer && composerW === rw && composerH === rh && glCanvas.width === rw && glCanvas.height === rh) return;
    renderer.setSize(rw, rh, false);
    if (overlayCanvas) { overlayCanvas.width = rw; overlayCanvas.height = rh; }
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    composerW = rw;
    composerH = rh;
    buildComposer(rw, rh);
  }

  return {
    renderer,
    scene,
    camera,
    RIGS,
    rigStates,
    evaluateAndRender,
    resize,
  };
}

function buildFoldedRidgeMeshWrapper(layer, pbrMaps, backlightUniforms) {
  return buildFoldedRidgeRelief(layer, pbrMaps, backlightUniforms);
}
