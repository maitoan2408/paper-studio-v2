/**
 * Fail-closed Modular Paper-Cut Component Kit loader & resolver.
 * Loads reusable tokenized SVG components from assets/kit/ and optional custom --kit-dir,
 * resolves part.kitRef and {{KIT:id|TOKEN=VALUE|...}} macros deterministically.
 * Zero external dependencies, 100% data-driven & theme-agnostic.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_KIT_DIR = resolve(__dirname, '../../assets/kit');
export const DEFAULT_LIBRARY_DIR = resolve(__dirname, '../../assets/library');

const SAFE_KIT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SAFE_TOKEN_NAME_RE = /^[A-Z][A-Z0-9_]{0,31}$/;
const SAFE_TOKEN_VALUE_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|url\(#[-A-Za-z0-9_]+\)|none|transparent|-?\d+(?:\.\d+)?)$/;
const KIT_MACRO_RE = /\{\{KIT:([^}]+)\}\}/g;

function collectJsonFiles(rootDir) {
  const out = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.json') && ent.name !== 'index.json') out.push(full);
    }
  };
  walk(rootDir);
  return out;
}

export function loadKitCatalog(extraDirs = [], pushErr = null) {
  const envDir = process.env.PAPER_STUDIO_LIBRARY_DIR ? [process.env.PAPER_STUDIO_LIBRARY_DIR] : [];
  const dirs = [
    { path: DEFAULT_KIT_DIR, optional: true },
    { path: DEFAULT_LIBRARY_DIR, optional: true },
    ...envDir.map((p) => ({ path: p, optional: true })),
    ...(Array.isArray(extraDirs) ? extraDirs.filter(Boolean).map((p) => ({ path: p, optional: false })) : []),
  ];
  const catalog = new Map();

  for (const entry of dirs) {
    const absDir = resolve(entry.path);
    if (!existsSync(absDir)) {
      if (!entry.optional && pushErr) {
        pushErr('BP_KIT_INVALID', '--kit-dir', `kit/library directory not found: ${absDir}`);
      }
      continue;
    }
    const files = collectJsonFiles(absDir);
    for (const fullPath of files) {
      let doc;
      try {
        doc = JSON.parse(readFileSync(fullPath, 'utf8'));
      } catch (err) {
        if (pushErr) pushErr('BP_KIT_INVALID', fullPath, `invalid kit JSON: ${err.message}`);
        continue;
      }
      if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !SAFE_KIT_ID_RE.test(doc.id)) {
        if (pushErr) pushErr('BP_KIT_INVALID', fullPath, `kit component missing valid id`);
        continue;
      }
      if (typeof doc.svg !== 'string' || !doc.svg.trim()) {
        if (pushErr) pushErr('BP_KIT_INVALID', fullPath, `kit component "${doc.id}" missing svg string`);
        continue;
      }
      catalog.set(doc.id, { ...doc, _sourceFile: fullPath });
    }
  }
  return catalog;
}

function renderKitComponent(comp, tokens, transformOpts, where, pushErr) {
  const merged = { ...(comp.tokens ?? {}) };
  for (const [k, v] of Object.entries(tokens ?? {})) {
    if (!SAFE_TOKEN_NAME_RE.test(k)) {
      pushErr('BP_KIT_INVALID', where, `invalid kit token name "${k}" (must be UPPER_SNAKE_CASE)`);
      return '';
    }
    const strVal = String(v).trim();
    if (!SAFE_TOKEN_VALUE_RE.test(strVal)) {
      pushErr('BP_KIT_INVALID', where, `unsafe or invalid kit token value for ${k}="${strVal}"`);
      return '';
    }
    merged[k] = strVal;
  }

  let svg = comp.svg.replace(/\{\{([A-Z][A-Z0-9_]{0,31})\}\}/g, (_m, tok) => {
    if (!(tok in merged)) {
      pushErr('BP_KIT_INVALID', where, `kit "${comp.id}" requires token "{{${tok}}}" with no default`);
      return '#000000';
    }
    return merged[tok];
  });

  const tx = Number(transformOpts?.x ?? 0);
  const ty = Number(transformOpts?.y ?? 0);
  const sc = Number(transformOpts?.scale ?? 1);
  const rot = Number(transformOpts?.rotate ?? 0);
  const flipX = Boolean(transformOpts?.flipX);
  const flipY = Boolean(transformOpts?.flipY);
  if (![tx, ty, sc, rot].every(Number.isFinite) || sc <= 0) {
    pushErr('BP_KIT_INVALID', where, `invalid kit transform parameters on "${comp.id}"`);
    return '';
  }

  const transforms = [];
  if (tx !== 0 || ty !== 0) transforms.push(`translate(${Number(tx.toFixed(2))},${Number(ty.toFixed(2))})`);
  if (rot !== 0) transforms.push(`rotate(${Number(rot.toFixed(2))})`);
  const sx = flipX ? -sc : sc;
  const sy = flipY ? -sc : sc;
  if (sx !== 1 || sy !== 1) transforms.push(`scale(${Number(sx.toFixed(3))},${Number(sy.toFixed(3))})`);

  if (transforms.length > 0) {
    svg = `<g transform="${transforms.join(' ')}">${svg}</g>`;
  }
  return svg;
}

export function expandKitMacrosInString(str, catalog, where, pushErr) {
  if (typeof str !== 'string' || !str.includes('{{KIT:')) return str;
  return str.replace(KIT_MACRO_RE, (_full, body) => {
    const segments = body.split('|').map((s) => s.trim()).filter(Boolean);
    const kitId = segments[0];
    if (!kitId || !SAFE_KIT_ID_RE.test(kitId)) {
      pushErr('BP_KIT_INVALID', where, `invalid kit macro id "${kitId ?? ''}"`);
      return '';
    }
    const comp = catalog.get(kitId);
    if (!comp) {
      pushErr('BP_KIT_NOT_FOUND', where, `kit component "${kitId}" not found. Available: [${[...catalog.keys()].sort().join(', ')}]`);
      return '';
    }
    const tokens = {};
    const tOpts = {};
    for (let i = 1; i < segments.length; i++) {
      const eq = segments[i].indexOf('=');
      if (eq <= 0) {
        pushErr('BP_KIT_INVALID', where, `malformed kit macro option "${segments[i]}" (expected KEY=VALUE)`);
        return '';
      }
      const k = segments[i].slice(0, eq).trim();
      const v = segments[i].slice(eq + 1).trim();
      if (k === 'x' || k === 'y' || k === 'scale' || k === 'rotate') {
        tOpts[k] = Number(v);
      } else if (k === 'flipX' || k === 'flipY') {
        tOpts[k] = v === '1' || v === 'true';
      } else {
        tokens[k] = v;
      }
    }
    return renderKitComponent(comp, tokens, tOpts, where, pushErr);
  });
}

function deepExpandMacros(node, catalog, pathStr, pushErr) {
  if (typeof node === 'string') {
    return expandKitMacrosInString(node, catalog, pathStr, pushErr);
  }
  if (Array.isArray(node)) {
    return node.map((item, idx) => deepExpandMacros(item, catalog, `${pathStr}[${idx}]`, pushErr));
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = deepExpandMacros(v, catalog, pathStr ? `${pathStr}.${k}` : k, pushErr);
    }
    return out;
  }
  return node;
}

/**
 * Returns a resolved deep copy of blueprint with all part.kitRef and {{KIT:...}} macros expanded.
 */
