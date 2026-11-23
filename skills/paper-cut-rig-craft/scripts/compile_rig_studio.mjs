#!/usr/bin/env node
/**
 * Compiles a declarative Paper-Cut Rig Blueprint JSON (single `rig` or multi-character `rigs[]`)
 * with fail-closed schema, SVG allowlist, and <defs> integrity validation into:
 *   1. A paper-studio-v2 compatible asset pack (SVGs + manifest.json with SHA-256 + rig.json / rigs/*.json)
 *   2. A standalone interactive Shadow-Box Rig Viewer HTML powered by assets/viewer-shell.html
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaperTexFilter,
  extractDefIds,
  getBuiltinViewerDefs,
  scanSvgFragment,
} from './lib/svg-guard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHELL_PATH = resolve(__dirname, '../assets/viewer-shell.html');

function printHelp() {
  console.log(`Usage: node scripts/compile_rig_studio.mjs --spec <blueprint.json> [OPTIONS]

Validate and compile a declarative Paper-Cut Rig Blueprint JSON into a paper-studio-v2 pack
and/or a standalone interactive HTML Shadow-Box Rig Viewer.

Options:
  --spec <FILE>      Input blueprint JSON file (required)
  --out-pack <DIR>   Output directory for SVG + manifest.json + rig.json
  --out-html <FILE>  Output path for standalone interactive preview HTML
  --check            Validate blueprint only without writing output files
  --help, -h         Show this help message

Exit codes:
  0  PASS (validation and compilation succeeded)
  1  VALIDATION_FAILED (blueprint schema, SVG safety, or <defs> error; no files written)
  2  USAGE_ERROR (missing required flags or unreadable spec file)

Example:
  node scripts/compile_rig_studio.mjs \\
    --spec diorama.blueprint.json \\
    --out-pack ./out/diorama-v1 \\
    --out-html ./out/diorama_studio.html`);
}

function argVal(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function isFinitePair(v) {
  return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

function validateBlueprint(bp) {
  const errors = [];
  const pushErr = (code, where, detail) => errors.push({ code, where, detail });

  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) {
    pushErr('BP_SCHEMA', 'root', 'blueprint must be a JSON object');
    return errors;
  }

  if (!bp.meta || typeof bp.meta !== 'object' || typeof bp.meta.title !== 'string' || !bp.meta.title.trim()) {
    pushErr('BP_SCHEMA', 'meta.title', 'meta.title must be a non-empty string');
  }
  if (!bp.scene || typeof bp.scene !== 'object' || Array.isArray(bp.scene)) {
    pushErr('BP_SCHEMA', 'scene', 'scene must be an object');
  }

  const partIds = new Set();
  if (!Array.isArray(bp.parts) || bp.parts.length === 0) {
    pushErr('BP_SCHEMA', 'parts', 'parts must be a non-empty array');
  } else {
    bp.parts.forEach((p, idx) => {
      const where = `parts[${idx}]${p?.id ? ` (${p.id})` : ''}`;
      if (!p || typeof p !== 'object') {
        pushErr('BP_SCHEMA', where, 'part must be an object');
        return;
      }
      if (typeof p.id !== 'string' || !p.id.trim()) {
        pushErr('BP_SCHEMA', `${where}.id`, 'part id must be a non-empty string');
      } else if (partIds.has(p.id)) {
        pushErr('BP_DUP_PART', `${where}.id`, `duplicate part id "${p.id}"`);
      } else {
        partIds.add(p.id);
      }
      if (!isFinitePair(p.size) || p.size[0] <= 0 || p.size[1] <= 0) {
        pushErr('BP_SCHEMA', `${where}.size`, 'size must be [width, height] with positive finite numbers');
      }
      if (!isFinitePair(p.pivot)) {
        pushErr('BP_SCHEMA', `${where}.pivot`, 'pivot must be [x, y] finite numbers');
      }
      if (typeof p.svg !== 'string' || !p.svg.trim()) {
        pushErr('BP_SCHEMA', `${where}.svg`, 'svg must be a non-empty SVG fragment string');
      }
    });
  }

  const rigList = Array.isArray(bp.rigs) && bp.rigs.length > 0 ? bp.rigs : (bp.rig ? [bp.rig] : []);
  if (rigList.length === 0) {
    pushErr('BP_SCHEMA', 'rigs', 'blueprint must define rigs[] (non-empty array) or rig');
  } else {
    const rigIds = new Set();
    rigList.forEach((r, rIdx) => {
      const rWhere = `rigs[${rIdx}]${r?.id ? ` (${r.id})` : ''}`;
      if (!r || typeof r !== 'object') {
        pushErr('BP_SCHEMA', rWhere, 'rig must be an object');
        return;
      }
      if (typeof r.id !== 'string' || !r.id.trim()) {
        pushErr('BP_SCHEMA', `${rWhere}.id`, 'rig id must be a non-empty string');
      } else if (rigIds.has(r.id)) {
        pushErr('BP_RIG_INVALID', `${rWhere}.id`, `duplicate rig id "${r.id}"`);
      } else {
        rigIds.add(r.id);
      }
      if (!Array.isArray(r.bones) || r.bones.length === 0) {
        pushErr('BP_SCHEMA', `${rWhere}.bones`, 'bones must be a non-empty array');
        return;
      }
      for (const b of r.bones) {
        const bWhere = `${rWhere}.bones.${b?.id ?? '?'}`;
        if (!b || typeof b.id !== 'string' || !b.id.trim()) {
          pushErr('BP_SCHEMA', bWhere, 'bone id must be a non-empty string');
          continue;
        }
        if ((b.parent === null) !== (b.attach === null)) {
          pushErr('BP_RIG_INVALID', bWhere, 'attach must be null if and only if parent is null');
        }
        if (!b.limits || typeof b.limits.min !== 'number' || typeof b.limits.max !== 'number' || !(b.limits.min < b.limits.max)) {
          pushErr('BP_RIG_INVALID', `${bWhere}.limits`, 'limits.min must be < limits.max');
        }
        if (partIds.size > 0 && typeof b.part === 'string' && !partIds.has(b.part)) {
          pushErr('BP_RIG_INVALID', `${bWhere}.part`, `part "${b.part}" is not declared in parts[]`);
        }
        if (b.variants && typeof b.variants === 'object') {
          for (const [vName, pId] of Object.entries(b.variants)) {
            if (partIds.size > 0 && !partIds.has(pId)) {
              pushErr('BP_RIG_INVALID', `${bWhere}.variants.${vName}`, `variant part "${pId}" is not declared in parts[]`);
            }
          }
        }
      }
    });
  }

  // SVG allowlist & <defs> integrity scan across scene.* and parts[]
  const sc = bp.scene && typeof bp.scene === 'object' ? bp.scene : {};
  const customDefsStr = typeof sc.defsSvg === 'string' ? sc.defsSvg : '';
  const customDefIds = extractDefIds(customDefsStr);
  const sceneDefs = new Set([...getBuiltinViewerDefs(sc), ...customDefIds]);
  const partDefs = new Set(['paperTex', ...customDefIds]);

  const scanScene = (svg, where) => {
    if (svg == null) return;
    scanSvgFragment(svg, where, pushErr, {
      codeUnsafe: 'BP_SVG_UNSAFE',
      codeMissingDef: 'BP_MISSING_DEF',
      knownDefIds: sceneDefs,
      checkDefRefs: true,
    });
  };

  if (sc.width != null && !(typeof sc.width === 'number' && Number.isFinite(sc.width) && sc.width > 0)) {
    pushErr('BP_SCHEMA', 'scene.width', 'scene.width must be a positive number');
  }
  if (sc.height != null && !(typeof sc.height === 'number' && Number.isFinite(sc.height) && sc.height > 0)) {
    pushErr('BP_SCHEMA', 'scene.height', 'scene.height must be a positive number');
  }
  if (sc.defsSvg != null) scanScene(sc.defsSvg, 'scene.defsSvg');
  if (sc.skySvg != null) scanScene(sc.skySvg, 'scene.skySvg');
  if (sc.frameSvg != null) scanScene(sc.frameSvg, 'scene.frameSvg');
  if (sc.cornersSvg != null) scanScene(sc.cornersSvg, 'scene.cornersSvg');

  if (sc.atmosphere && typeof sc.atmosphere === 'object') {
    if (sc.atmosphere.lightShaftsSvg != null) scanScene(sc.atmosphere.lightShaftsSvg, 'scene.atmosphere.lightShaftsSvg');
    if (sc.atmosphere.midMistSvg != null) scanScene(sc.atmosphere.midMistSvg, 'scene.atmosphere.midMistSvg');
    if (sc.atmosphere.foregroundGlowSvg != null) scanScene(sc.atmosphere.foregroundGlowSvg, 'scene.atmosphere.foregroundGlowSvg');
  }
  if (sc.celestial && typeof sc.celestial === 'object') {
    if (sc.celestial.coreSvg != null) scanScene(sc.celestial.coreSvg, 'scene.celestial.coreSvg');
    if (sc.celestial.orbitSvg != null) scanScene(sc.celestial.orbitSvg, 'scene.celestial.orbitSvg');
  }
  for (const [idx, pl] of (Array.isArray(sc.backLayers) ? sc.backLayers : []).entries()) {
    scanScene(pl?.svg, `scene.backLayers[${idx}].svg`);
  }
  for (const [idx, pl] of (Array.isArray(sc.frontLayers) ? sc.frontLayers : []).entries()) {
    scanScene(pl?.svg, `scene.frontLayers[${idx}].svg`);
  }
  for (const [idx, cl] of (Array.isArray(sc.clusters) ? sc.clusters : []).entries()) {
    if (cl?.shapeSvg != null) {
      const normalized = typeof cl.shapeSvg === 'string'
        ? cl.shapeSvg.replace(/FILL_A|FILL_B/g, '#000000')
        : cl.shapeSvg;
      scanScene(normalized, `scene.clusters[${idx}].shapeSvg`);
    }
  }
  for (const [idx, em] of (Array.isArray(sc.emitters) ? sc.emitters : []).entries()) {
    if (Array.isArray(em?.shapesSvg)) {
      em.shapesSvg.forEach((sh, sIdx) => {
        const normalized = typeof sh === 'string' ? sh.replace(/FILL_A|FILL_B|CURRENT/g, '#000000') : sh;
        scanScene(normalized, `scene.emitters[${idx}].shapesSvg[${sIdx}]`);
      });
    }
    if (em?.type === 'meteor' && em.gradId && !sceneDefs.has(em.gradId)) {
      pushErr(
        'BP_MISSING_DEF',
        `scene.emitters[${idx}].gradId`,
        `meteor gradId "#${em.gradId}" is not declared in <defs>. Available defs: [${[...sceneDefs].sort().join(', ')}]`,
      );
    }
  }
  for (const [idx, sw] of (Array.isArray(sc.swarms) ? sc.swarms : []).entries()) {
    if (sw?.bodySvg != null) scanScene(sw.bodySvg, `scene.swarms[${idx}].bodySvg`);
    if (sw?.tailSvg != null) scanScene(sw.tailSvg, `scene.swarms[${idx}].tailSvg`);
  }
  for (const [idx, op] of (Array.isArray(sc.overlayProps) ? sc.overlayProps : []).entries()) {
    if (op?.svg != null) scanScene(op.svg, `scene.overlayProps[${idx}].svg`);
  }

  if (Array.isArray(bp.parts)) {
    bp.parts.forEach((p, idx) => {
      if (typeof p?.svg === 'string') {
        scanSvgFragment(p.svg, `parts[${idx}] (${p.id ?? '?'}).svg`, pushErr, {
          codeUnsafe: 'BP_SVG_UNSAFE',
          codeMissingDef: 'BP_MISSING_DEF',
          knownDefIds: partDefs,
          checkDefRefs: true,
        });
      }
    });
  }

  return errors;
}

function wrapPartSvg(part, sharedDefs, seed) {
  const [w, h] = part.size;
  const [ox, oy] = part.pivot;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${buildPaperTexFilter(seed)}${sharedDefs ?? ''}</defs><g transform="translate(${ox},${oy})" filter="url(#paperTex)">${part.svg}</g></svg>\n`;
}

function buildRigDoc(r) {
  const skin = {};
  const rest = {};
  for (const b of r.bones) {
    skin[b.id] = b.variants ? { default: b.part, variants: b.variants } : { default: b.part };
    rest[b.id] = b.rest ?? 0;
  }
  return {
    schemaVersion: 1,
    id: r.id,
    ...(r.sides ? { sides: r.sides } : {}),
    bones: r.bones.map((b) => ({
      id: b.id,
      parent: b.parent,
      attach: b.attach,
      limits: b.limits,
      z: b.z ?? 0,
      maxDegPerFrame: b.maxDegPerFrame ?? 12,
    })),
    ...(r.contacts ? { contacts: r.contacts } : {}),
    ...(r.ground ? { ground: r.ground } : {}),
    ...(r.ik ? { ik: r.ik } : {}),
    ...(r.gait ? { gait: r.gait } : {}),
    characters: [
      {
        id: r.characterId ?? r.id,
        skin,
        rest,
      },
    ],
  };
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  printHelp();
  process.exit(args.length === 0 ? 2 : 0);
}

const specPath = argVal(args, '--spec');
const outPack = argVal(args, '--out-pack');
const outHtml = argVal(args, '--out-html');
const checkOnly = args.includes('--check');

if (!specPath || (!checkOnly && !outPack && !outHtml)) {
  console.error('Error: --spec and at least one of --out-pack, --out-html, or --check are required.');
  process.exit(2);
}

const resolvedSpec = resolve(specPath);
let bp;
try {
  bp = JSON.parse(readFileSync(resolvedSpec, 'utf8'));
} catch (err) {
  const report = {
    status: 'FAIL',
    spec: resolvedSpec,
    errorCount: 1,
    errors: [{ code: 'BP_JSON_INVALID', where: resolvedSpec, detail: `failed to parse JSON: ${err.message}` }],
  };
  console.log(JSON.stringify(report, null, 2));
  console.error(`[FAIL] ${resolvedSpec} — invalid JSON: ${err.message}`);
  process.exit(1);
}

const validationErrors = validateBlueprint(bp);
if (validationErrors.length > 0) {
  const report = {
    status: 'FAIL',
    spec: resolvedSpec,
    errorCount: validationErrors.length,
    errors: validationErrors,
  };
  console.log(JSON.stringify(report, null, 2));
  console.error(`[FAIL] ${resolvedSpec} — ${validationErrors.length} blueprint error(s); no output written`);
  process.exit(1);
}

const rigList = Array.isArray(bp.rigs) && bp.rigs.length > 0 ? bp.rigs : [bp.rig];
const result = { status: 'PASS', spec: resolvedSpec, pack: null, html: null };

if (outPack && !checkOnly) {
  const packDir = resolve(outPack);
  mkdirSync(packDir, { recursive: true });
  const manifestAssets = [];
  const seed = bp.meta?.seed ?? 13;

  for (const part of bp.parts) {
    const category = part.category ?? 'body';
    const relFile = `${category}/${part.id}.svg`;
    mkdirSync(join(packDir, category), { recursive: true });
    const svgText = wrapPartSvg(part, bp.scene?.defsSvg ?? '', seed);
    writeFileSync(join(packDir, relFile), svgText, 'utf8');
    manifestAssets.push({
      id: part.id,
      file: relFile,
      width: part.size[0],
      height: part.size[1],
      pivot: part.pivot,
      anchors: part.anchors ?? {},
      category,
      sha256: createHash('sha256').update(svgText).digest('hex'),
    });
  }

  const manifest = {
    schemaVersion: 1,
    id: bp.meta.packId ?? rigList[0].id,
    version: bp.meta.version ?? '0.1.0',
    assets: manifestAssets,
  };
  writeFileSync(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const primaryRig = buildRigDoc(rigList[0]);
  writeFileSync(join(packDir, 'rig.json'), JSON.stringify(primaryRig, null, 2) + '\n', 'utf8');

  const extraRigFiles = [];
  if (rigList.length > 1) {
    mkdirSync(join(packDir, 'rigs'), { recursive: true });
    for (const r of rigList) {
      const f = join(packDir, 'rigs', `${r.id}.json`);
      writeFileSync(f, JSON.stringify(buildRigDoc(r), null, 2) + '\n', 'utf8');
      extraRigFiles.push(`rigs/${r.id}.json`);
    }
  }

  result.pack = {
    dir: packDir,
    assetCount: manifestAssets.length,
    rigCount: rigList.length,
    totalBones: rigList.reduce((s, r) => s + r.bones.length, 0),
    extraRigFiles,
  };
}

if (outHtml && !checkOnly) {
  const htmlPath = resolve(outHtml);
  mkdirSync(dirname(htmlPath), { recursive: true });
  const shell = readFileSync(SHELL_PATH, 'utf8');
  const safeJson = JSON.stringify(bp).replace(/<\/script/gi, '<\\/script');
  const html = shell
    .replace('__TITLE__', (bp.meta.title ?? 'Paper-Cut Rig Studio').replace(/[<>]/g, ''))
    .replace('__BLUEPRINT_JSON__', safeJson);
  writeFileSync(htmlPath, html, 'utf8');
  result.html = { path: htmlPath, bytes: Buffer.byteLength(html, 'utf8') };
}

console.log(JSON.stringify(result, null, 2));
