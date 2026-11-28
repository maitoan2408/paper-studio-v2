/**
 * Shared fail-closed SVG allowlist & <defs> reference validator
 * for paper-cut-rig-craft (compiler & pack validator).
 * Zero external dependencies, 100% theme-agnostic.
 */

export const ALLOWED_SVG_TAGS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'lineargradient', 'radialgradient', 'stop',
  'clippath', 'mask', 'pattern', 'use', 'symbol', 'filter', 'feblend',
  'fecolormatrix', 'fecomposite', 'fedropshadow', 'feflood', 'fegaussianblur',
  'femerge', 'femergenode', 'feoffset', 'feturbulence', 'fedisplacementmap',
  'fecomponenttransfer', 'fefunca', 'fefuncr', 'fefuncg', 'fefuncb', 'femorphology',
]);

const OPEN_TAG = /<([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
const CLOSE_TAG = /<\/([A-Za-z][\w:.-]*)\s*>/g;
const ATTR = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;
const LOCAL_URL_REF = /url\(\s*['"]?#([A-Za-z_][\w:.-]*)['"]?\s*\)/gi;

export const PAPER_TEX_BASE_FREQ = '0.06 0.72';

export const ALLOWED_MATERIAL_TYPES = new Set([
  'linen',
  'crosshatch',
  'kraft',
  'ribbed',
  'dots',
  'vellum',
]);

export const BUILTIN_MATERIAL_DEFS = [
  { id: 'pat-linen', type: 'linen', color: '#ffffff', altColor: '#000000', opacity: 0.14, scale: 1 },
  { id: 'pat-crosshatch', type: 'crosshatch', color: '#000000', altColor: '#ffffff', opacity: 0.12, scale: 1 },
  { id: 'pat-kraft', type: 'kraft', color: '#2b1d12', altColor: '#fff5e4', opacity: 0.15, scale: 1 },
  { id: 'pat-ribbed', type: 'ribbed', color: '#000000', altColor: '#ffffff', opacity: 0.12, scale: 1 },
  { id: 'pat-dots', type: 'dots', color: '#ffffff', altColor: '#000000', opacity: 0.16, scale: 1 },
  { id: 'pat-vellum', type: 'vellum', color: '#ffffff', altColor: '#dbeafe', opacity: 0.14, scale: 1 },
];

const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|none|transparent)$/;
const SAFE_ID_RE = /^[A-Za-z_][\w-]{0,63}$/;

export function isSafeColor(v) {
  return typeof v === 'string' && SAFE_COLOR_RE.test(v.trim());
}

export function buildPaperTexFilter(seed = 13) {
  const safeSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 13;
  return `<filter id="paperTex" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${PAPER_TEX_BASE_FREQ}" numOctaves="2" seed="${safeSeed}" result="fibre"/><feColorMatrix in="fibre" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.10  0 0 0 0 0.08  0 0 0 0.11 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gc"/><feBlend in="SourceGraphic" in2="gc" mode="multiply"/></filter>`;
}

export function buildPaperBevelFilter(lighting = {}, id = 'paperBevel', widthMul = 1) {
  const dir = Array.isArray(lighting?.bevelDir) && lighting.bevelDir.length === 2
    && Number.isFinite(lighting.bevelDir[0]) && Number.isFinite(lighting.bevelDir[1])
    ? lighting.bevelDir
    : [-1, -1];
  const mag = Math.hypot(dir[0], dir[1]) || 1;
  const dx = dir[0] / mag;
  const dy = dir[1] / mag;
  const rawW = Number.isFinite(lighting?.bevelWidth) ? Math.max(0.5, Math.min(4, lighting.bevelWidth)) : 1.35;
  const w = rawW * widthMul;
  const lCol = isSafeColor(lighting?.bevelLightColor) ? lighting.bevelLightColor : '#ffffff';
  const dCol = isSafeColor(lighting?.bevelDarkColor)
    ? lighting.bevelDarkColor
    : (isSafeColor(lighting?.shadowColor) ? lighting.shadowColor : '#090b16');
  const lOp = Number.isFinite(lighting?.bevelLightOpacity) ? lighting.bevelLightOpacity : 0.44;
  const dOp = Number.isFinite(lighting?.bevelDarkOpacity) ? lighting.bevelDarkOpacity : 0.32;
  const oxL = (-dx * w).toFixed(2);
  const oyL = (-dy * w).toFixed(2);
  const oxD = (dx * w).toFixed(2);
  const oyD = (dy * w).toFixed(2);
  return `<filter id="${id}" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dx="${oxL}" dy="${oyL}" result="offL"/><feComposite in="SourceAlpha" in2="offL" operator="out" result="edgeL"/><feFlood flood-color="${lCol}" flood-opacity="${lOp.toFixed(2)}" result="flL"/><feComposite in="flL" in2="edgeL" operator="in" result="rimL"/><feOffset in="SourceAlpha" dx="${oxD}" dy="${oyD}" result="offD"/><feComposite in="SourceAlpha" in2="offD" operator="out" result="edgeD"/><feFlood flood-color="${dCol}" flood-opacity="${dOp.toFixed(2)}" result="flD"/><feComposite in="flD" in2="edgeD" operator="in" result="rimD"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="rimD"/><feMergeNode in="rimL"/></feMerge></filter>`;
}

export function buildSilhouetteFilter() {
  return `<filter id="silhouetteFilter" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.11  0 0 0 1 0"/></filter>`;
}

/**
 * Edge-gathered velvety gouache & cold-press paper grain filter.
 * Filter technique adapted from MengTo/Skills (MIT License): uses arithmetic composite
 * (2.0 * SourceAlpha - 1.8 * Blur(SourceAlpha)) so pigment texture gathers along cut/painted
 * edges while keeping centers and facial features clean and smooth.
 */
export function buildGouacheGrainFilter(seed = 5) {
  const safeSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 5;
  return `<filter id="gouacheGrain" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="${safeSeed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.56  0 0 0 0 0.47  0 0 0 0 0.41  0 -0.34 0 0 0.22" result="dk"/><feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="b"/><feComposite in="SourceAlpha" in2="b" operator="arithmetic" k1="0" k2="1.65" k3="-1.45" k4="0" result="w"/><feComposite in="dk" in2="w" operator="in" result="g"/><feBlend in="g" in2="SourceGraphic" mode="multiply"/></filter>`;
}

/**
 * Organic mottled chalk/pastel pooled contact shadow filter.
 * Adapted from MengTo/Skills (MIT License).
 */
export function buildChalkShadowFilter(seed = 3) {
  const safeSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 3;
  return `<filter id="chalkShadow" x="-15%" y="-80%" width="130%" height="260%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="2" seed="${safeSeed}" result="fine"/><feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b"/><feDisplacementMap in="b" in2="fine" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.22 0.5" numOctaves="3" seed="${safeSeed + 9}" result="mott"/><feColorMatrix in="mott" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.25 0 0 0 0.35" result="ma"/><feComposite in="d" in2="ma" operator="in"/></filter>`;
}

/**
 * Tactile die-cut Pop-Up Book paper border + grey cardboard thickness edge.
 * Technique adapted from lemomo-ai/lemo-opuscar paper-popup (MIT License).
 */
export function buildCutoutBorderFilter(lighting = {}) {
  const bCol = isSafeColor(lighting?.cutoutBorderColor) ? lighting.cutoutBorderColor : '#fffdf7';
  const eCol = isSafeColor(lighting?.cutoutEdgeColor) ? lighting.cutoutEdgeColor : '#b8ab9a';
  const r = Number.isFinite(lighting?.cutoutBorderWidth) ? Math.max(1.2, Math.min(8, lighting.cutoutBorderWidth)) : 3.0;
  const rEdge = (r + 1.2).toFixed(2);
  return `<filter id="cutoutBorder" x="-18%" y="-18%" width="136%" height="136%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="${rEdge}" result="edA"/><feOffset in="edA" dx="0.6" dy="1.8" result="edOff"/><feFlood flood-color="${eCol}" flood-opacity="1" result="edFl"/><feComposite in="edFl" in2="edOff" operator="in" result="edgeLayer"/><feMorphology in="SourceAlpha" operator="dilate" radius="${r.toFixed(2)}" result="bdA"/><feFlood flood-color="${bCol}" flood-opacity="1" result="bdFl"/><feComposite in="bdFl" in2="bdA" operator="in" result="borderLayer"/><feMerge><feMergeNode in="edgeLayer"/><feMergeNode in="borderLayer"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

/**
 * Backlit Shadow-Box paper pulp translucency + warm top-edge rim & dark under-edge.
 * Technique adapted from lemomo-ai/lemo-opuscar paper-lantern (MIT License).
 */
export function buildBacklitPulpFilter(lighting = {}, seed = 11) {
  const safeSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 11;
  const rimCol = isSafeColor(lighting?.bevelLightColor) ? lighting.bevelLightColor : '#ffebc2';
  const rimOp = Number.isFinite(lighting?.bevelLightOpacity) ? lighting.bevelLightOpacity : 0.52;
  const darkCol = isSafeColor(lighting?.bevelDarkColor) ? lighting.bevelDarkColor : '#070b18';
  const darkOp = Number.isFinite(lighting?.bevelDarkOpacity) ? lighting.bevelDarkOpacity : 0.36;
  return `<filter id="backlitPulp" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.045 0.065" numOctaves="3" seed="${safeSeed}" result="pulp"/><feColorMatrix in="pulp" type="matrix" values="0 0 0 0 1.0  0 0 0 0 0.88  0 0 0 0 0.66  0 0 0 0.22 0" result="pCol"/><feComposite in="pCol" in2="SourceAlpha" operator="in" result="pIn"/><feBlend in="SourceGraphic" in2="pIn" mode="screen" result="litBody"/><feOffset in="SourceAlpha" dx="0" dy="2.2" result="offT"/><feComposite in="SourceAlpha" in2="offT" operator="out" result="eT"/><feFlood flood-color="${rimCol}" flood-opacity="${rimOp.toFixed(2)}" result="fT"/><feComposite in="fT" in2="eT" operator="in" result="rimT"/><feOffset in="SourceAlpha" dx="0" dy="-2.2" result="offB"/><feComposite in="SourceAlpha" in2="offB" operator="out" result="eB"/><feFlood flood-color="${darkCol}" flood-opacity="${darkOp.toFixed(2)}" result="fB"/><feComposite in="fB" in2="eB" operator="in" result="rimB"/><feMerge><feMergeNode in="litBody"/><feMergeNode in="rimB"/><feMergeNode in="rimT"/></feMerge></filter>`;
}

export function buildMaterialPatternMarkup(mat) {
  const id = mat.id;
  const type = mat.type;
  const col = isSafeColor(mat.color) ? mat.color : '#ffffff';
  const alt = isSafeColor(mat.altColor) ? mat.altColor : '#000000';
  const bg = isSafeColor(mat.bg) ? mat.bg : null;
  const op = Number.isFinite(mat.opacity) ? Math.max(0.02, Math.min(1, mat.opacity)) : 0.22;
  const sc = Number.isFinite(mat.scale) ? Math.max(0.4, Math.min(4, mat.scale)) : 1;
  const op2 = (op * 0.55).toFixed(2);
  const opStr = op.toFixed(2);

  if (type === 'linen') {
    const s = (10 * sc).toFixed(1);
    const h = (5 * sc).toFixed(1);
    const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<path d="M0 ${h} H${s} M${h} 0 V${s}" stroke="${col}" stroke-width="${(0.8 * sc).toFixed(2)}" opacity="${opStr}"/><path d="M0 ${(2 * sc).toFixed(1)} H${s} M${(2 * sc).toFixed(1)} 0 V${s}" stroke="${alt}" stroke-width="${(0.55 * sc).toFixed(2)}" opacity="${op2}"/></pattern>`;
  }
  if (type === 'crosshatch') {
    const s = (12 * sc).toFixed(1);
    const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<path d="M0 ${s} L${s} 0 M-${(3 * sc).toFixed(1)} ${(3 * sc).toFixed(1)} L${(3 * sc).toFixed(1)} -${(3 * sc).toFixed(1)} M${(9 * sc).toFixed(1)} ${(15 * sc).toFixed(1)} L${(15 * sc).toFixed(1)} ${(9 * sc).toFixed(1)}" stroke="${col}" stroke-width="${(0.75 * sc).toFixed(2)}" opacity="${opStr}"/><path d="M0 0 L${s} ${s}" stroke="${alt}" stroke-width="${(0.55 * sc).toFixed(2)}" opacity="${op2}"/></pattern>`;
  }
  if (type === 'kraft') {
    const s = (24 * sc).toFixed(1);
    const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
    const p = (n) => (n * sc).toFixed(1);
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<circle cx="${p(3.5)}" cy="${p(4.2)}" r="${p(0.9)}" fill="${col}" opacity="${opStr}"/><circle cx="${p(14.8)}" cy="${p(6.4)}" r="${p(0.7)}" fill="${alt}" opacity="${op2}"/><circle cx="${p(19.2)}" cy="${p(15.6)}" r="${p(1.0)}" fill="${col}" opacity="${opStr}"/><circle cx="${p(7.6)}" cy="${p(18.5)}" r="${p(0.8)}" fill="${col}" opacity="${op2}"/><path d="M${p(9)} ${p(11)} L${p(12.5)} ${p(10.2)} M${p(1.5)} ${p(14)} L${p(4.2)} ${p(15.1)} M${p(17)} ${p(3)} L${p(20.4)} ${p(2.4)}" stroke="${col}" stroke-width="${p(0.65)}" stroke-linecap="round" opacity="${opStr}"/></pattern>`;
  }
  if (type === 'ribbed') {
    const s = (8 * sc).toFixed(1);
    const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<line x1="0" y1="${(2 * sc).toFixed(1)}" x2="${s}" y2="${(2 * sc).toFixed(1)}" stroke="${col}" stroke-width="${(0.9 * sc).toFixed(2)}" opacity="${opStr}"/><line x1="0" y1="${(5.5 * sc).toFixed(1)}" x2="${s}" y2="${(5.5 * sc).toFixed(1)}" stroke="${alt}" stroke-width="${(0.65 * sc).toFixed(2)}" opacity="${op2}"/></pattern>`;
  }
  if (type === 'dots') {
    const s = (12 * sc).toFixed(1);
    const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
    const p = (n) => (n * sc).toFixed(1);
    return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<circle cx="${p(3)}" cy="${p(3)}" r="${p(1.1)}" fill="${col}" opacity="${opStr}"/><circle cx="${p(9)}" cy="${p(9)}" r="${p(1.1)}" fill="${col}" opacity="${opStr}"/><circle cx="${p(3.4)}" cy="${p(3.4)}" r="${p(0.7)}" fill="${alt}" opacity="${op2}"/></pattern>`;
  }
  // vellum
  const s = (28 * sc).toFixed(1);
  const bgRect = bg ? `<rect width="${s}" height="${s}" fill="${bg}"/>` : '';
  const p = (n) => (n * sc).toFixed(1);
  return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${bgRect}<path d="M${p(2)} ${p(7)} Q${p(10)} ${p(4)} ${p(19)} ${p(8)} T${p(27)} ${p(6)}" fill="none" stroke="${col}" stroke-width="${p(0.8)}" opacity="${opStr}"/><path d="M${p(0)} ${p(20)} Q${p(9)} ${p(17)} ${p(17)} ${p(22)} T${p(28)} ${p(19)}" fill="none" stroke="${alt}" stroke-width="${p(0.7)}" opacity="${op2}"/></pattern>`;
}

export function buildBuiltinMaterialPatterns() {
  return BUILTIN_MATERIAL_DEFS.map(buildMaterialPatternMarkup).join('');
}

export function validateAndBuildCustomMaterials(materials, pushErr) {
  if (materials == null) return { markup: '', ids: new Set() };
  if (!Array.isArray(materials)) {
    if (pushErr) pushErr('BP_SCHEMA', 'scene.materials', 'scene.materials must be an array');
    return { markup: '', ids: new Set() };
  }
  const ids = new Set();
  const chunks = [];
  materials.forEach((m, idx) => {
    const where = `scene.materials[${idx}]`;
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      if (pushErr) pushErr('BP_SCHEMA', where, 'material entry must be an object');
      return;
    }
    if (typeof m.id !== 'string' || !SAFE_ID_RE.test(m.id)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.id`, `invalid material id "${m.id}" (must match /^[A-Za-z_][\\w-]{0,63}$/)`);
      return;
    }
    if (ids.has(m.id)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.id`, `duplicate material id "${m.id}"`);
      return;
    }
    if (!ALLOWED_MATERIAL_TYPES.has(m.type)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.type`, `unsupported material type "${m.type}" (allowed: ${[...ALLOWED_MATERIAL_TYPES].join(', ')})`);
      return;
    }
    if (m.color != null && !isSafeColor(m.color)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.color`, `unsafe or invalid color "${m.color}"`);
      return;
    }
    if (m.altColor != null && !isSafeColor(m.altColor)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.altColor`, `unsafe or invalid altColor "${m.altColor}"`);
      return;
    }
    if (m.bg != null && !isSafeColor(m.bg)) {
      if (pushErr) pushErr('BP_SCHEMA', `${where}.bg`, `unsafe or invalid bg "${m.bg}"`);
      return;
    }
    ids.add(m.id);
    chunks.push(buildMaterialPatternMarkup(m));
  });
  return { markup: chunks.join(''), ids };
}

export function getBuiltinViewerDefs(scene = {}) {
  const ids = new Set([
    'paperTex',
    'paperBevel',
    'paperBevelSoft',
    'gouacheGrain',
    'chalkShadow',
    'cutoutBorder',
    'backlitPulp',
    'silhouetteFilter',
    'shadowDeep',
    'shadowMed',
    'shadowSoft',
    'shadowInner',
    'softGlow',
    'groundShadowGrad',
    'dynVfxGlow',
    'autoVignette',
    'meteorTrail',
    'stageClip',
    ...BUILTIN_MATERIAL_DEFS.map((m) => m.id),
  ]);
  if (scene?.lighting?.focalGlow) ids.add('autoFocalGlow');
  if (scene?.lighting?.mist) ids.add('autoMistGrad');
  if (Array.isArray(scene?.materials)) {
    for (const m of scene.materials) {
      if (m && typeof m.id === 'string' && SAFE_ID_RE.test(m.id) && ALLOWED_MATERIAL_TYPES.has(m.type)) {
        ids.add(m.id);
      }
    }
  }
  return ids;
}

export function getBuiltinPartDefs(scene = {}) {
  const ids = new Set([
    'paperTex',
    'paperBevel',
    'paperBevelSoft',
    'gouacheGrain',
    'cutoutBorder',
    'backlitPulp',
    ...BUILTIN_MATERIAL_DEFS.map((m) => m.id),
  ]);
  if (Array.isArray(scene?.materials)) {
    for (const m of scene.materials) {
      if (m && typeof m.id === 'string' && SAFE_ID_RE.test(m.id) && ALLOWED_MATERIAL_TYPES.has(m.type)) {
        ids.add(m.id);
      }
    }
  }
  return ids;
}

function parseAttrs(raw, pushErr, where, codeUnsafe) {
  const out = {};
  ATTR.lastIndex = 0;
  while (ATTR.lastIndex < raw.length) {
    const start = ATTR.lastIndex;
    const m = ATTR.exec(raw);
    if (!m) {
      if (raw.slice(start).trim() === '') break;
      if (pushErr) pushErr(codeUnsafe, where, 'malformed SVG attributes');
      return out;
    }
    const key = m[1];
    if (key in out && pushErr) {
      pushErr(codeUnsafe, where, `duplicate attribute "${key}"`);
    }
    out[key] = m[2] ?? m[3] ?? '';
  }
  return out;
}

export function extractDefIds(svgMarkup) {
  const ids = new Set();
  if (typeof svgMarkup !== 'string' || !svgMarkup) return ids;
  const cleaned = svgMarkup.replace(/<!--[\s\S]*?-->/g, '');
  cleaned.replace(OPEN_TAG, (_m, _rawName, rawAttrs) => {
    const attrs = parseAttrs(rawAttrs, null, '', 'ART_SVG_UNSAFE');
    if (attrs.id) ids.add(attrs.id);
    return '';
  });
  return ids;
}

export function scanSvgFragment(fragment, where, pushErr, options = {}) {
  const {
    requireRootSvg = false,
    codeUnsafe = 'ART_SVG_UNSAFE',
    codeMissingDef = 'ART_MISSING_DEF',
    knownDefIds = new Set(),
    checkDefRefs = true,
  } = options;

  if (typeof fragment !== 'string') {
    pushErr(codeUnsafe, where, 'SVG markup must be a string');
    return { localIds: new Set(), referencedIds: new Set() };
  }

  let body = fragment.replace(/^\uFEFF/, '');
  if (requireRootSvg) {
    body = body.replace(/^\s*<\?xml\s[^?]*\?>/, '');
  }

  if (/<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<\?/i.test(body)) {
    pushErr(codeUnsafe, where, 'CDATA, DOCTYPE, ENTITY or processing instructions are forbidden');
    return { localIds: new Set(), referencedIds: new Set() };
  }

  body = body.replace(/<!--[\s\S]*?-->/g, '');
  let rootAttrs = null;
  const localIds = new Set();
  const referencedIds = new Set();

  const rest = body
    .replace(OPEN_TAG, (_m, rawName, rawAttrs) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_SVG_TAGS.has(name)) {
        pushErr(codeUnsafe, where, `disallowed element <${rawName}>; remove it or replace with basic vector shapes`);
      }
      const attrs = parseAttrs(rawAttrs, pushErr, where, codeUnsafe);
      for (const [k, v] of Object.entries(attrs)) {
        const key = k.toLowerCase();
        if (key === 'id' && v) localIds.add(v);
        if (key.startsWith('on')) {
          pushErr(codeUnsafe, where, `event handler attribute "${k}" is forbidden`);
        }
        if (key === 'href' || key === 'xlink:href') {
          if (!/^#[A-Za-z_][\w:.-]*$/.test(v.trim())) {
            pushErr(codeUnsafe, where, `external or invalid reference ${k}="${v}" is forbidden; only local #id refs allowed`);
          } else {
            referencedIds.add(v.trim().slice(1));
          }
        }
        if (/url\(\s*['"]?(?!#)/i.test(v)) {
          pushErr(codeUnsafe, where, `non-local url() in attribute "${k}" is forbidden`);
        }
        if (/@import|expression\s*\(|javascript\s*:/i.test(v)) {
          pushErr(codeUnsafe, where, `forbidden CSS/URI construct in attribute "${k}"`);
        }
        LOCAL_URL_REF.lastIndex = 0;
        let urlMatch;
        while ((urlMatch = LOCAL_URL_REF.exec(v)) !== null) {
          referencedIds.add(urlMatch[1]);
        }
      }
      if (name === 'svg' && !rootAttrs) rootAttrs = attrs;
      return '';
    })
    .replace(CLOSE_TAG, (_m, rawName) => {
      if (!ALLOWED_SVG_TAGS.has(rawName.toLowerCase())) {
        pushErr(codeUnsafe, where, `disallowed closing tag </${rawName}>`);
      }
      return '';
    });

  if (rest.includes('<')) {
    pushErr(codeUnsafe, where, 'unparseable markup remaining after tag scan');
  }

  if (requireRootSvg) {
    if (!rootAttrs) {
      pushErr(codeUnsafe, where, 'missing <svg> root element');
      return { localIds, referencedIds };
    }
    const vb = (rootAttrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
      pushErr(codeUnsafe, where, 'root <svg> must define a numeric viewBox="x y w h"');
    }
  }

  if (checkDefRefs && referencedIds.size > 0) {
    const available = new Set([...knownDefIds, ...localIds]);
    const availList = [...available].sort().slice(0, 20);
    for (const refId of referencedIds) {
      if (!available.has(refId)) {
        const hint = availList.length > 0 ? ` Available defs: [${availList.join(', ')}]` : ' No <defs> IDs are declared.';
        pushErr(
          codeMissingDef,
          where,
          `referenced "#${refId}" is not declared in <defs> (add it to scene.defsSvg or fix the ID).${hint}`,
        );
      }
    }
  }

  return { localIds, referencedIds };
}

export function checkSvgDocument(svgText, where, pushErr, options = {}) {
  return scanSvgFragment(svgText, where, pushErr, {
    ...options,
    requireRootSvg: true,
  });
}