export function resolveBlueprintKits(bp, catalog, pushErr) {
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) return bp;
  const cloned = deepExpandMacros(bp, catalog, '', pushErr);

  if (Array.isArray(cloned.parts)) {
    cloned.parts = cloned.parts.map((part, idx) => {
      if (!part || typeof part !== 'object' || !part.kitRef) return part;
      const where = `parts[${idx}]${part.id ? ` (${part.id})` : ''}.kitRef`;
      const ref = typeof part.kitRef === 'string' ? { id: part.kitRef } : part.kitRef;
      if (!ref || typeof ref.id !== 'string' || !SAFE_KIT_ID_RE.test(ref.id)) {
        pushErr('BP_KIT_INVALID', where, 'kitRef.id must be a valid kit component ID');
        return part;
      }
      const comp = catalog.get(ref.id);
      if (!comp) {
        pushErr('BP_KIT_NOT_FOUND', where, `kit component "${ref.id}" not found. Available: [${[...catalog.keys()].sort().join(', ')}]`);
        return part;
      }
      const baseSvg = renderKitComponent(comp, ref.tokens, ref, where, pushErr);
      const extraSvg = typeof ref.extraSvg === 'string' ? expandKitMacrosInString(ref.extraSvg, catalog, `${where}.extraSvg`, pushErr) : '';
      const resolvedPart = {
        ...part,
        size: part.size ?? comp.size,
        pivot: part.pivot ?? comp.pivot,
        anchors: part.anchors ?? comp.anchors ?? {},
        category: part.category ?? comp.category ?? 'body',
        svg: extraSvg ? `<g>${baseSvg}${extraSvg}</g>` : baseSvg,
      };
      delete resolvedPart.kitRef;
      return resolvedPart;
    });
  }
  return cloned;
}
