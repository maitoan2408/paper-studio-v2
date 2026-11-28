/**
 * Fail-closed Material, 3D Relief & Optional Raster Cutout Library loader/resolver
 * for paper-cut-rig-craft (v5.1).
 *
 * Manages:
 *  - pbr-paper      (assets/library/materials/*.json)  -> parts[].materialRef
 *  - procedural-3d  (assets/library/reliefs3d/*.json)  -> scene.layers3d[].reliefRef
 *  - cutout-raster  (assets/library/cutouts/*.json)    -> scene.layers3d[].cutoutRef (optional!)
 *
 * Pure svg-2d + procedural-3d + pbr-paper scenes operate 100% independently without
 * requiring any cutout-raster assets. Zero external npm dependencies, deterministic,
 * and fail-closed on missing IDs, SHA-256 mismatches, path traversal, or invalid magic bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuiltinViewerDefs, isSafeColor, scanSvgFragment } from './svg-guard.mjs';
import { listAvailableStyles, STYLES_DIR } from './style-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LIBRARY_DIR = resolve(__dirname, '../../assets/library');
export const DEFAULT_KIT_DIR = resolve(__dirname, '../../assets/kit');

export const VALID_LAYER3D_KINDS = new Set([
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

const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ALLOWED_CUTOUT_MIME = new Map([
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const DEFAULT_MAX_CUTOUT_BYTES = 4 * 1024 * 1024; // 4 MiB safety cap

function sha256Buf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function isConfinedSubpath(rootDir, relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) return false;
  if (/^(https?:|data:|file:|\/\/)/i.test(relPath.trim())) return false;
  if (relPath.includes('\0') || relPath.startsWith('/') || relPath.startsWith('\\')) return false;
  const full = resolve(rootDir, relPath);
  const rel = relative(rootDir, full);
  return rel !== '' && !rel.startsWith('..') && !resolve(rel).startsWith(resolve(rootDir, '..'));
}

function hasValidMagicBytes(buf, mimeType) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (mimeType === 'image/png') {
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function validateCardstockFields(cs, where, pushErr) {
  if (!cs || typeof cs !== 'object' || Array.isArray(cs)) {
    pushErr('LIB_SCHEMA', where, 'cardstock must be an object');
    return false;
  }
  let ok = true;
  if (cs.thickness != null && !(typeof cs.thickness === 'number' && Number.isFinite(cs.thickness) && cs.thickness > 0 && cs.thickness <= 2.5)) {
    pushErr('LIB_SCHEMA', `${where}.thickness`, 'thickness must be a positive number <= 2.5');
    ok = false;
  }
  if (cs.bevel != null && !(typeof cs.bevel === 'number' && Number.isFinite(cs.bevel) && cs.bevel >= 0 && cs.bevel <= 0.5)) {
    pushErr('LIB_SCHEMA', `${where}.bevel`, 'bevel must be a finite number in [0, 0.5]');
    ok = false;
  }
  if (cs.roughness != null && !(typeof cs.roughness === 'number' && Number.isFinite(cs.roughness) && cs.roughness >= 0 && cs.roughness <= 1)) {
    pushErr('LIB_SCHEMA', `${where}.roughness`, 'roughness must be a finite number in [0, 1]');
    ok = false;
  }
  if (cs.normalScale != null && !(typeof cs.normalScale === 'number' && Number.isFinite(cs.normalScale) && cs.normalScale >= 0 && cs.normalScale <= 4)) {
    pushErr('LIB_SCHEMA', `${where}.normalScale`, 'normalScale must be a finite number in [0, 4]');
    ok = false;
  }
  if (cs.translucency != null && !(typeof cs.translucency === 'number' && Number.isFinite(cs.translucency) && cs.translucency >= 0 && cs.translucency <= 1)) {
    pushErr('LIB_SCHEMA', `${where}.translucency`, 'translucency must be a finite number in [0, 1]');
    ok = false;
  }
  if (cs.edgeColor != null && !isSafeColor(String(cs.edgeColor))) {
    pushErr('LIB_SCHEMA', `${where}.edgeColor`, `invalid edgeColor "${cs.edgeColor}"`);
    ok = false;
  }
  return ok;
}

function loadAndVerifyEntryFile(absDir, relFile, expectedSha, where, pushErr) {
  if (!isConfinedSubpath(absDir, relFile)) {
    pushErr('LIB_UNSAFE_ASSET', where, `unsafe or escaping file path "${relFile}"`);
    return null;
  }
  const fullPath = resolve(absDir, relFile);
  if (!existsSync(fullPath)) {
    pushErr('LIB_FILE_MISSING', where, `referenced file "${relFile}" not found`);
    return null;
  }
  const rawBuf = readFileSync(fullPath);
  const actualSha = sha256Buf(rawBuf);
  if (expectedSha != null && actualSha !== expectedSha) {
    pushErr('LIB_SHA_MISMATCH', where, `SHA-256 mismatch for "${relFile}": expected ${expectedSha}, got ${actualSha}`);
    return null;
  }
  try {
    return { doc: JSON.parse(rawBuf.toString('utf8')), fullPath, sha256: actualSha };
  } catch (err) {
    pushErr('LIB_SCHEMA', where, `invalid JSON in "${relFile}": ${err.message}`);
    return null;
  }
}

function validateAndRegisterMaterial(doc, meta, map, where, pushErr) {
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !SAFE_ID_RE.test(doc.id)) {
    pushErr('LIB_SCHEMA', where, 'material preset missing valid id');
    return;
  }
  if (doc.kind !== 'pbr-paper') {
    pushErr('LIB_SCHEMA', `${where}.kind`, `expected kind "pbr-paper", got "${doc.kind}"`);
    return;
  }
  if (doc.gsm != null && !(typeof doc.gsm === 'number' && Number.isFinite(doc.gsm) && doc.gsm > 0)) {
    pushErr('LIB_SCHEMA', `${where}.gsm`, 'gsm must be a positive number');
    return;
  }
  if (!validateCardstockFields(doc.cardstock, `${where}.cardstock`, pushErr)) return;
  map.set(doc.id, { ...doc, _sourceFile: meta.fullPath, _sha256: meta.sha256 });
}

function validateAndRegisterRelief(doc, meta, map, where, pushErr) {
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !SAFE_ID_RE.test(doc.id)) {
    pushErr('LIB_SCHEMA', where, 'relief3d preset missing valid id');
    return;
  }
  if (doc.kind !== 'procedural-3d') {
    pushErr('LIB_SCHEMA', `${where}.kind`, `expected kind "procedural-3d", got "${doc.kind}"`);
    return;
  }
  if (!VALID_LAYER3D_KINDS.has(doc.layerKind)) {
    pushErr('LIB_SCHEMA', `${where}.layerKind`, `unknown layerKind "${doc.layerKind}"`);
    return;
  }
  if (!doc.defaults || typeof doc.defaults !== 'object' || Array.isArray(doc.defaults)) {
    pushErr('LIB_SCHEMA', `${where}.defaults`, 'defaults must be an object');
    return;
  }
  map.set(doc.id, { ...doc, _sourceFile: meta.fullPath, _sha256: meta.sha256 });
}

function validateAndRegisterCutout(absDir, doc, meta, idxEntry, map, where, pushErr) {
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !SAFE_ID_RE.test(doc.id)) {
    pushErr('LIB_SCHEMA', where, 'cutout preset missing valid id');
    return;
  }
  if (doc.kind !== 'cutout-raster') {
    pushErr('LIB_SCHEMA', `${where}.kind`, `expected kind "cutout-raster", got "${doc.kind}"`);
    return;
  }
  const imgRel = doc.imageFile;
  if (!isConfinedSubpath(absDir, imgRel)) {
    pushErr('LIB_UNSAFE_ASSET', `${where}.imageFile`, `unsafe or escaping imageFile "${imgRel}"`);
    return;
  }
  const ext = extname(imgRel).toLowerCase();
  const expectedMime = ALLOWED_CUTOUT_MIME.get(ext);
  if (!expectedMime) {
    pushErr('LIB_UNSAFE_ASSET', `${where}.imageFile`, `unsupported raster extension "${ext}" (allowed: .png, .webp)`);
    return;
  }
  if (doc.mimeType && doc.mimeType !== expectedMime) {
    pushErr('LIB_UNSAFE_ASSET', `${where}.mimeType`, `mimeType "${doc.mimeType}" does not match extension "${ext}"`);
    return;
  }
  const imgPath = resolve(absDir, imgRel);
  if (!existsSync(imgPath)) {
    pushErr('LIB_FILE_MISSING', `${where}.imageFile`, `referenced image "${imgRel}" not found`);
    return;
  }
  const maxBytes = typeof doc.maxBytes === 'number' && doc.maxBytes > 0 ? Math.min(doc.maxBytes, DEFAULT_MAX_CUTOUT_BYTES) : DEFAULT_MAX_CUTOUT_BYTES;
  const st = statSync(imgPath);
  if (st.size <= 0 || st.size > maxBytes) {
    pushErr('LIB_UNSAFE_ASSET', `${where}.imageFile`, `image size ${st.size} bytes outside (0, ${maxBytes}]`);
    return;
  }
  const imgBuf = readFileSync(imgPath);
  if (!hasValidMagicBytes(imgBuf, expectedMime)) {
    pushErr('LIB_UNSAFE_ASSET', `${where}.imageFile`, `file "${imgRel}" failed ${expectedMime} magic-byte verification`);
    return;
  }
  const actualImgSha = sha256Buf(imgBuf);
  const declaredImgSha = doc.imageSha256;
  if (typeof declaredImgSha !== 'string' || declaredImgSha.length !== 64) {
    pushErr('LIB_SCHEMA', `${where}.imageSha256`, 'cutout-raster requires 64-char hex imageSha256');
    return;
  }
  if (actualImgSha !== declaredImgSha) {
    pushErr('LIB_SHA_MISMATCH', `${where}.imageSha256`, `binary SHA-256 mismatch for "${imgRel}": expected ${declaredImgSha}, got ${actualImgSha}`);
    return;
  }
  if (idxEntry?.imageSha256 && idxEntry.imageSha256 !== actualImgSha) {
    pushErr('LIB_SHA_MISMATCH', `${where}.index.imageSha256`, `index imageSha256 mismatch for "${imgRel}"`);
    return;
  }
  map.set(doc.id, {
    ...doc,
    mimeType: expectedMime,
    _sourceFile: meta.fullPath,
    _sha256: meta.sha256,
    _imagePath: imgPath,
    _imageBuf: imgBuf,
  });
}

function validateAndRegisterArchetype(doc, meta, map, where, pushErr) {
  if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !SAFE_ID_RE.test(doc.id)) {
    pushErr('LIB_SCHEMA', where, 'archetype missing valid id');
    return;
  }
  if (doc.kind !== 'rig-archetype') {
    pushErr('LIB_SCHEMA', `${where}.kind`, `expected kind "rig-archetype", got "${doc.kind}"`);
    return;
  }
  if (!Array.isArray(doc.bones) || doc.bones.length === 0) {
    pushErr('LIB_SCHEMA', `${where}.bones`, 'archetype must define non-empty bones[]');
    return;
  }
  if (!doc.boneMapping || typeof doc.boneMapping !== 'object' || Array.isArray(doc.boneMapping) || Object.keys(doc.boneMapping).length === 0) {
    pushErr('LIB_SCHEMA', `${where}.boneMapping`, 'archetype must define non-empty canonical boneMapping');
    return;
  }
  const boneIds = new Set(doc.bones.map((b) => b?.id).filter(Boolean));
  for (const [role, bId] of Object.entries(doc.boneMapping)) {
    if (typeof bId !== 'string' || !boneIds.has(bId)) {
      pushErr('LIB_SCHEMA', `${where}.boneMapping.${role}`, `mapped bone "${bId}" does not exist in archetype bones[]`);
      return;
    }
  }
  map.set(doc.id, { ...doc, _sourceFile: meta.fullPath, _sha256: meta.sha256 });
}

function scanSubdirFallback(absDir, subName, kindHandler, map, pushErr) {
  const sub = join(absDir, subName);
  if (!existsSync(sub)) return;
  const files = readdirSync(sub, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const f of files) {
    const rel = `${subName}/${f.name}`;
    const loaded = loadAndVerifyEntryFile(absDir, rel, null, rel, pushErr);
    if (loaded) kindHandler(loaded.doc, loaded, null, map, rel, pushErr);
  }
}

/**
 * Loads PBR paper materials, procedural 3D relief presets, modular rig archetypes,
 * and optional verified raster cutouts from assets/library/ plus optional overrides.
 */
