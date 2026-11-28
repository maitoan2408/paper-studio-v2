/**
 * Deterministic Storybook Scene Craft Library for paper-cut-rig-craft (v3.0).
 * Combines multi-octave 2D fbm / ridged-fbm terrain + pseudo-3D directional slope
 * shadow facets (adapted from MIT joel-marks/svg-landscape & LingDong-/shan-shui-inf)
 * with asymmetric crown/occlusion botanical architecture & split-tone foliage
 * (adapted from MIT MengTo/Skills).
 *
 * 100% deterministic (seeded Mulberry32 PRNG only), zero external dependencies,
 * 100% theme-agnostic.
 */

const DEG = Math.PI / 180;

function f1(n) {
  return Number(n).toFixed(1);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mulberry32(seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2d(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2d(x, y, seed = 1) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy, seed);
  const b = hash2d(ix + 1, iy, seed);
  const c = hash2d(ix, iy + 1, seed);
  const d = hash2d(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2d(x, y, seed = 1, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2d(x * freq, y * freq, seed + i * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / (norm || 1);
}

export function ridgedFbm2d(x, y, seed = 1, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = noise2d(x * freq, y * freq, seed + i * 131);
    const r = 1 - Math.abs(2 * n - 1);
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / (norm || 1);
}

/**
 * Generates a natural fbm / ridged-fbm mountain or hillside silhouette with
 * directional pseudo-3D leeward shadow facets, optional sunlit rim, and snow caps.
 */
export function terrainRidgeLayer(opts = {}) {
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const bleed = opts.bleed ?? 56;
  const baseY = opts.baseY ?? 320;
  const amplitude = opts.amplitude ?? 58;
  const seed = opts.seed ?? 101;
  const mode = opts.mode ?? 'fbm';
  const freq = opts.freq ?? 0.0042;
  const octaves = opts.octaves ?? 4;
  const step = Math.max(6, opts.step ?? 12);
  const fill = opts.fill ?? '#4a6b82';
  const shadowFill = opts.shadowFill ?? '#2c4659';
  const shadowOpacity = clamp(opts.shadowOpacity ?? 0.46, 0.05, 0.95);
  const lightAngleDeg = opts.lightAngleDeg ?? 135;
  const lightFromLeft = Math.cos(lightAngleDeg * DEG) <= 0;
  const rimColor = opts.rimColor ?? null;
  const rimOpacity = clamp(opts.rimOpacity ?? 0.42, 0.05, 0.95);
  const idPrefix = opts.idPrefix ?? null;

  let defsSvg = '';
  let bodyFill = fill;
  if (idPrefix && opts.topColor && opts.bottomColor) {
    const gid = `${idPrefix}_ridgeG`;
    defsSvg += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${opts.topColor}"/><stop offset="100%" stop-color="${opts.bottomColor}"/></linearGradient>`;
    bodyFill = `url(#${gid})`;
  }

  const pts = [];
  const xStart = -bleed;
  const xEnd = width + bleed;
  for (let x = xStart; x <= xEnd; x += step) {
    const u = clamp(x / width, 0, 1);
    const nVal = mode === 'ridged'
      ? ridgedFbm2d((x + 300) * freq, seed * 0.17, seed, octaves)
      : fbm2d((x + 300) * freq, seed * 0.17, seed, octaves);
    const macro = typeof opts.macroOffsetFn === 'function' ? opts.macroOffsetFn(u) : 0;
    const y = baseY - (nVal - 0.45) * 2 * amplitude + macro;
    pts.push([x, y]);
  }

  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${f1(pts[i][0])} ${f1(pts[i][1])}`;
  }
  d += ` L${f1(xEnd)} ${f1(height + 40)} L${f1(xStart)} ${f1(height + 40)} Z`;

  // Identify leeward slopes for pseudo-3D geological shadow facets
  const runs = [];
  let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const dy = pts[i + 1][1] - pts[i][1];
    const inShadow = lightFromLeft ? dy > 0.35 : dy < -0.35;
    if (inShadow) {
      if (!cur) cur = { s: i, e: i + 1 };
      else cur.e = i + 1;
    } else if (cur) {
      if (cur.e - cur.s >= 2) runs.push(cur);
      cur = null;
    }
  }
  if (cur && cur.e - cur.s >= 2) runs.push(cur);

  // Guarantee at least 1 subtle facet even on gentle rolling hills
  if (runs.length === 0 && pts.length >= 6) {
    const mid = Math.floor(pts.length * 0.45);
    runs.push({ s: mid, e: Math.min(pts.length - 1, mid + 4) });
  }

  const rng = mulberry32(seed + 71);
  let facetsSvg = '';
  for (const r of runs) {
    const pPeak = lightFromLeft ? pts[r.s] : pts[r.e];
    const pBase = lightFromLeft ? pts[r.e] : pts[r.s];
    const spanX = Math.abs(pBase[0] - pPeak[0]);
    const dropH = clamp(spanX * (0.52 + rng() * 0.38) + Math.abs(pBase[1] - pPeak[1]) * 0.7, 22, height - pPeak[1] + 20);
    const spineShift = (lightFromLeft ? 1 : -1) * spanX * (0.18 + rng() * 0.25);
    const midX = pPeak[0] + spineShift;
    const midY = pPeak[1] + dropH;
    const kinkX = lerp(pPeak[0], midX, 0.52) + (rng() - 0.5) * 14;
    const kinkY = lerp(pPeak[1], midY, 0.48);

    let fd = `M${f1(pts[r.s][0])} ${f1(pts[r.s][1])}`;
    for (let k = r.s + 1; k <= r.e; k++) fd += ` L${f1(pts[k][0])} ${f1(pts[k][1])}`;
    if (lightFromLeft) {
      fd += ` L${f1(midX)} ${f1(midY)} L${f1(kinkX)} ${f1(kinkY)} Z`;
    } else {
      fd += ` L${f1(kinkX)} ${f1(kinkY)} L${f1(midX)} ${f1(midY)} Z`;
    }
    facetsSvg += `<path d="${fd}" fill="${shadowFill}" opacity="${shadowOpacity.toFixed(2)}"/>`;
  }

  let snowSvg = '';
  if (opts.snowCap) {
    const snowFill = opts.snowFill ?? '#f4f9ff';
    for (let i = 2; i < pts.length - 3; i++) {
      if (pts[i][1] <= pts[i - 1][1] && pts[i][1] <= pts[i + 1][1] && pts[i][1] < baseY + amplitude * 0.15) {
        const lIdx = Math.max(0, i - 3);
        const rIdx = Math.min(pts.length - 1, i + 3);
        let sd = `M${f1(pts[lIdx][0])} ${f1(pts[lIdx][1])}`;
        for (let k = lIdx + 1; k <= rIdx; k++) sd += ` L${f1(pts[k][0])} ${f1(pts[k][1])}`;
        const dipY = Math.max(pts[lIdx][1], pts[rIdx][1]) + 8 + rng() * 10;
        sd += ` Q${f1(pts[i][0] + (lightFromLeft ? -6 : 6))} ${f1(dipY)} ${f1(pts[lIdx][0])} ${f1(pts[lIdx][1])} Z`;
        snowSvg += `<path d="${sd}" fill="${snowFill}" opacity="0.9"/>`;
        i += 3;
      }
    }
  }

  let rimSvg = '';
  if (rimColor) {
    let rd = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const dy = pts[i + 1][1] - pts[i][1];
      const windward = lightFromLeft ? dy <= 0.4 : dy >= -0.4;
      if (windward) {
        rd += `M${f1(pts[i][0])} ${f1(pts[i][1])} L${f1(pts[i + 1][0])} ${f1(pts[i + 1][1])} `;
      }
    }
    if (rd) rimSvg = `<path d="${rd.trim()}" fill="none" stroke="${rimColor}" stroke-width="1.5" stroke-linecap="round" opacity="${rimOpacity.toFixed(2)}"/>`;
  }

  const filt = opts.gouache ? ' filter="url(#gouacheGrain)"' : '';
  const svg = `<g${filt}><path d="${d}" fill="${bodyFill}"/>${facetsSvg}${snowSvg}${rimSvg}</g>`;
  return { svg, defsSvg, shadowBandCount: runs.length, points: pts };
}

/**
 * Generates an asymmetric, storybook-crafted tree (pine, oak, birch, willow)
 * with crooked flared trunk, exposed forked branches, crown-to-occlusion shading,
 * and optional sculpted snow pillows. Zero mirror symmetry.
 */
export function storyTree(opts = {}) {
  const idPrefix = String(opts.idPrefix ?? 'stree').replace(/[^A-Za-z0-9_-]/g, '');
  const species = opts.species ?? 'pine';
  const x = opts.x ?? 200;
  const y = opts.y ?? 420;
  const h = opts.height ?? 200;
  const w = opts.width ?? h * (species === 'pine' ? 0.56 : 0.74);
  const seed = opts.seed ?? 55;
  const rng = mulberry32(seed);
  const lean = opts.lean ?? (rng() - 0.46) * h * 0.09;

  const trunkDark = opts.trunkDark ?? (species === 'birch' ? '#9ba3ad' : '#38231a');
  const trunkLight = opts.trunkLight ?? (species === 'birch' ? '#eef2f6' : '#6e4936');
  const folLight = opts.foliageLight ?? (species === 'pine' ? '#3d7367' : '#6fa352');
  const folMid = opts.foliageMid ?? (species === 'pine' ? '#244d47' : '#44753b');
  const folDark = opts.foliageDark ?? (species === 'pine' ? '#142f2e' : '#264927');
  const snow = Boolean(opts.snow);
  const snowLight = opts.snowLight ?? '#ffffff';
  const snowShadow = opts.snowShadow ?? '#bfd7ee';

  const trunkG = `${idPrefix}_trG`;
  const canG = `${idPrefix}_cnG`;
  const snowG = `${idPrefix}_snG`;
  let defsSvg = `<linearGradient id="${trunkG}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${trunkLight}"/><stop offset="58%" stop-color="${trunkDark}"/><stop offset="100%" stop-color="${trunkDark}"/></linearGradient>`;
  defsSvg += `<radialGradient id="${canG}" cx="34%" cy="26%" r="74%"><stop offset="0%" stop-color="${folLight}"/><stop offset="58%" stop-color="${folMid}"/><stop offset="100%" stop-color="${folDark}"/></radialGradient>`;
  if (snow) {
    defsSvg += `<linearGradient id="${snowG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${snowLight}"/><stop offset="72%" stop-color="#e8f3fc"/><stop offset="100%" stop-color="${snowShadow}"/></linearGradient>`;
  }

  // Crooked tapered trunk with flared root buttresses
  const baseHalf = Math.max(4.0, h * (species === 'birch' ? 0.024 : (species === 'pine' ? 0.046 : 0.036)));
  const topHalf = Math.max(1.5, baseHalf * 0.24);
  const topY = -h * (species === 'pine' ? 0.88 : 0.58);
  const midX = lean * 0.42 + (rng() - 0.5) * h * 0.06;
  const midY = topY * 0.52;

  const trunkD = [
    `M${f1(-baseHalf * 1.65)} ${f1(4)}`,
    `Q${f1(-baseHalf * 0.85)} ${f1(-h * 0.08)} ${f1(midX - baseHalf * 0.55)} ${f1(midY)}`,
    `Q${f1(lean - topHalf * 1.4)} ${f1(topY * 0.82)} ${f1(lean - topHalf)} ${f1(topY)}`,
    `L${f1(lean + topHalf)} ${f1(topY)}`,
    `Q${f1(lean + topHalf * 1.5)} ${f1(topY * 0.82)} ${f1(midX + baseHalf * 0.55)} ${f1(midY)}`,
    `Q${f1(baseHalf * 0.9)} ${f1(-h * 0.07)} ${f1(baseHalf * 1.7)} ${f1(4)}`,
    `Q0 ${f1(8)} ${f1(-baseHalf * 1.65)} ${f1(4)} Z`,
  ].join(' ');

  let barkDetail = '';
  if (species === 'birch') {
    for (let i = 0; i < 6; i++) {
      const by = -h * (0.10 + i * 0.08);
      const bx = lerp(0, lean, (i + 1) / 8);
      barkDetail += `<path d="M${f1(bx - baseHalf * 0.45)} ${f1(by)} Q${f1(bx)} ${f1(by - 1.5)} ${f1(bx + baseHalf * 0.35)} ${f1(by + 0.8)}" stroke="#2b2f36" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.75"/>`;
    }
  } else {
    barkDetail += `<path d="M${f1(-baseHalf * 0.45)} 0 Q${f1(midX - baseHalf * 0.18)} ${f1(midY)} ${f1(lean)} ${f1(topY * 0.88)}" stroke="${trunkLight}" stroke-width="1.4" fill="none" opacity="0.45"/>`;
  }

  let branchesSvg = '';
  let canopyBack = '';
  let canopyFront = '';

  if (species === 'pine') {
    const tiers = opts.tiers ?? 5;
    for (let i = 0; i < tiers; i++) {
      const u = i / Math.max(1, tiers - 1);
      const ty = -h * lerp(0.24, 0.86, u);
      const tx = lerp(0, lean, u) + (rng() - 0.5) * 6;
      const tierSpan = w * lerp(1.0, 0.30, Math.pow(u, 0.88));
      const asym = (i % 2 === 0 ? 1 : -1) * (0.12 + rng() * 0.14);
      const leftReach = tierSpan * (0.52 + asym);
      const rightReach = tierSpan * (0.52 - asym);
      const tierH = h * lerp(0.24, 0.16, u);
      const apexY = ty - tierH;
      const droopL = ty + (6 + rng() * 10);
      const droopR = ty + (4 + rng() * 11);

      if (i < tiers - 1) {
        branchesSvg += `<path d="M${f1(tx)} ${f1(ty + 3)} Q${f1(tx - leftReach * 0.42)} ${f1(ty + 6)} ${f1(tx - leftReach * 0.65)} ${f1(droopL - 2)}" stroke="${trunkDark}" stroke-width="${f1(Math.max(1.8, (1 - u) * 4.2))}" stroke-linecap="round" fill="none"/>`;
        branchesSvg += `<path d="M${f1(tx)} ${f1(ty + 2)} Q${f1(tx + rightReach * 0.4)} ${f1(ty + 5)} ${f1(tx + rightReach * 0.62)} ${f1(droopR - 3)}" stroke="${trunkDark}" stroke-width="${f1(Math.max(1.6, (1 - u) * 3.8))}" stroke-linecap="round" fill="none"/>`;
      }

      const backD = [
        `M${f1(tx)} ${f1(apexY + 3)}`,
        `C${f1(tx - leftReach * 0.42)} ${f1(apexY + tierH * 0.46)} ${f1(tx - leftReach * 0.84)} ${f1(ty - 2)} ${f1(tx - leftReach * 0.96)} ${f1(droopL + 5)}`,
        `Q${f1(tx - leftReach * 0.45)} ${f1(droopL + 11)} ${f1(tx + 3)} ${f1(ty + 9)}`,
        `Q${f1(tx + rightReach * 0.5)} ${f1(droopR + 12)} ${f1(tx + rightReach * 1.02)} ${f1(droopR + 5)}`,
        `C${f1(tx + rightReach * 0.85)} ${f1(ty - 3)} ${f1(tx + rightReach * 0.42)} ${f1(apexY + tierH * 0.44)} ${f1(tx)} ${f1(apexY + 3)} Z`,
      ].join(' ');
      canopyBack += `<path d="${backD}" fill="${folDark}"/>`;

      const midNotchL = tx - leftReach * (0.48 + rng() * 0.1);
      const midNotchR = tx + rightReach * (0.46 + rng() * 0.1);
      const boughD = [
        `M${f1(tx + (rng() - 0.5) * 3)} ${f1(apexY)}`,
        `C${f1(tx - leftReach * 0.34)} ${f1(apexY + tierH * 0.42)} ${f1(tx - leftReach * 0.78)} ${f1(ty - 6)} ${f1(tx - leftReach)} ${f1(droopL)}`,
        `Q${f1(tx - leftReach * 0.74)} ${f1(droopL + 7)} ${f1(midNotchL)} ${f1(ty + 3)}`,
        `Q${f1(tx - leftReach * 0.22)} ${f1(droopL + 9)} ${f1(tx + (rng() - 0.5) * 6)} ${f1(ty + 5)}`,
        `Q${f1(tx + rightReach * 0.24)} ${f1(droopR + 9)} ${f1(midNotchR)} ${f1(ty + 2)}`,
        `Q${f1(tx + rightReach * 0.76)} ${f1(droopR + 7)} ${f1(tx + rightReach)} ${f1(droopR)}`,
        `C${f1(tx + rightReach * 0.76)} ${f1(ty - 7)} ${f1(tx + rightReach * 0.35)} ${f1(apexY + tierH * 0.4)} ${f1(tx + (rng() - 0.5) * 3)} ${f1(apexY)} Z`,
      ].join(' ');
      canopyFront += `<path d="${boughD}" fill="url(#${canG})"/>`;

      if (snow) {
        const sL = leftReach * (0.78 + rng() * 0.14);
        const sR = rightReach * (0.68 + rng() * 0.14);
        const snowD = [
          `M${f1(tx)} ${f1(apexY - 1.5)}`,
          `C${f1(tx - sL * 0.38)} ${f1(apexY + tierH * 0.36)} ${f1(tx - sL * 0.82)} ${f1(ty - 8)} ${f1(tx - sL)} ${f1(droopL - 3)}`,
          `Q${f1(tx - sL * 0.62)} ${f1(droopL + 3)} ${f1(tx - sL * 0.32)} ${f1(ty - 4)}`,
          `Q${f1(tx - 4)} ${f1(ty + 1)} ${f1(tx + sR * 0.34)} ${f1(ty - 5)}`,
          `Q${f1(tx + sR * 0.68)} ${f1(droopR + 2)} ${f1(tx + sR)} ${f1(droopR - 4)}`,
          `C${f1(tx + sR * 0.78)} ${f1(ty - 9)} ${f1(tx + sR * 0.35)} ${f1(apexY + tierH * 0.34)} ${f1(tx)} ${f1(apexY - 1.5)} Z`,
        ].join(' ');
        canopyFront += `<path d="${snowD}" fill="url(#${snowG})"/>`;
      }
    }
  } else {
    // Broadleaf / Oak / Birch / Willow: forked crooked limbs + 13-scallop leafy foliage masses (zero smooth balloons!)
    const forkY = topY + h * 0.10;
    const limbs = [
      { tx: lean - w * 0.33, ty: topY - h * 0.05, r: w * 0.25 },
      { tx: lean + w * 0.31, ty: topY - h * 0.01, r: w * 0.24 },
      { tx: lean - w * 0.11, ty: -h * 0.80, r: w * 0.30 },
      { tx: lean + w * 0.15, ty: -h * 0.72, r: w * 0.25 },
      { tx: lean + (rng() - 0.5) * w * 0.18, ty: -h * 0.61, r: w * 0.22 },
    ];
    for (const lb of limbs) {
      const mx = lerp(lean * 0.75, lb.tx, 0.5) + (rng() - 0.5) * 10;
      const my = lerp(forkY, lb.ty, 0.42);
      branchesSvg += `<path d="M${f1(lean * 0.75)} ${f1(forkY)} Q${f1(mx)} ${f1(my)} ${f1(lb.tx)} ${f1(lb.ty + lb.r * 0.22)}" stroke="url(#${trunkG})" stroke-width="${f1(Math.max(2.0, baseHalf * 0.5))}" stroke-linecap="round" fill="none"/>`;
      branchesSvg += `<path d="M${f1(mx)} ${f1(my)} L${f1(lb.tx + (rng() - 0.5) * 18)} ${f1(lb.ty + 6)}" stroke="${trunkDark}" stroke-width="${f1(Math.max(1.2, baseHalf * 0.26))}" stroke-linecap="round" fill="none"/>`;
    }

    const buildLeafyCluster = (cx, cy, rx, ry, rotDeg, fillRef, cusps = 13) => {
      const pts = [];
      for (let i = 0; i < cusps; i++) {
        const a = (i / cusps) * Math.PI * 2;
        const flatBottom = Math.sin(a) > 0 ? 0.82 : 1.04;
        const radMul = (0.84 + rng() * 0.24) * flatBottom;
        pts.push([cx + Math.cos(a) * rx * radMul, cy + Math.sin(a) * ry * radMul, a]);
      }
      let d = '';
      for (let i = 0; i < cusps; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % cusps];
        const midA = p0[2] + (Math.PI / cusps);
        const crestR = 6 + rng() * (rx * 0.18);
        const mx = (p0[0] + p1[0]) * 0.5 + Math.cos(midA) * crestR;
        const my = (p0[1] + p1[1]) * 0.5 + Math.sin(midA) * crestR * 0.85;
        d += i === 0 ? `M${f1(p0[0])} ${f1(p0[1])} ` : '';
        d += `Q${f1(mx)} ${f1(my)} ${f1(p1[0])} ${f1(p1[1])} `;
      }
      return `<path d="${d}Z" fill="${fillRef}" transform="rotate(${f1(rotDeg)} ${f1(cx)} ${f1(cy)})"/>`;
    };

    for (const lb of limbs) {
      canopyBack += buildLeafyCluster(lb.tx + 4, lb.ty + 7, lb.r * 1.02, lb.r * 0.72, (rng() - 0.5) * 12, folDark, 12);
    }
    for (const lb of limbs) {
      canopyFront += buildLeafyCluster(lb.tx, lb.ty, lb.r, lb.r * 0.70, (rng() - 0.5) * 12, `url(#${canG})`, 13);
      // Sunlit upper crown tuft
      canopyFront += buildLeafyCluster(lb.tx - lb.r * 0.16, lb.ty - lb.r * 0.20, lb.r * 0.52, lb.r * 0.34, -6, folLight, 9);
      if (snow) {
        canopyFront += buildLeafyCluster(lb.tx - 2, lb.ty - lb.r * 0.28, lb.r * 0.74, lb.r * 0.28, -4, `url(#${snowG})`, 10);
      }
    }
    // Delicate individual split-tone leaves around perimeter for airy storybook silhouette
    for (let k = 0; k < 10; k++) {
      const lb = limbs[k % limbs.length];
      const la = (k / 10) * Math.PI * 2 - 0.6;
      const lx = lb.tx + Math.cos(la) * lb.r * 1.02;
      const ly = lb.ty + Math.sin(la) * lb.r * 0.74;
      const lrot = (la * 180) / Math.PI + 90;
      canopyFront += `<path d="M0 -6 C3 -3 3 2 0 6 C-3 2 -3 -3 0 -6 Z" fill="${k % 2 === 0 ? folLight : folMid}" transform="translate(${f1(lx)},${f1(ly)}) rotate(${f1(lrot)})"/>`;
    }
    if (species === 'willow') {
      for (let k = 0; k < 9; k++) {
        const wx = lean + lerp(-w * 0.42, w * 0.42, k / 8) + (rng() - 0.5) * 8;
        const wy0 = topY - h * 0.05 + Math.abs(k - 4) * 6;
        const wy1 = wy0 + h * (0.28 + rng() * 0.16);
        canopyFront += `<path d="M${f1(wx)} ${f1(wy0)} Q${f1(wx + lean * 0.18)} ${f1((wy0 + wy1) * 0.5)} ${f1(wx + (rng() - 0.5) * 10)} ${f1(wy1)}" stroke="${folLight}" stroke-width="2.1" stroke-linecap="round" fill="none" opacity="0.82"/>`;
      }
    }
  }

  const filt = opts.gouache === false ? '' : ' filter="url(#gouacheGrain)"';
  const svg = `<g transform="translate(${f1(x)},${f1(y)})"${filt}>${canopyBack}<path d="${trunkD}" fill="url(#${trunkG})"/>${barkDetail}${branchesSvg}${canopyFront}</g>`;
  return { svg, defsSvg };
}

/**
 * Generates an organic split-tone veined foliage spray / shrub cluster
 * (left half sunlit, right half shaded, delicate midrib vein).
 */
export function foliageSpray(opts = {}) {
  const x = opts.x ?? 120;
  const y = opts.y ?? 480;
  const count = Math.max(3, opts.count ?? 7);
  const spread = opts.spread ?? 48;
  const height = opts.height ?? 50;
  const seed = opts.seed ?? 33;
  const rng = mulberry32(seed);
  const palette = opts.palette ?? [
    ['#528a6e', '#2f5c48', '#9ad1b0'],
    ['#3d7362', '#21473d', '#84bfa6'],
    ['#6aa173', '#3e6e49', '#b6e3ba'],
  ];

  let inner = '';
  for (let i = 0; i < count; i++) {
    const u = count > 1 ? i / (count - 1) : 0.5;
    const ang = lerp(-56, 56, u) + (rng() - 0.5) * 14;
    const ox = lerp(-spread * 0.45, spread * 0.45, u) + (rng() - 0.5) * 6;
    const lh = height * (0.62 + Math.sin(u * Math.PI) * 0.38) * (0.85 + rng() * 0.3);
    const lw = lh * (0.24 + rng() * 0.08);
    const bend = (rng() - 0.5) * lw * 0.8;
    const cols = palette[i % palette.length];
    const cLight = cols[0];
    const cDark = cols[1] ?? cols[0];
    const cVein = cols[2] ?? '#ffffff';

    inner += `<g transform="translate(${f1(ox)},0) rotate(${f1(ang)})">`;
    inner += `<path d="M0 0 C${f1(-lw * 1.15)} ${f1(-lh * 0.34)} ${f1(bend - lw * 0.85)} ${f1(-lh * 0.76)} ${f1(bend)} ${f1(-lh)} Q${f1(bend * 0.5)} ${f1(-lh * 0.5)} 0 0 Z" fill="${cLight}"/>`;
    inner += `<path d="M0 0 Q${f1(bend * 0.5)} ${f1(-lh * 0.5)} ${f1(bend)} ${f1(-lh)} C${f1(bend + lw * 0.85)} ${f1(-lh * 0.76)} ${f1(lw * 1.15)} ${f1(-lh * 0.34)} 0 0 Z" fill="${cDark}"/>`;
    inner += `<path d="M0 -2 Q${f1(bend * 0.5)} ${f1(-lh * 0.5)} ${f1(bend)} ${f1(-lh * 0.92)}" stroke="${cVein}" stroke-width="0.9" stroke-linecap="round" fill="none" opacity="0.55"/>`;
    if (opts.snow && i % 2 === 0) {
      inner += `<path d="M${f1(bend)} ${f1(-lh)} C${f1(bend - lw * 0.6)} ${f1(-lh * 0.82)} ${f1(-lw * 0.5)} ${f1(-lh * 0.65)} 0 ${f1(-lh * 0.68)} Q${f1(bend * 0.5)} ${f1(-lh * 0.84)} ${f1(bend)} ${f1(-lh)} Z" fill="#f2f8ff" opacity="0.9"/>`;
    }
    inner += '</g>';
  }

  if (opts.berryColor) {
    for (let b = 0; b < 3; b++) {
      const bx = (rng() - 0.5) * spread * 0.55;
      const by = -height * (0.28 + rng() * 0.35);
      inner += `<circle cx="${f1(bx)}" cy="${f1(by)}" r="3.1" fill="${opts.berryColor}"/><circle cx="${f1(bx - 0.9)}" cy="${f1(by - 0.9)}" r="1.0" fill="#ffffff" opacity="0.65"/>`;
    }
  }

  return `<g transform="translate(${f1(x)},${f1(y)})">${inner}</g>`;
}

/**
 * Generates a perspective-tapered S-curve storybook trail or stream with a
 * recessed cut-paper bank lip and subtle stepping-stone / ripple craft accents.
 */
export function windingPath(opts = {}) {
  const pts = Array.isArray(opts.points) && opts.points.length >= 2
    ? opts.points
    : [[480, 400], [440, 465], [360, 540]];
  const w0 = opts.widthStart ?? 20;
  const w1 = opts.widthEnd ?? 112;
  const fill = opts.fill ?? '#e6d2b5';
  const bankFill = opts.bankFill ?? '#bfa582';
  const lipOffset = opts.lipOffset ?? 4.5;
  const seed = opts.seed ?? 19;
  const rng = mulberry32(seed);

  const steps = 18;
  const sampleSpline = (u) => {
    if (pts.length === 2) {
      return [lerp(pts[0][0], pts[1][0], u), lerp(pts[0][1], pts[1][1], u)];
    }
    const segs = pts.length - 1;
    const su = clamp(u * segs, 0, segs - 1e-6);
    const idx = Math.floor(su);
    const lt = su - idx;
    const p0 = pts[Math.max(0, idx - 1)];
    const p1 = pts[idx];
    const p2 = pts[Math.min(pts.length - 1, idx + 1)];
    const p3 = pts[Math.min(pts.length - 1, idx + 2)];
    const t2 = lt * lt;
    const t3 = t2 * lt;
    const cx = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * lt + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
    const cy = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * lt + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
    return [cx, cy];
  };

  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = sampleSpline(u);
    const pNext = sampleSpline(Math.min(1, u + 0.03));
    const pPrev = sampleSpline(Math.max(0, u - 0.03));
    const tx = pNext[0] - pPrev[0];
    const ty = pNext[1] - pPrev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const halfW = 0.5 * lerp(w0, w1, Math.pow(u, 1.25));
    samples.push({ x: p[0], y: p[1], nx: -ty / tl, ny: tx / tl, halfW, u });
  }

  const buildStrip = (extraW, dyShift) => {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const s = samples[i];
      const lx = s.x + s.nx * (s.halfW + extraW);
      const ly = s.y + s.ny * (s.halfW + extraW) + dyShift;
      d += (i === 0 ? 'M' : ' L') + `${f1(lx)} ${f1(ly)}`;
    }
    for (let i = steps; i >= 0; i--) {
      const s = samples[i];
      const rx = s.x - s.nx * (s.halfW + extraW);
      const ry = s.y - s.ny * (s.halfW + extraW) + dyShift;
      d += ` L${f1(rx)} ${f1(ry)}`;
    }
    return d + ' Z';
  };

  let stonesSvg = '';
  if (opts.stoneColor) {
    for (let k = 1; k <= 5; k++) {
      const u = k / 6;
      const s = samples[Math.round(u * steps)];
      const ox = (rng() - 0.5) * s.halfW * 0.85;
      const rx = lerp(3.5, 11, u) * (0.85 + rng() * 0.3);
      const ry = rx * 0.42;
      stonesSvg += `<ellipse cx="${f1(s.x + ox)}" cy="${f1(s.y + 1)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${opts.stoneColor}" opacity="0.52"/>`;
    }
  }

  return `<g><path d="${buildStrip(lipOffset, 2.5)}" fill="${bankFill}"/><path d="${buildStrip(0, 0)}" fill="${fill}"/>${stonesSvg}</g>`;
}

