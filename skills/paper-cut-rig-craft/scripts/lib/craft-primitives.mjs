/**
 * Theme-agnostic, deterministic parametric SVG craft primitives for paper-cut-rig-craft.
 * Pure geometry & paper-craft math — zero hardcoded characters, creatures, or themes.
 * Zero external dependencies, seeded PRNG only, fail-closed on invalid parameters.
 */

function failParam(detail) {
  throw new Error(`CRAFT_PARAM_INVALID: ${detail}`);
}

function assertFiniteNum(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    failParam(`${name} must be a finite number`);
  }
}

function assertPoints(points, minLen, name) {
  if (!Array.isArray(points) || points.length < minLen) {
    failParam(`${name} must be an array of at least ${minLen} [x, y] points`);
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      failParam(`${name}[${i}] must be a finite [x, y] pair`);
    }
  }
}

const fmt = (n) => Number(n.toFixed(2));

export function makeSeededRng(seed = 1337) {
  let s = (Math.trunc(Number(seed) || 1) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Converts a polyline/polygon into a hand-cut deckle paper edge SVG path `d`.
 */
export function deckleEdgePath(points, opts = {}) {
  assertPoints(points, 2, 'points');
  const amplitude = opts.amplitude ?? 1.4;
  const segmentLen = opts.segmentLen ?? 10;
  const closed = opts.closed ?? true;
  assertFiniteNum(amplitude, 'amplitude');
  assertFiniteNum(segmentLen, 'segmentLen');
  if (segmentLen <= 0.5) failParam('segmentLen must be > 0.5');
  if (amplitude < 0) failParam('amplitude must be >= 0');

  const rng = makeSeededRng(opts.seed ?? 101);
  const out = [];
  const edgeCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(len / segmentLen));
    const nx = len > 1e-6 ? -dy / len : 0;
    const ny = len > 1e-6 ? dx / len : 0;

    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const jitter = s === 0 ? 0 : (rng() - 0.5) * 2 * amplitude;
      out.push([a[0] + dx * u + nx * jitter, a[1] + dy * u + ny * jitter]);
    }
  }
  if (!closed) {
    out.push(points[points.length - 1]);
  }
  if (out.length === 0) return '';
  let d = `M${fmt(out[0][0])} ${fmt(out[0][1])}`;
  for (let i = 1; i < out.length; i++) {
    d += ` L${fmt(out[i][0])} ${fmt(out[i][1])}`;
  }
  if (closed) d += ' Z';
  return d;
}

/**
 * Generates a closed, smoothly tapered ribbon SVG path `d` along a centerline.
 * Useful for scarves, locks of hair, tails, banners, ribbons, streams, fins, or plumes.
 */