export function loadMaterialLibrary(extraDirs = [], pushErr = null) {
  const errFn = typeof pushErr === 'function' ? pushErr : () => {};
  const envDir = process.env.PAPER_STUDIO_LIBRARY_DIR ? [process.env.PAPER_STUDIO_LIBRARY_DIR] : [];
  const dirs = [
    { path: DEFAULT_LIBRARY_DIR, optional: true },
    ...envDir.map((p) => ({ path: p, optional: true })),
    ...(Array.isArray(extraDirs) ? extraDirs.filter(Boolean).map((p) => ({ path: p, optional: false })) : []),
  ];

  const materials = new Map();
  const reliefs3d = new Map();
  const cutouts = new Map();
  const archetypes = new Map();

  for (const entry of dirs) {
    const absDir = resolve(entry.path);
    if (!existsSync(absDir)) {
      if (!entry.optional) {
        errFn('LIB_FILE_MISSING', '--library-dir', `library directory not found: ${absDir}`);
      }
      continue;
    }

    const idxPath = join(absDir, 'index.json');
    if (existsSync(idxPath)) {
      let idx;
      try {
        idx = JSON.parse(readFileSync(idxPath, 'utf8'));
      } catch (err) {
        errFn('LIB_SCHEMA', idxPath, `invalid index.json: ${err.message}`);
        continue;
      }
      const seenInDir = new Set();
      const registerGroup = (list, groupName, handler) => {
        if (list == null) return;
        if (!Array.isArray(list)) {
          errFn('LIB_SCHEMA', `${idxPath}.${groupName}`, `${groupName} must be an array`);
          return;
        }
        for (const item of list) {
          const where = `${idxPath}.${groupName}[${item?.id ?? '?'}]`;
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.file !== 'string') {
            errFn('LIB_SCHEMA', where, 'index entry must specify string id and file');
            continue;
          }
          if (seenInDir.has(`${groupName}:${item.id}`)) {
            errFn('LIB_DUP_ID', where, `duplicate ${groupName} id "${item.id}" in index.json`);
            continue;
          }
          seenInDir.add(`${groupName}:${item.id}`);
          if (typeof item.sha256 !== 'string' || item.sha256.length !== 64) {
            errFn('LIB_SCHEMA', `${where}.sha256`, 'index entry requires 64-char hex sha256');
            continue;
          }
          const loaded = loadAndVerifyEntryFile(absDir, item.file, item.sha256, where, errFn);
          if (!loaded) continue;
          if (loaded.doc.id !== item.id) {
            errFn('LIB_SCHEMA', where, `index id "${item.id}" does not match file id "${loaded.doc.id}"`);
            continue;
          }
          handler(loaded.doc, loaded, item, where);
        }
      };

      registerGroup(idx.materials, 'materials', (doc, meta, _item, w) =>
        validateAndRegisterMaterial(doc, meta, materials, w, errFn));
      registerGroup(idx.reliefs3d, 'reliefs3d', (doc, meta, _item, w) =>
        validateAndRegisterRelief(doc, meta, reliefs3d, w, errFn));
      registerGroup(idx.cutouts, 'cutouts', (doc, meta, item, w) =>
        validateAndRegisterCutout(absDir, doc, meta, item, cutouts, w, errFn));
      registerGroup(idx.archetypes, 'archetypes', (doc, meta, _item, w) =>
        validateAndRegisterArchetype(doc, meta, archetypes, w, errFn));
    } else {
      scanSubdirFallback(absDir, 'materials', (doc, meta, _i, m, w, e) => validateAndRegisterMaterial(doc, meta, m, w, e), materials, errFn);
      scanSubdirFallback(absDir, 'reliefs3d', (doc, meta, _i, m, w, e) => validateAndRegisterRelief(doc, meta, m, w, e), reliefs3d, errFn);
      scanSubdirFallback(absDir, 'cutouts', (doc, meta, i, m, w, e) => validateAndRegisterCutout(absDir, doc, meta, i, m, w, e), cutouts, errFn);
      scanSubdirFallback(absDir, 'archetypes', (doc, meta, _i, m, w, e) => validateAndRegisterArchetype(doc, meta, m, w, e), archetypes, errFn);
    }
  }

  return { materials, reliefs3d, cutouts, archetypes };
}

