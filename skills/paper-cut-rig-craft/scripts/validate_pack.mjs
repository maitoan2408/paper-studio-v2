#!/usr/bin/env node
/**
 * Fail-closed validator for paper-studio-v2 compatible paper-cut rig packs.
 * Checks: SVG allowlist (matching src/schema/svg.ts), SHA-256 integrity,
 * rig bone hierarchy (no cycles, single root, valid limits), skin completeness,
 * required anchors, non-degenerate bone lengths, and zero Math.random usage.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALLOWED_SVG_TAGS = new Set([
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

function printHelp() {
  console.log(`Usage: node scripts/validate_pack.mjs [OPTIONS] <PACK_DIR>

Validate a paper-cut rig pack (manifest.json, rig.json, and all referenced SVGs)
against paper-studio-v2 safety, integrity, and kinematic contracts.

Options:
  --json       Emit machine-readable JSON report to stdout (default)
  --pretty     Emit human-readable summary to stderr in addition to JSON
  --help, -h   Show this help message

Exit codes:
  0  PASS (all checks succeeded)
  1  VALIDATION_FAILED (one or more contract violations found)
  2  USAGE_ERROR (missing directory or invalid CLI arguments)`);
}

function parseAttrs(raw, pushErr, where) {
  const out = {};
  ATTR.lastIndex = 0;
  while (ATTR.lastIndex < raw.length) {
    const start = ATTR.lastIndex;
    const m = ATTR.exec(raw);
    if (!m) {
      if (raw.slice(start).trim() === '') break;
      pushErr('ART_SVG_UNSAFE', where, 'malformed SVG attributes');
      return out;
    }
    const key = m[1];
    if (key in out) pushErr('ART_SVG_UNSAFE', where, `duplicate attribute "${key}"`);
    out[key] = m[2] ?? m[3] ?? '';
  }
  return out;
}

function checkSvgText(text, where, pushErr) {
  let body = text.replace(/^\uFEFF/, '').replace(/^\s*<\?xml\s[^?]*\?>/, '');
  if (/<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<\?/i.test(body)) {
    pushErr('ART_SVG_UNSAFE', where, 'CDATA, DOCTYPE, ENTITY or processing instructions are forbidden');
    return;
  }
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  let rootAttrs = null;

  const rest = body
    .replace(OPEN_TAG, (_m, rawName, rawAttrs) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_SVG_TAGS.has(name)) {
        pushErr('ART_SVG_UNSAFE', where, `disallowed element <${rawName}>; remove it or replace with basic vector shapes`);
      }
      const attrs = parseAttrs(rawAttrs, pushErr, where);
      for (const [k, v] of Object.entries(attrs)) {
        const key = k.toLowerCase();
        if (key.startsWith('on')) pushErr('ART_SVG_UNSAFE', where, `event handler attribute "${k}" is forbidden`);
        if ((key === 'href' || key === 'xlink:href') && !v.startsWith('#')) {
          pushErr('ART_SVG_UNSAFE', where, `external reference ${k}="${v}" is forbidden; only local #id refs allowed`);
        }
        if (/url\(\s*['"]?(?!#)/i.test(v)) {
          pushErr('ART_SVG_UNSAFE', where, `non-local url() in attribute "${k}" is forbidden`);
        }
        if (/@import|expression\s*\(/i.test(v)) {
          pushErr('ART_SVG_UNSAFE', where, `forbidden CSS construct in attribute "${k}"`);
        }
      }
      if (name === 'svg' && !rootAttrs) rootAttrs = attrs;
      return '';
    })
    .replace(CLOSE_TAG, (_m, rawName) => {
      if (!ALLOWED_SVG_TAGS.has(rawName.toLowerCase())) {
        pushErr('ART_SVG_UNSAFE', where, `disallowed closing tag </${rawName}>`);
      }
      return '';
    });

  if (rest.includes('<')) pushErr('ART_SVG_UNSAFE', where, 'unparseable markup remaining after tag scan');
  if (!rootAttrs) {
    pushErr('ART_SVG_UNSAFE', where, 'missing <svg> root element');
    return;
  }
  const vb = (rootAttrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
    pushErr('ART_SVG_UNSAFE', where, 'root <svg> must define a numeric viewBox="x y w h"');
  }
}

function validatePack(packDir) {
  const errors = [];
  const warnings = [];
  const pushErr = (code, where, detail) => errors.push({ code, where, detail });

  const manifestPath = join(packDir, 'manifest.json');
  const rigPath = join(packDir, 'rig.json');

  if (!existsSync(manifestPath)) {
    pushErr('PACK_MISSING_MANIFEST', manifestPath, 'manifest.json not found');
    return { status: 'FAIL', packDir, errors, warnings, stats: {} };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    pushErr('MANIFEST_JSON_INVALID', manifestPath, `invalid JSON: ${e.message}`);
    return { status: 'FAIL', packDir, errors, warnings, stats: {} };
  }

  if (manifest.schemaVersion !== 1) pushErr('MANIFEST_SCHEMA', 'manifest.schemaVersion', 'expected schemaVersion === 1');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    pushErr('MANIFEST_SCHEMA', 'manifest.assets', 'must be a non-empty array');
    return { status: 'FAIL', packDir, errors, warnings, stats: {} };
  }

  const assetsById = new Map();
  for (const a of manifest.assets) {
    const where = `manifest.assets.${a.id ?? '?'}`;
    if (!a.id || typeof a.id !== 'string') { pushErr('MANIFEST_SCHEMA', where, 'missing string id'); continue; }
    if (assetsById.has(a.id)) pushErr('MANIFEST_DUP_ID', where, `duplicate asset id "${a.id}"`);
    assetsById.set(a.id, a);

    if (!Array.isArray(a.pivot) || a.pivot.length !== 2 || a.pivot.some((n) => !Number.isFinite(n))) {
      pushErr('MANIFEST_SCHEMA', `${where}.pivot`, 'pivot must be [x, y] finite numbers');
    }
    const filePath = join(packDir, a.file ?? '');
    if (!a.file || !existsSync(filePath)) {
      pushErr('ART_FILE_MISSING', `${where}.file`, `referenced file "${a.file}" does not exist`);
      continue;
    }
    const rawSvg = readFileSync(filePath, 'utf8');
    const actualSha = createHash('sha256').update(rawSvg).digest('hex');
    if (a.sha256 !== actualSha) {
      pushErr('ART_SHA_MISMATCH', `${where}.sha256`, `expected ${a.sha256}, computed ${actualSha}`);
    }
    checkSvgText(rawSvg, `${where} (${a.file})`, pushErr);
  }

  let rigStats = null;
  if (existsSync(rigPath)) {
    let rig;
    try {
      rig = JSON.parse(readFileSync(rigPath, 'utf8'));
    } catch (e) {
      pushErr('RIG_JSON_INVALID', rigPath, `invalid JSON: ${e.message}`);
      return { status: 'FAIL', packDir, errors, warnings, stats: { assets: assetsById.size } };
    }

    if (rig.schemaVersion !== 1) pushErr('RIG_SCHEMA', 'rig.schemaVersion', 'expected schemaVersion === 1');
    if (!Array.isArray(rig.bones) || rig.bones.length === 0) {
      pushErr('RIG_SCHEMA', 'rig.bones', 'must be a non-empty array');
    } else {
      const boneMap = new Map();
      for (const b of rig.bones) {
        if (boneMap.has(b.id)) pushErr('RIG_DUP_BONE', `rig.bones.${b.id}`, `duplicate bone "${b.id}"`);
        boneMap.set(b.id, b);
      }

      const roots = rig.bones.filter((b) => b.parent === null);
      if (roots.length !== 1) pushErr('RIG_ROOT_COUNT', 'rig.bones', `expected exactly 1 root bone, found ${roots.length}`);

      for (const b of rig.bones) {
        const where = `rig.bones.${b.id}`;
        if (b.parent !== null && !boneMap.has(b.parent)) {
          pushErr('RIG_UNKNOWN_PARENT', where, `parent "${b.parent}" does not exist`);
        }
        if ((b.parent === null) !== (b.attach === null)) {
          pushErr('RIG_SCHEMA', where, 'attach must be null if and only if parent is null');
        }
        if (!b.limits || !(b.limits.min < b.limits.max)) {
          pushErr('RIG_LIMIT_INVALID', `${where}.limits`, `limits.min must be < limits.max`);
        }
        if (!(b.maxDegPerFrame > 0)) {
          pushErr('RIG_SCHEMA', `${where}.maxDegPerFrame`, 'maxDegPerFrame must be > 0');
        }
      }

      // Cycle detection via DFS from roots
      const children = new Map();
      for (const b of rig.bones) {
        if (b.parent !== null) children.set(b.parent, [...(children.get(b.parent) ?? []), b]);
      }
      const visited = new Set();
      const stack = [...roots];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (visited.has(cur.id)) continue;
        visited.add(cur.id);
        for (const ch of children.get(cur.id) ?? []) stack.push(ch);
      }
      if (visited.size !== rig.bones.length) {
        const stuck = rig.bones.find((b) => !visited.has(b.id));
        pushErr('RIG_CYCLE', `rig.bones.${stuck?.id}`, 'bone is unreachable from root (cycle detected)');
      }

      // Validate characters: skin, rest, anchors, non-degenerate bone lengths
      for (const ch of rig.characters ?? []) {
        const at = `rig.characters.${ch.id}`;
        for (const b of rig.bones) {
          const skin = ch.skin?.[b.id];
          if (!skin?.default) {
            pushErr('RIG_SKIN_INCOMPLETE', `${at}.skin.${b.id}`, `missing default skin for bone "${b.id}"`);
            continue;
          }
          const rest = ch.rest?.[b.id];
          if (typeof rest !== 'number' || !Number.isFinite(rest)) {
            pushErr('RIG_REST_MISSING', `${at}.rest.${b.id}`, `missing numeric rest angle`);
          } else if (b.limits && (rest < b.limits.min || rest > b.limits.max)) {
            pushErr('RIG_REST_OUT_OF_LIMIT', `${at}.rest.${b.id}`, `rest ${rest} outside [${b.limits.min}, ${b.limits.max}]`);
          }

          const variants = [['default', skin.default], ...Object.entries(skin.variants ?? {})];
          for (const [vName, assetId] of variants) {
            if (!assetsById.has(assetId)) {
              pushErr('RIG_ASSET_MISSING', `${at}.skin.${b.id}.${vName}`, `asset "${assetId}" not found in manifest`);
            }
          }
        }

        // Parent attach anchors must exist on every parent variant & have length > 0
        for (const b of rig.bones) {
          if (b.parent === null || b.attach === null) continue;
          const pSkin = ch.skin?.[b.parent];
          if (!pSkin?.default) continue;
          const pVariants = [['default', pSkin.default], ...Object.entries(pSkin.variants ?? {})];
          for (const [vName, pAssetId] of pVariants) {
            const pAsset = assetsById.get(pAssetId);
            if (!pAsset) continue;
            const anc = pAsset.anchors?.[b.attach];
            if (!Array.isArray(anc) || anc.length !== 2) {
              pushErr('RIG_ANCHOR_MISSING', `${at}.skin.${b.parent}.${vName}`, `asset "${pAssetId}" lacks anchor "${b.attach}" for child "${b.id}"`);
            } else {
              const dist = Math.hypot(anc[0] - pAsset.pivot[0], anc[1] - pAsset.pivot[1]);
              if (dist === 0) {
                pushErr('RIG_DEGENERATE_BONE', `${at}.skin.${b.parent}.${vName}`, `anchor "${b.attach}" coincides with pivot on "${pAssetId}" (zero-length bone)`);
              }
            }
          }
        }

        // Contacts check
        for (const [cName, cDef] of Object.entries(rig.contacts ?? {})) {
          const skin = ch.skin?.[cDef.bone];
          if (!skin?.default) {
            pushErr('RIG_CONTACT_BAD_BONE', `rig.contacts.${cName}`, `bone "${cDef.bone}" has no skin`);
            continue;
          }
          const variants = [['default', skin.default], ...Object.entries(skin.variants ?? {})];
          for (const [vName, aId] of variants) {
            const a = assetsById.get(aId);
            if (a && !a.anchors?.[cDef.anchor]) {
              pushErr('RIG_ANCHOR_MISSING', `${at}.skin.${cDef.bone}.${vName}`, `asset "${aId}" lacks contact anchor "${cDef.anchor}" (${cName})`);
            }
          }
        }
      }

      // IK chain checks
      for (const [ikId, chain] of Object.entries(rig.ik ?? {})) {
        const u = boneMap.get(chain.upper);
        const l = boneMap.get(chain.lower);
        const e = boneMap.get(chain.end);
        if (!u || !l || !e) {
          pushErr('RIG_IK_INVALID', `rig.ik.${ikId}`, 'upper/lower/end must reference existing bones');
        } else if (l.parent !== u.id || e.parent !== l.id) {
          pushErr('RIG_IK_INVALID', `rig.ik.${ikId}`, `must be parent->child chain: ${chain.upper} -> ${chain.lower} -> ${chain.end}`);
        }
      }

      rigStats = {
        id: rig.id,
        bones: rig.bones.length,
        characters: (rig.characters ?? []).length,
        ikChains: Object.keys(rig.ik ?? {}).length,
      };
    }
  } else {
    warnings.push('rig.json not present (manifest-only prop/scene pack)');
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    packDir,
    stats: { assets: assetsById.size, rig: rigStats },
    errorCount: errors.length,
    errors,
    warnings,
  };
}

// CLI entry
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  printHelp();
  process.exit(args.length === 0 ? 2 : 0);
}
const pretty = args.includes('--pretty');
const target = args.find((a) => !a.startsWith('-'));
if (!target) {
  console.error('Error: missing <PACK_DIR> argument. Run with --help for usage.');
  process.exit(2);
}

const resolved = resolve(target);
if (!existsSync(resolved)) {
  console.error(`Error: directory not found: ${resolved}`);
  process.exit(2);
}

const report = validatePack(resolved);
console.log(JSON.stringify(report, null, 2));
if (pretty) {
  const icon = report.status === 'PASS' ? 'PASS' : 'FAIL';
  console.error(`[${icon}] ${report.packDir} — ${report.stats.assets ?? 0} assets, ${report.errorCount} errors`);
}
process.exit(report.status === 'PASS' ? 0 : 1);