export function taperedRibbon(centerPoints, opts = {}) {
  assertPoints(centerPoints, 2, 'centerPoints');
  const widthStart = opts.widthStart ?? 12;
  const widthEnd = opts.widthEnd ?? 2;
  const curvePower = opts.curvePower ?? 1.0;
  assertFiniteNum(widthStart, 'widthStart');
  assertFiniteNum(widthEnd, 'widthEnd');
  assertFiniteNum(curvePower, 'curvePower');
  if (widthStart <= 0 || widthEnd < 0) failParam('widthStart must be > 0 and widthEnd >= 0');
  if (curvePower <= 0) failParam('curvePower must be > 0');

  const n = centerPoints.length;
  const leftPts = [];
  const rightPts = [];
  const cumLen = [0];
  for (let i = 1; i < n; i++) {
    cumLen.push(cumLen[i - 1] + Math.hypot(centerPoints[i][0] - centerPoints[i - 1][0], centerPoints[i][1] - centerPoints[i - 1][1]));
  }
  const totalLen = Math.max(1e-6, cumLen[n - 1]);

  for (let i = 0; i < n; i++) {
    const prev = centerPoints[Math.max(0, i - 1)];
    const next = centerPoints[Math.min(n - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tMag = Math.hypot(tx, ty) || 1;
    const nx = -ty / tMag;
    const ny = tx / tMag;
    const u = Math.pow(cumLen[i] / totalLen, curvePower);
    const hw = (widthStart + (widthEnd - widthStart) * u) * 0.5;
    leftPts.push([centerPoints[i][0] + nx * hw, centerPoints[i][1] + ny * hw]);
    rightPts.push([centerPoints[i][0] - nx * hw, centerPoints[i][1] - ny * hw]);
  }

  let d = `M${fmt(leftPts[0][0])} ${fmt(leftPts[0][1])}`;
  for (let i = 1; i < n; i++) {
    const p0 = leftPts[i - 1];
    const p1 = leftPts[i];
    const mx = (p0[0] + p1[0]) * 0.5;
    const my = (p0[1] + p1[1]) * 0.5;
    d += ` Q${fmt(p0[0])} ${fmt(p0[1])} ${fmt(mx)} ${fmt(my)}`;
  }
  d += ` L${fmt(leftPts[n - 1][0])} ${fmt(leftPts[n - 1][1])}`;

  // Tip cap
  const endCenter = centerPoints[n - 1];
  const prevEnd = centerPoints[n - 2];
  const etx = endCenter[0] - prevEnd[0];
  const ety = endCenter[1] - prevEnd[1];
  const eMag = Math.hypot(etx, ety) || 1;
  const tipExtend = Math.max(1, widthEnd * 0.6);
  const tipX = endCenter[0] + (etx / eMag) * tipExtend;
  const tipY = endCenter[1] + (ety / eMag) * tipExtend;
  d += ` Q${fmt(tipX)} ${fmt(tipY)} ${fmt(rightPts[n - 1][0])} ${fmt(rightPts[n - 1][1])}`;

  for (let i = n - 2; i >= 0; i--) {
    const p0 = rightPts[i + 1];
    const p1 = rightPts[i];
    const mx = (p0[0] + p1[0]) * 0.5;
    const my = (p0[1] + p1[1]) * 0.5;
    d += ` Q${fmt(p0[0])} ${fmt(p0[1])} ${fmt(mx)} ${fmt(my)}`;
  }
  d += ` L${fmt(rightPts[0][0])} ${fmt(rightPts[0][1])}`;

  // Rounded start cap
  const startCenter = centerPoints[0];
  const nextStart = centerPoints[1];
  const stx = startCenter[0] - nextStart[0];
  const sty = startCenter[1] - nextStart[1];
  const sMag = Math.hypot(stx, sty) || 1;
  const capX = startCenter[0] + (stx / sMag) * (widthStart * 0.45);
  const capY = startCenter[1] + (sty / sMag) * (widthStart * 0.45);
  d += ` Q${fmt(capX)} ${fmt(capY)} ${fmt(leftPts[0][0])} ${fmt(leftPts[0][1])} Z`;
  return d;
}

/**
 * Generates a scalloped paper-cut border SVG path `d` along a polyline.
 * Useful for layered canopies, clouds, eaves, fabric hems, waves, or arches.
 */
export function scallopBorder(points, opts = {}) {
  assertPoints(points, 2, 'points');
  const depth = opts.depth ?? 7;
  const scallops = opts.scallops ?? 5;
  const side = opts.side ?? 1;
  const closeTo = opts.closeTo ?? null;
  assertFiniteNum(depth, 'depth');
  assertFiniteNum(scallops, 'scallops');
  if (scallops < 1) failParam('scallops must be >= 1');

  // Resample polyline to equal-arc segments
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (total <= 1e-6) failParam('points must span non-zero length');

  const sampleAt = (dist) => {
    for (let i = 1; i < points.length; i++) {
      if (dist <= cum[i] || i === points.length - 1) {
        const segLen = Math.max(1e-6, cum[i] - cum[i - 1]);
        const u = Math.max(0, Math.min(1, (dist - cum[i - 1]) / segLen));
        return [
          points[i - 1][0] + (points[i][0] - points[i - 1][0]) * u,
          points[i - 1][1] + (points[i][1] - points[i - 1][1]) * u,
        ];
      }
    }
    return points[points.length - 1];
  };

  const count = Math.round(scallops);
  const start = sampleAt(0);
  let d = `M${fmt(start[0])} ${fmt(start[1])}`;
  for (let i = 0; i < count; i++) {
    const a = sampleAt((i / count) * total);
    const b = sampleAt(((i + 1) / count) * total);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const seg = Math.hypot(dx, dy) || 1;
    const nx = (-dy / seg) * side;
    const ny = (dx / seg) * side;
    const cx = (a[0] + b[0]) * 0.5 + nx * depth * 1.45;
    const cy = (a[1] + b[1]) * 0.5 + ny * depth * 1.45;
    d += ` Q${fmt(cx)} ${fmt(cy)} ${fmt(b[0])} ${fmt(b[1])}`;
  }

  if (Array.isArray(closeTo) && closeTo.length > 0) {
    assertPoints(closeTo, 1, 'closeTo');
    for (const pt of closeTo) d += ` L${fmt(pt[0])} ${fmt(pt[1])}`;
    d += ' Z';
  }
  return d;
}

/**
 * Generates a multi-row shingled organic/architectural fan SVG fragment.
 * Each petal has two-tone origami shading + subtle highlight vein.
 */
export function layeredShingleFan(opts = {}) {
  const cx = opts.cx ?? 0;
  const cy = opts.cy ?? 0;
  const rows = Math.trunc(opts.rows ?? 3);
  const countPerRow = Math.trunc(opts.countPerRow ?? 5);
  const radius = opts.radius ?? 32;
  const spreadDeg = opts.spreadDeg ?? 130;
  const baseAngleDeg = opts.baseAngleDeg ?? -90;
  const petalW = opts.petalW ?? 11;
  const petalH = opts.petalH ?? 20;
  assertFiniteNum(cx, 'cx');
  assertFiniteNum(cy, 'cy');
  assertFiniteNum(radius, 'radius');
  assertFiniteNum(petalW, 'petalW');
  assertFiniteNum(petalH, 'petalH');
  if (rows < 1 || countPerRow < 1 || radius <= 0 || petalW <= 0 || petalH <= 0) {
    failParam('rows, countPerRow, radius, petalW, petalH must be positive');
  }

  const palette = Array.isArray(opts.palette) && opts.palette.length > 0
    ? opts.palette
    : [['#547a63', '#3b5c49', '#8cb398'], ['#688f76', '#466a54', '#a4c7ae']];
  const rng = makeSeededRng(opts.seed ?? 307);

  let out = '<g>';
  // Render back/outer row first, front/inner row last (shingle depth order)
  for (let r = rows - 1; r >= 0; r--) {
    const rowU = rows === 1 ? 0.5 : r / (rows - 1);
    const rowRad = radius * (0.35 + 0.65 * rowU);
    const n = Math.max(1, countPerRow + (r % 2 === 0 ? 0 : 1));
    const scale = 0.78 + 0.28 * rowU;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const jitter = (rng() - 0.5) * 6;
      const angDeg = baseAngleDeg + (u - 0.5) * spreadDeg + jitter;
      const angRad = (angDeg * Math.PI) / 180;
      const px = cx + Math.cos(angRad) * rowRad;
      const py = cy + Math.sin(angRad) * rowRad;
      const pal = palette[(r + i) % palette.length];
      const cA = pal[0];
      const cB = pal[1] ?? cA;
      const cC = pal[2] ?? '#ffffff';
      const w = petalW * scale;
      const h = petalH * scale;
      const rot = angDeg + 90;
      out += `<g transform="translate(${fmt(px)},${fmt(py)}) rotate(${fmt(rot)})">`
        + `<path d="M0 ${fmt(-h)} C${fmt(w * 0.8)} ${fmt(-h * 0.65)} ${fmt(w * 0.75)} ${fmt(-h * 0.12)} 0 ${fmt(h * 0.14)} Z" fill="${cA}"/>`
        + `<path d="M0 ${fmt(-h)} C${fmt(-w * 0.8)} ${fmt(-h * 0.65)} ${fmt(-w * 0.75)} ${fmt(-h * 0.12)} 0 ${fmt(h * 0.14)} Z" fill="${cB}"/>`
        + `<path d="M0 ${fmt(-h * 0.88)} L0 ${fmt(h * 0.05)}" stroke="${cC}" stroke-width="0.9" opacity="0.45"/>`
        + '</g>';
    }
  }
  out += '</g>';
  return out;
}

/**
 * Generates a 3D origami-folded two-facet paper plane `<g>` along a center crease.
 */
export function origamiCrease(opts = {}) {
  assertPoints([opts.p1, opts.p2, opts.left, opts.right], 4, 'origamiCrease vertices');
  const { p1, p2, left, right } = opts;
  const lightFill = opts.lightFill ?? '#e8decb';
  const darkFill = opts.darkFill ?? '#b5a48a';
  const ridgeColor = opts.ridgeColor ?? '#ffffff';
  const ridgeOpacity = opts.ridgeOpacity ?? 0.35;
  assertFiniteNum(ridgeOpacity, 'ridgeOpacity');
  return `<g>`
    + `<path d="M${fmt(p1[0])} ${fmt(p1[1])} L${fmt(left[0])} ${fmt(left[1])} L${fmt(p2[0])} ${fmt(p2[1])} Z" fill="${lightFill}"/>`
    + `<path d="M${fmt(p1[0])} ${fmt(p1[1])} L${fmt(right[0])} ${fmt(right[1])} L${fmt(p2[0])} ${fmt(p2[1])} Z" fill="${darkFill}"/>`
    + `<line x1="${fmt(p1[0])}" y1="${fmt(p1[1])}" x2="${fmt(p2[0])}" y2="${fmt(p2[1])}" stroke="${ridgeColor}" stroke-width="1.1" opacity="${fmt(ridgeOpacity)}"/>`
    + '</g>';
}

/**
 * Generates a delicate hand-stitched paper-craft border along any polyline.
 */
export function stitchTrack(points, opts = {}) {
  assertPoints(points, 2, 'points');
  const dash = opts.dash ?? 4;
  const gap = opts.gap ?? 3.5;
  const stroke = opts.stroke ?? '#fff6e0';
  const width = opts.width ?? 1.1;
  const opacity = opts.opacity ?? 0.65;
  assertFiniteNum(dash, 'dash');
  assertFiniteNum(gap, 'gap');
  assertFiniteNum(width, 'width');
  assertFiniteNum(opacity, 'opacity');
  if (dash <= 0 || gap <= 0 || width <= 0) failParam('dash, gap, width must be > 0');

  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${fmt(points[i][0])} ${fmt(points[i][1])}`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${fmt(width)}" stroke-dasharray="${fmt(dash)} ${fmt(gap)}" stroke-linecap="round" opacity="${fmt(opacity)}"/>`;
}

/**
 * Generates an intricate cut-paper kirigami ornament (rosette, starburst, or diamond).
 */
export function kirigamiCutout(opts = {}) {
  const cx = opts.cx ?? 0;
  const cy = opts.cy ?? 0;
  const r = opts.r ?? 24;
  const petals = Math.trunc(opts.petals ?? 8);
  const innerR = opts.innerR ?? r * 0.34;
  const fill = opts.fill ?? '#ebd6b0';
  const shadowFill = opts.shadowFill ?? '#b5925f';
  const cutoutFill = opts.cutoutFill ?? '#1c1826';
  const accentFill = opts.accentFill ?? '#fff5dc';
  assertFiniteNum(cx, 'cx');
  assertFiniteNum(cy, 'cy');
  assertFiniteNum(r, 'r');
  assertFiniteNum(innerR, 'innerR');
  if (r <= 2 || petals < 3 || innerR <= 0 || innerR >= r) {
    failParam('r must be > 2, petals >= 3, and 0 < innerR < r');
  }

  let out = `<g transform="translate(${fmt(cx)},${fmt(cy)})">`;
  // Outer scalloped silhouette
  let outerD = '';
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const aMid = ((i + 0.5) / petals) * Math.PI * 2;
    const a1 = ((i + 1) / petals) * Math.PI * 2;
    const x0 = Math.cos(a0) * (r * 0.82);
    const y0 = Math.sin(a0) * (r * 0.82);
    const xm = Math.cos(aMid) * (r * 1.12);
    const ym = Math.sin(aMid) * (r * 1.12);
    const x1 = Math.cos(a1) * (r * 0.82);
    const y1 = Math.sin(a1) * (r * 0.82);
    outerD += (i === 0 ? `M${fmt(x0)} ${fmt(y0)}` : '') + ` Q${fmt(xm)} ${fmt(ym)} ${fmt(x1)} ${fmt(y1)}`;
  }
  outerD += ' Z';
  out += `<path d="${outerD}" fill="${fill}"/>`;
  out += `<circle cx="0" cy="0" r="${fmt(r * 0.72)}" fill="none" stroke="${shadowFill}" stroke-width="1.2" opacity="0.6"/>`;

  // Negative-space diamond cutouts per petal
  for (let i = 0; i < petals; i++) {
    const a = ((i + 0.5) / petals) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    const d1 = innerR + (r - innerR) * 0.16;
    const d2 = innerR + (r - innerR) * 0.74;
    const dm = (d1 + d2) * 0.5;
    const w = (r * Math.PI) / (petals * 2.7);
    out += `<path transform="rotate(${fmt(deg)})" d="M${fmt(d1)} 0 L${fmt(dm)} ${fmt(-w)} L${fmt(d2)} 0 L${fmt(dm)} ${fmt(w)} Z" fill="${cutoutFill}" opacity="0.86"/>`;
  }

  out += `<circle cx="0" cy="0" r="${fmt(innerR)}" fill="${shadowFill}" opacity="0.85"/>`;
  out += `<circle cx="0" cy="0" r="${fmt(innerR * 0.55)}" fill="${accentFill}"/>`;
  out += '</g>';
  return out;
}
