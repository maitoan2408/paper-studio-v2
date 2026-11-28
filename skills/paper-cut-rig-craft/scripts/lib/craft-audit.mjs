/**
 * Objective, theme-agnostic Craft Complexity & Materiality auditor for paper-cut-rig-craft.
 * Shared by validate_pack.mjs and render_audit.mjs.
 * Evaluates vector sculpting richness, tonal layering, and paper-cut materiality without
 * relying on theme names or hardcoded characters.
 */

function stripDefs(svg) {
  if (typeof svg !== 'string') return '';
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '');
}

export function analyzeSvgCraft(svgMarkup, partId = 'part') {
  const body = stripDefs(svgMarkup);
  const pathTags = body.match(/<path\b[^>]*>/gi) ?? [];
  const basicTags = body.match(/<(circle|ellipse|rect|polygon|polyline|line)\b[^>]*>/gi) ?? [];
  const pathCount = pathTags.length;
  const basicShapeCount = basicTags.length;
  const totalPrimitives = pathCount + basicShapeCount;

  let curvedPathCount = 0;
  for (const tag of pathTags) {
    const dMatch = tag.match(/\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const dVal = dMatch ? (dMatch[1] ?? dMatch[2] ?? '') : '';
    if (/[CQSTA]/i.test(dVal)) curvedPathCount++;
  }

  const fills = new Set();
  for (const m of body.matchAll(/\bfill\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const v = (m[1] ?? m[2] ?? '').trim().toLowerCase();
    if (v && v !== 'none') fills.add(v);
  }

  const hasGradientOrPattern = /fill\s*=\s*["']url\(#/i.test(body);
  const hasPattern = /url\(#pat-/i.test(body) || /<pattern\b/i.test(svgMarkup ?? '');
  const hasClipPath = /clip-path\s*=\s*["']url\(#/i.test(body) || /<clipPath\b/i.test(svgMarkup ?? '');
  const hasBevel = /filter\s*=\s*["']url\(#(?:paperBevel|gouacheGrain|cutoutBorder|backlitPulp)/i.test(body);
  const hasOpacityLayer = /\bopacity\s*=\s*["']0?\.[1-8]/i.test(body);
  const hasStrokeDetail = /\bstroke\s*=\s*["'](?!none)/i.test(body);
  const hasStitch = /stroke-dasharray\s*=/i.test(body);

  let score = 0;
  // 1. Silhouette & multi-layer count (max 35)
  if (totalPrimitives >= 6) score += 35;
  else if (totalPrimitives >= 4) score += 28;
  else if (totalPrimitives === 3) score += 20;
  else if (totalPrimitives === 2) score += 11;
  else if (totalPrimitives === 1) score += 4;

  // 2. Sculpted organic curve work vs raw geometric primitives (max 20)
  if (curvedPathCount >= 3) score += 20;
  else if (curvedPathCount === 2) score += 15;
  else if (curvedPathCount === 1) score += 10;
  else if (pathCount >= 2) score += 8;

  // 3. Tonal depth: multi-tone fills, gradients, clipped shading, or opacity planes (max 20)
  if (fills.size >= 3) score += 10;
  else if (fills.size === 2) score += 6;
  if (hasGradientOrPattern) score += 6;
  if (hasClipPath || hasOpacityLayer) score += 4;

  // 4. Tactile paper materiality: bevel rim and/or cardstock pattern (max 15)
  if (hasBevel) score += 9;
  if (hasPattern) score += 6;

  // 5. Micro-craft: creases, highlights, stitches, line work (max 10)
  if (hasStrokeDetail) score += 7;
  if (hasStitch) score += 3;

  score = Math.min(100, score);

  const isBarePrimitive = totalPrimitives <= 2 || (pathCount === 0 && totalPrimitives <= 3);
  return {
    id: partId,
    totalPrimitives,
    pathCount,
    curvedPathCount,
    basicShapeCount,
    distinctFills: fills.size,
    hasGradientOrPattern,
    hasPattern,
    hasClipPath,
    hasBevel,
    hasStrokeDetail,
    isBarePrimitive,
    craftScore: score,
  };
}

export function auditPartsCraft(partsEntries, heroPartIds = null) {
  const heroSet = heroPartIds instanceof Set && heroPartIds.size > 0 ? heroPartIds : null;
  const partReports = [];
  const craftWarnings = [];

  for (const entry of partsEntries) {
    const m = analyzeSvgCraft(entry.svg, entry.id);
    const isHero = heroSet ? heroSet.has(entry.id) : true;
    m.isHero = isHero;
    partReports.push(m);

    if (isHero && (m.isBarePrimitive || m.craftScore < 45)) {
      const reasons = [];
      if (m.totalPrimitives <= 2) reasons.push(`only ${m.totalPrimitives} shape(s)`);
      if (m.pathCount === 0) reasons.push('uses only raw geometric primitives (circle/rect/polygon) with zero sculpted <path> curves');
      if (!m.hasBevel && !m.hasPattern) reasons.push('missing tactile paperBevel or cardstock pattern');
      if (!m.hasStrokeDetail && m.distinctFills < 2) reasons.push('flat single tone without creases or highlight rim');
      craftWarnings.push({
        code: 'CRAFT_TOO_SIMPLE',
        where: `part:${entry.id}`,
        craftScore: m.craftScore,
        detail: `Hero part "${entry.id}" looks under-crafted (${reasons.join('; ')}). Sculpt with multi-layer <path> curves, clipped/tonal shadow planes, url(#paperBevel), cardstock pattern, or Modular Kit components.`,
      });
    }
  }

  const heroReports = partReports.filter((p) => p.isHero);
  const pool = heroReports.length > 0 ? heroReports : partReports;
  const avgScore = pool.length > 0
    ? Math.round(pool.reduce((acc, p) => acc + p.craftScore, 0) / pool.length)
    : 0;
  const bevelCoverage = pool.length > 0
    ? Number((pool.filter((p) => p.hasBevel).length / pool.length).toFixed(2))
    : 0;
  const materialCoverage = pool.length > 0
    ? Number((pool.filter((p) => p.hasGradientOrPattern || p.hasPattern).length / pool.length).toFixed(2))
    : 0;

  let grade = 'PRIMITIVE';
  if (avgScore >= 80 && craftWarnings.length === 0) grade = 'PRODUCTION';
  else if (avgScore >= 65) grade = 'POLISHED';
  else if (avgScore >= 45) grade = 'DEMO';

  return {
    overallCraftScore: avgScore,
    grade,
    heroPartCount: pool.length,
    flaggedHeroParts: craftWarnings.length,
    bevelCoverage,
    materialCoverage,
    parts: partReports,
    craftWarnings,
  };
}