/**
 * Resolves direct library ID references in a blueprint:
 *  - parts[].materialRef     -> merges PBR paper cardstock defaults
 *  - scene.layers3d[].reliefRef  -> expands procedural 3D relief preset
 *  - scene.layers3d[].cutoutRef  -> embeds verified local PNG/WebP into cutout_relief
 */
export function resolveBlueprintMaterials(bp, lib, pushErr) {
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) return bp;
  const errFn = typeof pushErr === 'function' ? pushErr : () => {};
  const cloned = structuredClone(bp);

  if (Array.isArray(cloned.parts)) {
    cloned.parts = cloned.parts.map((part, idx) => {
      if (!part || typeof part !== 'object' || part.materialRef == null) return part;
      const where = `parts[${idx}]${part.id ? ` (${part.id})` : ''}.materialRef`;
      const ref = typeof part.materialRef === 'string' ? { id: part.materialRef } : part.materialRef;
      if (!ref || typeof ref.id !== 'string' || !SAFE_ID_RE.test(ref.id)) {
        errFn('BP_MATERIAL_INVALID', where, 'materialRef must be a valid preset ID or { id, overrides? }');
        return part;
      }
      const preset = lib.materials.get(ref.id);
      if (!preset) {
        errFn(
          'BP_MATERIAL_NOT_FOUND',
          where,
          `material preset "${ref.id}" not found. Available: [${[...lib.materials.keys()].sort().join(', ')}]`,
        );
        return part;
      }
      const overrides = ref.overrides && typeof ref.overrides === 'object' && !Array.isArray(ref.overrides) ? ref.overrides : {};
      const explicit = part.cardstock && typeof part.cardstock === 'object' && !Array.isArray(part.cardstock) ? part.cardstock : {};
      const mergedCardstock = {
        ...preset.cardstock,
        ...overrides,
        ...explicit,
      };
      const out = { ...part, cardstock: mergedCardstock };
      delete out.materialRef;
      return out;
    });
  }

  if (cloned.scene && typeof cloned.scene === 'object' && Array.isArray(cloned.scene.layers3d)) {
    cloned.scene.layers3d = cloned.scene.layers3d.map((layer, idx) => {
      if (!layer || typeof layer !== 'object') return layer;
      const lWhere = `scene.layers3d[${idx}]${layer.id ? ` (${layer.id})` : ''}`;

      if (layer.reliefRef != null && layer.cutoutRef != null) {
        errFn('BP_RELIEF_INVALID', lWhere, 'layer3d cannot specify both reliefRef and cutoutRef');
        return layer;
      }

      if (layer.reliefRef != null) {
        const ref = typeof layer.reliefRef === 'string' ? { id: layer.reliefRef } : layer.reliefRef;
        if (!ref || typeof ref.id !== 'string' || !SAFE_ID_RE.test(ref.id)) {
          errFn('BP_RELIEF_INVALID', `${lWhere}.reliefRef`, 'reliefRef must be a valid preset ID or { id }');
          return layer;
        }
        const preset = lib.reliefs3d.get(ref.id);
        if (!preset) {
          errFn(
            'BP_RELIEF_NOT_FOUND',
            `${lWhere}.reliefRef`,
            `relief3d preset "${ref.id}" not found. Available: [${[...lib.reliefs3d.keys()].sort().join(', ')}]`,
          );
          return layer;
        }
        const merged = {
          ...structuredClone(preset.defaults),
          ...layer,
          kind: layer.kind ?? preset.layerKind,
        };
        delete merged.reliefRef;
        return merged;
      }

      if (layer.cutoutRef != null) {
        const ref = typeof layer.cutoutRef === 'string' ? { id: layer.cutoutRef } : layer.cutoutRef;
        if (!ref || typeof ref.id !== 'string' || !SAFE_ID_RE.test(ref.id)) {
          errFn('BP_CUTOUT_INVALID', `${lWhere}.cutoutRef`, 'cutoutRef must be a valid preset ID or { id }');
          return layer;
        }
        const preset = lib.cutouts.get(ref.id);
        if (!preset) {
          errFn(
            'BP_CUTOUT_NOT_FOUND',
            `${lWhere}.cutoutRef`,
            `cutout preset "${ref.id}" not found. Available: [${[...lib.cutouts.keys()].sort().join(', ')}]`,
          );
          return layer;
        }
        const dataUrl = `data:${preset.mimeType};base64,${preset._imageBuf.toString('base64')}`;
        const merged = {
          ...(preset.defaults ? structuredClone(preset.defaults) : {}),
          ...layer,
          kind: 'cutout_relief',
          imageDataUrl: dataUrl,
        };
        delete merged.cutoutRef;
        return merged;
      }

      return layer;
    });
  }

  const resolveRigArchetype = (rig, rWhere) => {
    if (!rig || typeof rig !== 'object' || rig.archetypeRef == null) return rig;
    const ref = typeof rig.archetypeRef === 'string' ? { id: rig.archetypeRef } : rig.archetypeRef;
    if (!ref || typeof ref.id !== 'string' || !SAFE_ID_RE.test(ref.id)) {
      errFn('BP_ARCHETYPE_INVALID', `${rWhere}.archetypeRef`, 'archetypeRef must be a valid archetype ID or { id }');
      return rig;
    }
    const preset = lib.archetypes?.get(ref.id);
    if (!preset) {
      errFn(
        'BP_ARCHETYPE_NOT_FOUND',
        `${rWhere}.archetypeRef`,
        `rig archetype "${ref.id}" not found. Available: [${[...(lib.archetypes?.keys() ?? [])].sort().join(', ')}]`,
      );
      return rig;
    }
    const merged = {
      ...(preset.sides ? { sides: structuredClone(preset.sides) } : {}),
      ...(preset.variants ? { variants: structuredClone(preset.variants) } : {}),
      ...(preset.boneMapping ? { boneMapping: structuredClone(preset.boneMapping) } : {}),
      bones: structuredClone(preset.bones),
      ...(preset.ik ? { ik: structuredClone(preset.ik) } : {}),
      ...(preset.contacts ? { contacts: structuredClone(preset.contacts) } : {}),
      ...(preset.ground ? { ground: structuredClone(preset.ground) } : {}),
      ...(preset.handTransition ? { handTransition: structuredClone(preset.handTransition) } : {}),
      ...(preset.followThrough ? { followThrough: structuredClone(preset.followThrough) } : {}),
      ...(preset.gait ? { gait: structuredClone(preset.gait) } : {}),
      ...rig,
      ...(preset.gait && rig.gait ? { gait: { ...structuredClone(preset.gait), ...rig.gait } } : {}),
      ...(preset.boneMapping && rig.boneMapping ? { boneMapping: { ...structuredClone(preset.boneMapping), ...rig.boneMapping } } : {}),
    };
    delete merged.archetypeRef;
    return merged;
  };

  if (Array.isArray(cloned.rigs)) {
    cloned.rigs = cloned.rigs.map((r, idx) => resolveRigArchetype(r, `rigs[${idx}]${r?.id ? ` (${r.id})` : ''}`));
  } else if (cloned.rig && typeof cloned.rig === 'object') {
    cloned.rig = resolveRigArchetype(cloned.rig, 'rig');
  }

  return cloned;
}

