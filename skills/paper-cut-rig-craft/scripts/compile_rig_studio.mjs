#!/usr/bin/env node
/**
 * Compiles a declarative Paper-Cut Rig Blueprint JSON (single `rig` or multi-character `rigs[]`)
 * with fail-closed schema, SVG allowlist, and <defs> integrity validation into:
 *   1. A paper-studio-v2 compatible asset pack (SVGs + manifest.json with SHA-256 + rig.json / rigs/*.json)
 *   2. A standalone interactive Shadow-Box Rig Viewer HTML powered by assets/viewer-shell.html
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_MATERIAL_DEFS,
  buildBacklitPulpFilter,
  buildCutoutBorderFilter,
  buildGouacheGrainFilter,
  buildMaterialPatternMarkup,
  buildPaperBevelFilter,
  buildPaperTexFilter,
  extractDefIds,
  getBuiltinPartDefs,
  getBuiltinViewerDefs,
  isSafeColor,
  scanSvgFragment,
  validateAndBuildCustomMaterials,
} from './lib/svg-guard.mjs';
import { loadKitCatalog, resolveBlueprintKits } from './lib/kit-resolver.mjs';
import { applyStylePreset } from './lib/style-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHELL_PATH = resolve(__dirname, '../assets/viewer-shell.html');
const SHELL_3D_PATH = resolve(__dirname, '../assets/viewer-shell-3d.html');
const ENGINE_3D_PATH = resolve(__dirname, '../assets/sculpted-paper-engine.js');
const VENDOR_BUNDLE_PATH = resolve(__dirname, '../assets/vendor/three-sculpted.bundle.min.js');
const VENDOR_SHA_PATH = resolve(__dirname, '../assets/vendor/three-sculpted.bundle.sha256');
const VALID_LAYER3D_KINDS = new Set([
  'backdrop',
  'celestial_disk',
  'box_frame',
  'extruded_svg',
  'folded_ridge',
  'cupped_petals',
  'pine_fan_tree',
  'botanical_frond',
  'tiered_pine_group',
  'architecture',
  'organic_strata',
  'bonsai_calligraphy',
  'billowing_clouds',
  'sculpted_peony',
  'cutout_relief',
]);
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const VALID_PAPER_FLEX_MODES = new Set(['wing_cup', 'cloth_billow', 'tail_wave', 'branch_sway']);

function printHelp() {
  console.log(`Usage: node scripts/compile_rig_studio.mjs --spec <blueprint.json> [OPTIONS]

Validate and compile a declarative Paper-Cut Rig Blueprint JSON into a paper-studio-v2 pack
and/or a standalone interactive HTML Shadow-Box Rig Viewer.

Options:
  --spec <FILE>        Input blueprint JSON file (required)
  --kit-dir <DIR>      Optional extra modular component kit directory (overrides/extends assets/kit)
  --library-dir <DIR>  Optional private craft library directory (overrides/extends assets/library)
  --out-pack <DIR>     Output directory for SVG + manifest.json + rig.json
  --out-html <FILE>    Output path for standalone interactive preview HTML
  --check              Validate blueprint only without writing output files
  --help, -h           Show this help message

Exit codes:
  0  PASS (validation and compilation succeeded)
  1  VALIDATION_FAILED (blueprint schema, kit, SVG safety, or <defs> error; no files written)
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

function argVals(args, flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
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
      if (p.cardstock != null) {
        if (typeof p.cardstock !== 'object' || Array.isArray(p.cardstock)) {
          pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock`, 'cardstock must be an object');
        } else {
          const cs = p.cardstock;
          if (cs.thickness != null && !(typeof cs.thickness === 'number' && Number.isFinite(cs.thickness) && cs.thickness > 0 && cs.thickness <= 2.5)) {
            pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.thickness`, 'thickness must be a positive number <= 2.5');
          }
          if (cs.bevel != null && !(typeof cs.bevel === 'number' && Number.isFinite(cs.bevel) && cs.bevel >= 0 && cs.bevel <= 0.5)) {
            pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.bevel`, 'bevel must be a finite number in [0, 0.5]');
          }
          if (cs.translucency != null && !(typeof cs.translucency === 'number' && Number.isFinite(cs.translucency) && cs.translucency >= 0 && cs.translucency <= 1)) {
            pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.translucency`, 'translucency must be a finite number in [0, 1]');
          }
          if (cs.edgeColor != null && !isSafeColor(String(cs.edgeColor))) {
            pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.edgeColor`, `invalid edgeColor "${cs.edgeColor}"`);
          }
          if (cs.paperFlex != null) {
            if (typeof cs.paperFlex !== 'object' || Array.isArray(cs.paperFlex)) {
              pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.paperFlex`, 'paperFlex must be an object');
            } else if (cs.paperFlex.mode != null && !VALID_PAPER_FLEX_MODES.has(cs.paperFlex.mode)) {
              pushErr('BP_CARDSTOCK_INVALID', `${where}.cardstock.paperFlex.mode`, `unknown paperFlex mode "${cs.paperFlex.mode}"`);
            }
          }
        }
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
      if (r.hoses != null) {
        if (!Array.isArray(r.hoses)) {
          pushErr('BP_SCHEMA', `${rWhere}.hoses`, 'hoses must be an array');
        } else {
          const boneSet = new Set(r.bones.map((b) => b?.id).filter(Boolean));
          r.hoses.forEach((h, hIdx) => {
            const hWhere = `${rWhere}.hoses[${hIdx}]${h?.id ? ` (${h.id})` : ''}`;
            if (!h || typeof h !== 'object') {
              pushErr('BP_SCHEMA', hWhere, 'hose entry must be an object');
              return;
            }
            for (const k of ['upper', 'lower', 'end']) {
              if (typeof h[k] !== 'string' || !boneSet.has(h[k])) {
                pushErr('BP_RIG_INVALID', `${hWhere}.${k}`, `hose ${k} bone "${h[k]}" does not exist in ${rWhere}.bones`);
              }
            }
          });
        }
      }
      if (r.strands != null) {
        if (!Array.isArray(r.strands)) {
          pushErr('BP_SCHEMA', `${rWhere}.strands`, 'strands must be an array');
        } else {
          const boneSet = new Set(r.bones.map((b) => b?.id).filter(Boolean));
          r.strands.forEach((st, sIdx) => {
            const sWhere = `${rWhere}.strands[${sIdx}]${st?.id ? ` (${st.id})` : ''}`;
            if (!st || typeof st !== 'object') {
              pushErr('BP_SCHEMA', sWhere, 'strand entry must be an object');
              return;
            }
            if (typeof st.id !== 'string' || !st.id.trim()) {
              pushErr('BP_SCHEMA', `${sWhere}.id`, 'strand id must be a non-empty string');
            }
            if (typeof st.bone !== 'string' || !boneSet.has(st.bone)) {
              pushErr('BP_RIG_INVALID', `${sWhere}.bone`, `strand bone "${st.bone}" does not exist in ${rWhere}.bones`);
            }
          });
        }
      }
      if (r.tremor != null) {
        if (typeof r.tremor !== 'object' || Array.isArray(r.tremor)) {
          pushErr('BP_SCHEMA', `${rWhere}.tremor`, 'tremor must be an object');
        } else {
          for (const k of ['ampX', 'ampY', 'ampDeg']) {
            if (r.tremor[k] != null && !(typeof r.tremor[k] === 'number' && Number.isFinite(r.tremor[k]) && r.tremor[k] >= 0)) {
              pushErr('BP_SCHEMA', `${rWhere}.tremor.${k}`, `tremor.${k} must be a non-negative finite number`);
            }
          }
        }
      }
    });
  }

  // SVG allowlist & <defs> integrity scan across scene.* and parts[]
  const sc = bp.scene && typeof bp.scene === 'object' ? bp.scene : {};
  validateAndBuildCustomMaterials(sc.materials, pushErr);
  const customDefsStr = typeof sc.defsSvg === 'string' ? sc.defsSvg : '';
  const customDefIds = extractDefIds(customDefsStr);
  const sceneDefs = new Set([...getBuiltinViewerDefs(sc), ...customDefIds]);
  const partDefs = new Set([...getBuiltinPartDefs(sc), ...customDefIds]);

  // Validate paint & filter references on rig.hoses[], rig.strands[], and bone.seamFilter
  const checkPaintRef = (val, where) => {
    if (val == null) return;
    if (typeof val !== 'string') {
      pushErr('BP_SCHEMA', where, 'paint value must be a string');
      return;
    }
    const trimmed = val.trim();
    const urlM = trimmed.match(/^url\(\s*#([A-Za-z_][\w:.-]*)\s*\)$/);
    if (urlM) {
      if (!sceneDefs.has(urlM[1])) {
        pushErr('BP_MISSING_DEF', where, `referenced "#${urlM[1]}" is not declared in <defs>`);
      }
    } else if (!isSafeColor(trimmed)) {
      pushErr('BP_SVG_UNSAFE', where, `unsafe or invalid paint value "${val}"`);
    }
  };
  for (const [rIdx, r] of rigList.entries()) {
    if (!r || typeof r !== 'object') continue;
    for (const [hIdx, h] of (Array.isArray(r.hoses) ? r.hoses : []).entries()) {
      if (!h || typeof h !== 'object') continue;
      const hWhere = `rigs[${rIdx}].hoses[${hIdx}]`;
      checkPaintRef(h.fill, `${hWhere}.fill`);
      checkPaintRef(h.lowerFill, `${hWhere}.lowerFill`);
      checkPaintRef(h.cuffFill, `${hWhere}.cuffFill`);
      checkPaintRef(h.rimColor, `${hWhere}.rimColor`);
      if (h.filter != null && h.filter !== 'none' && (typeof h.filter !== 'string' || !sceneDefs.has(h.filter))) {
        pushErr('BP_MISSING_DEF', `${hWhere}.filter`, `hose filter "${h.filter}" is not declared in <defs>`);
      }
    }
    for (const [sIdx, st] of (Array.isArray(r.strands) ? r.strands : []).entries()) {
      if (!st || typeof st !== 'object') continue;
      const sWhere = `rigs[${rIdx}].strands[${sIdx}]`;
      checkPaintRef(st.fill, `${sWhere}.fill`);
      checkPaintRef(st.stripeColor, `${sWhere}.stripeColor`);
      checkPaintRef(st.rimColor, `${sWhere}.rimColor`);
      if (st.filter != null && st.filter !== 'none' && (typeof st.filter !== 'string' || !sceneDefs.has(st.filter))) {
        pushErr('BP_MISSING_DEF', `${sWhere}.filter`, `strand filter "${st.filter}" is not declared in <defs>`);
      }
    }
    for (const b of (Array.isArray(r.bones) ? r.bones : [])) {
      if (b?.seamFilter != null && b.seamFilter !== 'none' && (typeof b.seamFilter !== 'string' || !sceneDefs.has(b.seamFilter))) {
        pushErr('BP_MISSING_DEF', `rigs[${rIdx}].bones.${b.id}.seamFilter`, `seamFilter "${b.seamFilter}" is not declared in <defs>`);
      }
    }
  }

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
  if (sc.cadence != null) {
    if (typeof sc.cadence !== 'object' || Array.isArray(sc.cadence)) {
      pushErr('BP_SCHEMA', 'scene.cadence', 'scene.cadence must be an object');
    } else {
      if (sc.cadence.charFps != null && !(typeof sc.cadence.charFps === 'number' && Number.isFinite(sc.cadence.charFps) && sc.cadence.charFps >= 0)) {
        pushErr('BP_SCHEMA', 'scene.cadence.charFps', 'scene.cadence.charFps must be a non-negative finite number');
      }
      if (sc.cadence.cameraDrift != null && !(typeof sc.cadence.cameraDrift === 'number' && Number.isFinite(sc.cadence.cameraDrift) && sc.cadence.cameraDrift >= 0)) {
        pushErr('BP_SCHEMA', 'scene.cadence.cameraDrift', 'scene.cadence.cameraDrift must be a non-negative finite number');
      }
    }
  }
  if (sc.renderMode != null && sc.renderMode !== 'svg2d' && sc.renderMode !== 'sculpted3d') {
    pushErr('BP_SCHEMA', 'scene.renderMode', `scene.renderMode must be "svg2d" or "sculpted3d", got "${sc.renderMode}"`);
  }
  if (sc.boxCavity != null && (typeof sc.boxCavity !== 'object' || Array.isArray(sc.boxCavity))) {
    pushErr('BP_SCENE3D_INVALID', 'scene.boxCavity', 'scene.boxCavity must be an object');
  }
  if (sc.lighting3d != null && (typeof sc.lighting3d !== 'object' || Array.isArray(sc.lighting3d))) {
    pushErr('BP_SCENE3D_INVALID', 'scene.lighting3d', 'scene.lighting3d must be an object');
  }
  if (sc.layers3d != null) {
    if (!Array.isArray(sc.layers3d)) {
      pushErr('BP_SCENE3D_INVALID', 'scene.layers3d', 'scene.layers3d must be an array');
    } else {
      const l3dIds = new Set();
      sc.layers3d.forEach((l, idx) => {
        const lWhere = `scene.layers3d[${idx}]${l?.id ? ` (${l.id})` : ''}`;
        if (!l || typeof l !== 'object') {
          pushErr('BP_SCENE3D_INVALID', lWhere, 'layer3d entry must be an object');
          return;
        }
        if (typeof l.id !== 'string' || !l.id.trim()) {
          pushErr('BP_SCENE3D_INVALID', `${lWhere}.id`, 'layer3d id must be a non-empty string');
        } else if (l3dIds.has(l.id)) {
          pushErr('BP_SCENE3D_INVALID', `${lWhere}.id`, `duplicate layer3d id "${l.id}"`);
        } else {
          l3dIds.add(l.id);
        }
        if (!VALID_LAYER3D_KINDS.has(l.kind)) {
          pushErr('BP_SCENE3D_INVALID', `${lWhere}.kind`, `unknown layer3d kind "${l.kind}"`);
        }
        if (typeof l.z !== 'number' || !Number.isFinite(l.z)) {
          pushErr('BP_SCENE3D_INVALID', `${lWhere}.z`, 'layer3d z must be a finite number');
        }
        if (l.color != null && !isSafeColor(String(l.color))) {
          pushErr('BP_SCENE3D_INVALID', `${lWhere}.color`, `invalid color "${l.color}"`);
        }
        if (l.kind === 'cutout_relief') {
          if (typeof l.imageDataUrl !== 'string' || !SAFE_DATA_IMAGE_RE.test(l.imageDataUrl)) {
            pushErr('BP_SCENE3D_INVALID', `${lWhere}.imageDataUrl`, 'cutout_relief requires an embedded data:image/(png|webp|jpeg);base64,... URI');
          }
        }
      });
    }
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
  for (const [idx, pl] of (Array.isArray(sc.midLayers) ? sc.midLayers : []).entries()) {
    scanScene(pl?.svg, `scene.midLayers[${idx}].svg`);
  }
  for (const [idx, pl] of (Array.isArray(sc.frontLayers) ? sc.frontLayers : []).entries()) {
    scanScene(pl?.svg, `scene.frontLayers[${idx}].svg`);
  }
  for (const [idx, cl] of (Array.isArray(sc.clusters) ? sc.clusters : []).entries()) {
    if (cl?.shapeSvg != null) {
      const normalized = typeof cl.shapeSvg === 'string'
        ? cl.shapeSvg.replace(/FILL_A|FILL_B|FILL_C/g, '#000000')
        : cl.shapeSvg;
      scanScene(normalized, `scene.clusters[${idx}].shapeSvg`);
    }
    if (Array.isArray(cl?.shapesSvg)) {
      cl.shapesSvg.forEach((sh, sIdx) => {
        const normalized = typeof sh === 'string' ? sh.replace(/FILL_A|FILL_B|FILL_C/g, '#000000') : sh;
        scanScene(normalized, `scene.clusters[${idx}].shapesSvg[${sIdx}]`);
      });
    }
  }
  for (const [idx, em] of (Array.isArray(sc.emitters) ? sc.emitters : []).entries()) {
    if (Array.isArray(em?.shapesSvg)) {
      em.shapesSvg.forEach((sh, sIdx) => {
        const normalized = typeof sh === 'string' ? sh.replace(/FILL_A|FILL_B|FILL_C|CURRENT/g, '#000000') : sh;
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
  const scanEmote = (em, where) => {
    if (em && typeof em === 'object' && em.svg != null) scanScene(em.svg, `${where}.svg`);
  };
  for (const [mIdx, m] of (Array.isArray(bp.motions) ? bp.motions : []).entries()) {
    scanEmote(m?.emote, `motions[${mIdx}].emote`);
    if (m?.rigs && typeof m.rigs === 'object') {
      for (const [rId, rs] of Object.entries(m.rigs)) scanEmote(rs?.emote, `motions[${mIdx}].rigs.${rId}.emote`);
    }
    for (const [pIdx, ph] of (Array.isArray(m?.phases) ? m.phases : []).entries()) {
      scanEmote(ph?.emote, `motions[${mIdx}].phases[${pIdx}].emote`);
      if (ph?.rigs && typeof ph.rigs === 'object') {
        for (const [rId, rs] of Object.entries(ph.rigs)) {
          scanEmote(rs?.emote, `motions[${mIdx}].phases[${pIdx}].rigs.${rId}.emote`);
        }
      }
      if (ph?.vfx && typeof ph.vfx === 'object') {
        if (ph.vfx.burst?.svg != null) {
          const normBurst = typeof ph.vfx.burst.svg === 'string'
            ? ph.vfx.burst.svg.replace(/FILL_A|FILL_B|FILL_C/g, '#000000')
            : ph.vfx.burst.svg;
          scanScene(normBurst, `motions[${mIdx}].phases[${pIdx}].vfx.burst.svg`);
        }
        if (ph.vfx.particles?.shapeSvg != null) {
          const normPart = typeof ph.vfx.particles.shapeSvg === 'string'
            ? ph.vfx.particles.shapeSvg.replace(/FILL_A|FILL_B|FILL_C/g, '#000000')
            : ph.vfx.particles.shapeSvg;
          scanScene(normPart, `motions[${mIdx}].phases[${pIdx}].vfx.particles.shapeSvg`);
        }
      }
    }
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

function wrapPartSvg(part, scene, seed) {
  const [w, h] = part.size;
  const [ox, oy] = part.pivot;
  const svgStr = part.svg ?? '';
  let extraDefs = '';
  if (svgStr.includes('#paperBevelSoft')) {
    extraDefs += buildPaperBevelFilter(scene?.lighting, 'paperBevelSoft', 0.65);
  }
  if (/#paperBevel(?![A-Za-z0-9_-])/.test(svgStr)) {
    extraDefs += buildPaperBevelFilter(scene?.lighting, 'paperBevel', 1);
  }
  if (svgStr.includes('#gouacheGrain')) {
    extraDefs += buildGouacheGrainFilter(seed);
  }
  if (svgStr.includes('#cutoutBorder')) {
    extraDefs += buildCutoutBorderFilter(scene?.lighting);
  }
  if (svgStr.includes('#backlitPulp')) {
    extraDefs += buildBacklitPulpFilter(scene?.lighting, seed);
  }
  const allMaterials = [
    ...BUILTIN_MATERIAL_DEFS,
    ...(Array.isArray(scene?.materials) ? scene.materials : []),
  ];
  for (const m of allMaterials) {
    if (m?.id && svgStr.includes(`#${m.id}`)) {
      extraDefs += buildMaterialPatternMarkup(m);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${buildPaperTexFilter(seed)}${extraDefs}${scene?.defsSvg ?? ''}</defs><g transform="translate(${ox},${oy})" filter="url(#paperTex)">${svgStr}</g></svg>\n`;
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
const extraKitDirs = [...argVals(args, '--kit-dir'), ...argVals(args, '--library-dir')];
const outPack = argVal(args, '--out-pack');
const outHtml = argVal(args, '--out-html');
const checkOnly = args.includes('--check');

if (!specPath || (!checkOnly && !outPack && !outHtml)) {
  console.error('Error: --spec and at least one of --out-pack, --out-html, or --check are required.');
  process.exit(2);
}

const resolvedSpec = resolve(specPath);
let rawBp;
try {
  rawBp = JSON.parse(readFileSync(resolvedSpec, 'utf8'));
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

const preErrors = [];
const pushPreErr = (code, where, detail) => preErrors.push({ code, where, detail });
const styledBp = applyStylePreset(rawBp, pushPreErr);
const kitCatalog = loadKitCatalog(extraKitDirs, pushPreErr);
const bp = resolveBlueprintKits(styledBp, kitCatalog, pushPreErr);

const validationErrors = [...preErrors, ...validateBlueprint(bp)];
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
const isSculpted3d = bp.scene?.renderMode === 'sculpted3d';
const result = { status: 'PASS', renderMode: isSculpted3d ? 'sculpted3d' : 'svg2d', spec: resolvedSpec, pack: null, html: null };

function buildSharedDefsFor3d(scene, seed) {
  let defs = buildPaperTexFilter(seed)
    + buildPaperBevelFilter(scene?.lighting, 'paperBevel', 1)
    + buildPaperBevelFilter(scene?.lighting, 'paperBevelSoft', 0.65)
    + buildGouacheGrainFilter(seed)
    + buildCutoutBorderFilter(scene?.lighting)
    + buildBacklitPulpFilter(scene?.lighting, seed);
  const allMaterials = [
    ...BUILTIN_MATERIAL_DEFS,
    ...(Array.isArray(scene?.materials) ? scene.materials : []),
  ];
  for (const m of allMaterials) {
    if (m?.id) defs += buildMaterialPatternMarkup(m);
  }
  defs += scene?.defsSvg ?? '';
  return defs;
}

if (outPack && !checkOnly) {
  const packDir = resolve(outPack);
  mkdirSync(packDir, { recursive: true });
  const manifestAssets = [];
  const seed = bp.meta?.seed ?? 13;

  for (const part of bp.parts) {
    const category = part.category ?? 'body';
    const relFile = `${category}/${part.id}.svg`;
    mkdirSync(join(packDir, category), { recursive: true });
    const svgText = wrapPartSvg(part, bp.scene, seed);
    writeFileSync(join(packDir, relFile), svgText, 'utf8');
    manifestAssets.push({
      id: part.id,
      file: relFile,
      width: part.size[0],
      height: part.size[1],
      pivot: part.pivot,
      anchors: part.anchors ?? {},
      category,
      ...(part.cardstock ? { cardstock: part.cardstock } : {}),
      sha256: createHash('sha256').update(svgText).digest('hex'),
    });
  }

  let scene3dRef = null;
  if (isSculpted3d) {
    const scene3dDoc = {
      schemaVersion: 1,
      style: bp.style ?? null,
      boxCavity: bp.scene?.boxCavity ?? null,
      lighting3d: bp.scene?.lighting3d ?? null,
      layers3d: bp.scene?.layers3d ?? [],
    };
    const s3dText = JSON.stringify(scene3dDoc, null, 2) + '\n';
    writeFileSync(join(packDir, 'scene3d.json'), s3dText, 'utf8');
    scene3dRef = {
      file: 'scene3d.json',
      sha256: createHash('sha256').update(s3dText).digest('hex'),
    };
  }

  const manifest = {
    schemaVersion: 1,
    id: bp.meta.packId ?? rigList[0].id,
    version: bp.meta.version ?? '0.1.0',
    ...(scene3dRef ? { scene3d: scene3dRef } : {}),
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
    ...(scene3dRef ? { scene3d: scene3dRef.file } : {}),
    extraRigFiles,
  };
}

if (outHtml && !checkOnly) {
  const htmlPath = resolve(outHtml);
  mkdirSync(dirname(htmlPath), { recursive: true });
  const safeJson = JSON.stringify(bp).replace(/<\/script/gi, '<\\/script');
  let html;

  if (isSculpted3d) {
    if (!existsSync(VENDOR_BUNDLE_PATH) || !existsSync(VENDOR_SHA_PATH)) {
      console.error('FAIL [VENDOR_MISSING]: three-sculpted.bundle.min.js or .sha256 missing');
      process.exit(1);
    }
    const vendorRaw = readFileSync(VENDOR_BUNDLE_PATH);
    const actualSha = createHash('sha256').update(vendorRaw).digest('hex');
    const expectedSha = readFileSync(VENDOR_SHA_PATH, 'utf8').trim().split(/\s+/)[0];
    if (actualSha !== expectedSha) {
      console.error(`FAIL [VENDOR_SHA_MISMATCH]: expected ${expectedSha}, got ${actualSha}`);
      process.exit(1);
    }
    const vendorUri = 'data:text/javascript;base64,' + vendorRaw.toString('base64');
    const engineUri = 'data:text/javascript;base64,' + readFileSync(ENGINE_3D_PATH).toString('base64');
    const sharedDefs = buildSharedDefsFor3d(bp.scene, bp.meta?.seed ?? 13);
    const safeDefsJson = JSON.stringify(sharedDefs).replace(/<\/script/gi, '<\\/script');
    const shell3d = readFileSync(SHELL_3D_PATH, 'utf8');
    html = shell3d
      .replace('__TITLE__', (bp.meta.title ?? 'Paper-Cut 3D Studio').replace(/[<>]/g, ''))
      .replace('__THREE_BUNDLE_URI__', vendorUri)
      .replace('__SCULPTED_ENGINE_URI__', engineUri)
      .replace('__SHARED_SVG_DEFS_JSON__', safeDefsJson)
      .replace('__BLUEPRINT_JSON__', safeJson);
  } else {
    const shell = readFileSync(SHELL_PATH, 'utf8');
    html = shell
      .replace('__TITLE__', (bp.meta.title ?? 'Paper-Cut Rig Studio').replace(/[<>]/g, ''))
      .replace('__BLUEPRINT_JSON__', safeJson);
  }

  writeFileSync(htmlPath, html, 'utf8');
  result.html = { path: htmlPath, bytes: Buffer.byteLength(html, 'utf8') };
}

console.log(JSON.stringify(result, null, 2));
