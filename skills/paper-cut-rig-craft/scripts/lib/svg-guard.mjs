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

export function buildPaperTexFilter(seed = 13) {
  const safeSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 13;
  return `<filter id="paperTex" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${PAPER_TEX_BASE_FREQ}" numOctaves="2" seed="${safeSeed}" result="fibre"/><feColorMatrix in="fibre" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.10  0 0 0 0 0.08  0 0 0 0.11 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gc"/><feBlend in="SourceGraphic" in2="gc" mode="multiply"/></filter>`;
}

export function getBuiltinViewerDefs(scene = {}) {
  const ids = new Set([
    'paperTex',
    'shadowDeep',
    'shadowMed',
    'shadowSoft',
    'shadowInner',
    'softGlow',
    'groundShadowGrad',
    'warmMomentGlow',
    'autoVignette',
    'meteorTrail',
    'stageClip',
  ]);
  if (scene?.lighting?.focalGlow) ids.add('autoFocalGlow');
  if (scene?.lighting?.mist) ids.add('autoMistGrad');
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