/**
 * Full fail-closed integrity verification across assets/library/, assets/kit/, styles/,
 * and any extra --library-dir / --kit-dir paths.
 */
export function verifyLibraryIntegrity(extraLibraryDirs = [], extraKitDirs = []) {
  const errors = [];
  const pushErr = (code, where, detail) => errors.push({ code, where, detail });

  // 1. Verify materials, reliefs3d, cutouts via loadMaterialLibrary
  const matLib = loadMaterialLibrary(extraLibraryDirs, pushErr);

  // 2. Verify 2D SVG components in index.json for every library directory
  const libDirs = [DEFAULT_LIBRARY_DIR, ...(extraLibraryDirs ?? []).filter(Boolean)].map((d) => resolve(d));
  let svgComponentCount = 0;
  const builtinDefs = getBuiltinViewerDefs({});

  for (const absDir of libDirs) {
    if (!existsSync(absDir)) continue;
    const idxPath = join(absDir, 'index.json');
    if (!existsSync(idxPath)) continue;
    let idx;
    try {
      idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    } catch {
      continue; // already reported by loadMaterialLibrary
    }
    const seen = new Set();
    for (const comp of (Array.isArray(idx.components) ? idx.components : [])) {
      const where = `${idxPath}.components[${comp?.id ?? '?'}]`;
      if (!comp || typeof comp.id !== 'string' || typeof comp.file !== 'string') {
        pushErr('LIB_SCHEMA', where, 'component entry missing id or file');
        continue;
      }
      if (seen.has(comp.id)) {
        pushErr('LIB_DUP_ID', where, `duplicate component id "${comp.id}"`);
        continue;
      }
      seen.add(comp.id);
      const loaded = loadAndVerifyEntryFile(absDir, comp.file, comp.sha256, where, pushErr);
      if (!loaded) continue;
      if (typeof loaded.doc.svg !== 'string' || !loaded.doc.svg.trim()) {
        pushErr('LIB_SCHEMA', where, `component "${comp.id}" missing svg string`);
        continue;
      }
      const normalized = loaded.doc.svg.replace(/\{\{[A-Z][A-Z0-9_]{0,31}\}\}/g, '#000000');
      scanSvgFragment(normalized, where, pushErr, {
        codeUnsafe: 'LIB_SVG_UNSAFE',
        codeMissingDef: 'LIB_MISSING_DEF',
        knownDefIds: builtinDefs,
        checkDefRefs: true,
      });
      svgComponentCount++;
    }
  }

  // 3. Verify kit components (assets/kit/ + extraKitDirs)
  const kitDirs = [DEFAULT_KIT_DIR, ...(extraKitDirs ?? []).filter(Boolean)].map((d) => resolve(d));
  let kitCount = 0;
  for (const kDir of kitDirs) {
    if (!existsSync(kDir)) continue;
    const files = readdirSync(kDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json') && d.name !== 'index.json')
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const f of files) {
      const full = join(kDir, f.name);
      try {
        const doc = JSON.parse(readFileSync(full, 'utf8'));
        if (!doc.id || typeof doc.svg !== 'string') {
          pushErr('LIB_SCHEMA', full, 'kit component missing id or svg');
          continue;
        }
        const normalized = doc.svg.replace(/\{\{[A-Z][A-Z0-9_]{0,31}\}\}/g, '#000000');
        scanSvgFragment(normalized, full, pushErr, {
          codeUnsafe: 'LIB_SVG_UNSAFE',
          codeMissingDef: 'LIB_MISSING_DEF',
          knownDefIds: builtinDefs,
          checkDefRefs: true,
        });
        kitCount++;
      } catch (err) {
        pushErr('LIB_SCHEMA', full, `invalid kit JSON: ${err.message}`);
      }
    }
  }

  // 4. Verify style packs
  const styles = listAvailableStyles();
  for (const slug of styles) {
    const styleDir = join(STYLES_DIR, slug);
    if (!existsSync(join(styleDir, 'STYLE.md'))) {
      pushErr('LIB_STYLE_INVALID', styleDir, `style "${slug}" missing STYLE.md`);
    }
    try {
      const preset = JSON.parse(readFileSync(join(styleDir, 'preset.json'), 'utf8'));
      if (preset.id !== slug) {
        pushErr('LIB_STYLE_INVALID', join(styleDir, 'preset.json'), `preset.id "${preset.id}" does not match folder "${slug}"`);
      }
    } catch (err) {
      pushErr('LIB_STYLE_INVALID', join(styleDir, 'preset.json'), `invalid preset.json: ${err.message}`);
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errorCount: errors.length,
    errors,
    counts: {
      svg2dLibrary: svgComponentCount,
      svg2dKit: kitCount,
      pbrMaterials: matLib.materials.size,
      reliefs3d: matLib.reliefs3d.size,
      archetypes: matLib.archetypes.size,
      cutouts: matLib.cutouts.size,
      styles: styles.length,
    },
  };
}