/**
 * Generates an organic hand-drawn / scissor-cut wobbly quadratic Bézier path from control points.
 * Adapted from MIT lemomo-ai/lemo-opuscar paper-popup (smoothClosed / wobbly geometry).
 */
export function wobblyPath(points, opts = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('CRAFT_INVALID_ARGS: wobblyPath requires at least 2 [x, y] points');
  }
  const closed = opts.closed !== false;
  const amp = clamp(opts.amp ?? 1.8, 0, 20);
  const seed = opts.seed ?? 17;
  const subdiv = Math.max(1, Math.min(4, Math.trunc(opts.subdivisions ?? 2)));
  const rng = mulberry32(seed);

  const dense = [];
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const tx = p1[0] - p0[0];
    const ty = p1[1] - p0[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    for (let s = 0; s < subdiv; s++) {
      const u = s / subdiv;
      const jitter = (s === 0 && !closed && i === 0) ? 0 : (rng() - 0.5) * 2 * amp;
      dense.push([lerp(p0[0], p1[0], u) + nx * jitter, lerp(p0[1], p1[1], u) + ny * jitter]);
    }
  }
  if (!closed) {
    const last = points[points.length - 1];
    dense.push([last[0], last[1]]);
  }

  const n = dense.length;
  if (closed) {
    const mid = (a, b) => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
    const start = mid(dense[n - 1], dense[0]);
    let d = `M${f1(start[0])} ${f1(start[1])}`;
    for (let i = 0; i < n; i++) {
      const p = dense[i];
      const m = mid(p, dense[(i + 1) % n]);
      d += ` Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
    }
    return d + ' Z';
  }
  let d = `M${f1(dense[0][0])} ${f1(dense[0][1])}`;
  for (let i = 1; i < n - 1; i++) {
    const mx = (dense[i][0] + dense[i + 1][0]) * 0.5;
    const my = (dense[i][1] + dense[i + 1][1]) * 0.5;
    d += ` Q${f1(dense[i][0])} ${f1(dense[i][1])} ${f1(mx)} ${f1(my)}`;
  }
  d += ` L${f1(dense[n - 1][0])} ${f1(dense[n - 1][1])}`;
  return d;
}

/**
 * Generates crisp Pop-Up Book crescent shading (fills clipped silhouette with shade,
 * then stamps shifted base color inside so a clean hard shadow crescent remains).
 * Adapted from MIT lemomo-ai/lemo-opuscar paper-popup crescent().
 */
export function crescentShadePath(opts = {}) {
  const idPrefix = String(opts.idPrefix ?? 'cr').replace(/[^A-Za-z0-9_-]/g, '');
  const pathD = opts.pathD;
  if (typeof pathD !== 'string' || !pathD.trim()) {
    throw new Error('CRAFT_INVALID_ARGS: crescentShadePath requires non-empty pathD');
  }
  const baseFill = opts.baseFill ?? '#f4a261';
  const shadeFill = opts.shadeFill ?? '#c86d3b';
  const dx = Number(opts.dx ?? 6);
  const dy = Number(opts.dy ?? 4);
  const ink = opts.stroke ?? null;
  const inkW = Number(opts.strokeWidth ?? 2.2);
  const clipId = `${idPrefix}_crClip`;
  const defsSvg = `<clipPath id="${clipId}"><path d="${pathD}"/></clipPath>`;
  const outline = ink ? `<path d="${pathD}" fill="none" stroke="${ink}" stroke-width="${f1(inkW)}" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  const svg = `<g><g clip-path="url(#${clipId})"><path d="${pathD}" fill="${shadeFill}"/><path d="${pathD}" fill="${baseFill}" transform="translate(${f1(-dx)},${f1(-dy)})"/></g>${outline}</g>`;
  return { svg, defsSvg };
}

/**
 * Generates carved openwork paper-cut geometry using SVG fill-rule="evenodd".
 * Adapted from MIT lemomo-ai/lemo-opuscar shadow-puppet & papercut-red.
 */
export function openworkCutout(opts = {}) {
  const outerD = opts.outerD;
  if (typeof outerD !== 'string' || !outerD.trim()) {
    throw new Error('CRAFT_INVALID_ARGS: openworkCutout requires outerD');
  }
  const holes = Array.isArray(opts.holes) ? opts.holes.filter((h) => typeof h === 'string' && h.trim()) : [];
  const fill = opts.fill ?? '#b8211a';
  const stroke = opts.stroke ?? null;
  const strokeW = Number(opts.strokeWidth ?? 1.2);
  const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="${f1(strokeW)}" stroke-linejoin="round"` : '';
  const combined = [outerD.trim(), ...holes.map((h) => h.trim())].join(' ');
  return `<path d="${combined}" fill="${fill}" fill-rule="evenodd"${strokeAttr}/>`;
}

