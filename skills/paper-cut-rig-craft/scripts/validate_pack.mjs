#!/usr/bin/env node
/**
 * Fail-closed validator for paper-studio-v2 compatible paper-cut rig packs (v1.1).
 * Validates manifest.json, all referenced SVGs (allowlist + SHA-256), primary rig.json,
 * and any additional rigs/*.json in multi-character packs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { checkSvgDocument } from './lib/svg-guard.mjs';

function printHelp() {
  console.log(`Usage: node scripts/validate_pack.mjs [OPTIONS] <PACK_DIR>

Validate a paper-cut rig pack (manifest.json, rig.json, rigs/*.json, and all SVGs)
against paper-studio-v2 safety, integrity, <defs> completeness, and kinematic contracts.

Options:
  --json       Emit machine-readable JSON report to stdout (default)
  --pretty     Emit human-readable summary to stderr in addition to JSON
  --help, -h   Show this help message

Exit codes:
  0  PASS (all checks succeeded)
  1  VALIDATION_FAILED (one or more contract violations found)
  2  USAGE_ERROR (missing directory or invalid CLI arguments)`);
}

function checkSvgText(text, where, pushErr) {
  checkSvgDocument(text, where, pushErr, {
    codeUnsafe: 'ART_SVG_UNSAFE',
    codeMissingDef: 'ART_MISSING_DEF',
    checkDefRefs: true,
  });
}

function validateRigFile(rigPath, label, assetsById, pushErr) {
  let rig;
  try {
    rig = JSON.parse(readFileSync(rigPath, 'utf8'));
  } catch (e) {
    pushErr('RIG_JSON_INVALID', label, `invalid JSON: ${e.message}`);
    return null;
  }

  if (rig.schemaVersion !== 1) pushErr('RIG_SCHEMA', `${label}.schemaVersion`, 'expected schemaVersion === 1');
  if (!Array.isArray(rig.bones) || rig.bones.length === 0) {
    pushErr('RIG_SCHEMA', `${label}.bones`, 'must be a non-empty array');
    return null;
  }

  const boneMap = new Map();
  for (const b of rig.bones) {
    if (boneMap.has(b.id)) pushErr('RIG_DUP_BONE', `${label}.bones.${b.id}`, `duplicate bone "${b.id}"`);
    boneMap.set(b.id, b);
  }

  const roots = rig.bones.filter((b) => b.parent === null);
  if (roots.length !== 1) pushErr('RIG_ROOT_COUNT', `${label}.bones`, `expected exactly 1 root bone, found ${roots.length}`);

  for (const b of rig.bones) {
    const where = `${label}.bones.${b.id}`;
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
    pushErr('RIG_CYCLE', `${label}.bones.${stuck?.id}`, 'bone is unreachable from root (cycle detected)');
  }

  for (const ch of rig.characters ?? []) {
    const at = `${label}.characters.${ch.id}`;
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

    for (const [cName, cDef] of Object.entries(rig.contacts ?? {})) {
      const skin = ch.skin?.[cDef.bone];
      if (!skin?.default) {
        pushErr('RIG_CONTACT_BAD_BONE', `${label}.contacts.${cName}`, `bone "${cDef.bone}" has no skin`);
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

  for (const [ikId, chain] of Object.entries(rig.ik ?? {})) {
    const u = boneMap.get(chain.upper);
    const l = boneMap.get(chain.lower);
    const e = boneMap.get(chain.end);
    if (!u || !l || !e) {
      pushErr('RIG_IK_INVALID', `${label}.ik.${ikId}`, 'upper/lower/end must reference existing bones');
    } else if (l.parent !== u.id || e.parent !== l.id) {
      pushErr('RIG_IK_INVALID', `${label}.ik.${ikId}`, `must be parent->child chain: ${chain.upper} -> ${chain.lower} -> ${chain.end}`);
    }
  }

  return {
    file: label,
    id: rig.id,
    bones: rig.bones.length,
    characters: (rig.characters ?? []).length,
    ikChains: Object.keys(rig.ik ?? {}).length,
  };
}

function validatePack(packDir) {
  const errors = [];
  const warnings = [];
  const pushErr = (code, where, detail) => errors.push({ code, where, detail });

  const manifestPath = join(packDir, 'manifest.json');
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

  const rigStats = [];
  const primaryRigPath = join(packDir, 'rig.json');
  if (existsSync(primaryRigPath)) {
    const st = validateRigFile(primaryRigPath, 'rig.json', assetsById, pushErr);
    if (st) rigStats.push(st);
  } else {
    warnings.push('rig.json not present (manifest-only prop/scene pack)');
  }

  const extraDir = join(packDir, 'rigs');
  if (existsSync(extraDir)) {
    for (const fname of readdirSync(extraDir).filter((f) => f.endsWith('.json')).sort()) {
      const st = validateRigFile(join(extraDir, fname), `rigs/${fname}`, assetsById, pushErr);
      if (st) rigStats.push(st);
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    packDir,
    stats: { assets: assetsById.size, rigs: rigStats },
    errorCount: errors.length,
    errors,
    warnings,
  };
}

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
  console.error(`[${icon}] ${report.packDir} — ${report.stats.assets ?? 0} assets, ${report.stats.rigs?.length ?? 0} rig(s), ${report.errorCount} errors`);
}
process.exit(report.status === 'PASS' ? 0 : 1);
