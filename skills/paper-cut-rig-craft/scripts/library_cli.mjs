#!/usr/bin/env node
/**
 * Private Craft Library CLI for paper-cut-rig-craft (v4.0).
 * Supports browsing built-in & custom private craft libraries, rendering visual
 * contact sheets via headless Chrome, and fail-closed importing of hand-drawn SVGs
 * (e.g. from Illustrator / Figma / Inkscape) into tokenized JSON library components.
 * Zero external npm dependencies.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildBacklitPulpFilter,
  buildBuiltinMaterialPatterns,
  buildCutoutBorderFilter,
  buildGouacheGrainFilter,
  buildPaperBevelFilter,
  buildPaperTexFilter,
  getBuiltinViewerDefs,
  scanSvgFragment,
} from './lib/svg-guard.mjs';
import { expandKitMacrosInString, loadKitCatalog } from './lib/kit-resolver.mjs';
import { loadMaterialLibrary, verifyLibraryIntegrity } from './lib/material-library.mjs';
import { analyzeSvgCraft } from './lib/craft-audit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function printHelp() {
  console.log(`Usage: node scripts/library_cli.mjs <command> [OPTIONS]

Commands:
  list [--kind <svg-2d|pbr-paper|procedural-3d|cutout-raster|all>] [--family <fam>] [--category <cat>] [--library-dir <DIR>] [--json]
      List available components and material/3D relief presets across assets/kit/, assets/library/, and custom libraries.

  verify [--library-dir <DIR>] [--kit-dir <DIR>] [--json]
      Verify SHA-256 integrity, schema, SVG allowlist, raster magic bytes, and style packs fail-closed.

  contact-sheet --out <DIR> [--family <fam>] [--library-dir <DIR>] [--no-chrome]
      Render a visual contact sheet (library_contact_sheet.html + .png) for visual QA.

  import --svg <FILE> --id <ID> --family <FAM> --out-dir <DIR> [--category <CAT>]
      Validate (fail-closed) and import a hand-drawn SVG into a reusable library JSON component.

Exit codes:
  0  PASS
  1  FAIL (validation or security error; no unsafe files written)
  2  USAGE_ERROR`);
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

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const bin of candidates) {
    const res = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (res.status === 0) return bin;
  }
  return null;
}

function inferFamily(entry) {
  if (typeof entry.family === 'string' && entry.family.trim()) return entry.family.trim();
  const cat = entry.category ?? 'prop';
  if (['head', 'face', 'limb', 'body', 'hand', 'foot'].includes(cat)) return 'anatomy';
  if (['organic', 'botanical'].includes(cat)) return 'botanicals';
  if (['frame', 'ornament'].includes(cat)) return 'frames';
  if (cat === 'garment') return 'garments';
  return 'props';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function cmdList(args) {
  const extraLibDirs = argVals(args, '--library-dir');
  const extraDirs = [...extraLibDirs, ...argVals(args, '--kit-dir')];
  const kindFilter = argVal(args, '--kind') ?? 'svg-2d';
  const famFilter = argVal(args, '--family');
  const catFilter = argVal(args, '--category');
  const asJson = args.includes('--json');

  const errs = [];
  const pushErr = (c, w, d) => errs.push({ code: c, where: w, detail: d });
  const items = [];

  if (kindFilter === 'svg-2d' || kindFilter === 'all') {
    const cat = loadKitCatalog(extraDirs, pushErr);
    for (const e of cat.values()) {
      items.push({
        id: e.id,
        kind: 'svg-2d',
        family: inferFamily(e),
        category: e.category ?? 'prop',
        size: e.size,
        pivot: e.pivot,
        tokens: Object.keys(e.tokens ?? {}),
        styles: Array.isArray(e.styles) ? e.styles : [],
        description: e.description ?? '',
      });
    }
  }

  if (kindFilter !== 'svg-2d') {
    const matLib = loadMaterialLibrary(extraLibDirs, pushErr);
    if (kindFilter === 'pbr-paper' || kindFilter === 'all') {
      for (const m of matLib.materials.values()) {
        items.push({
          id: m.id,
          kind: 'pbr-paper',
          family: m.family ?? 'materials',
          category: 'material',
          gsm: m.gsm ?? null,
          cardstock: m.cardstock,
          styles: Array.isArray(m.styles) ? m.styles : [],
          description: m.description ?? '',
        });
      }
    }
    if (kindFilter === 'procedural-3d' || kindFilter === 'all') {
      for (const r of matLib.reliefs3d.values()) {
        items.push({
          id: r.id,
          kind: 'procedural-3d',
          family: r.family ?? 'reliefs3d',
          category: r.layerKind,
          layerKind: r.layerKind,
          styles: Array.isArray(r.styles) ? r.styles : [],
          description: r.description ?? '',
        });
      }
    }
    if (kindFilter === 'rig-archetype' || kindFilter === 'all') {
      for (const a of matLib.archetypes.values()) {
        items.push({
          id: a.id,
          kind: 'rig-archetype',
          family: a.family ?? 'archetypes',
          category: 'rig-archetype',
          boneCount: a.bones?.length ?? 0,
          boneMapping: Object.keys(a.boneMapping ?? {}),
          description: a.description ?? '',
        });
      }
    }
    if (kindFilter === 'cutout-raster' || kindFilter === 'all') {
      for (const c of matLib.cutouts.values()) {
        items.push({
          id: c.id,
          kind: 'cutout-raster',
          family: c.family ?? 'cutouts',
          category: 'cutout_relief',
          mimeType: c.mimeType,
          imageFile: c.imageFile,
          description: c.description ?? '',
        });
      }
    }
  }

  if (errs.length > 0) {
    console.log(JSON.stringify({ status: 'FAIL', errors: errs }, null, 2));
    process.exit(1);
  }

  let filtered = items;
  if (famFilter) filtered = filtered.filter((i) => i.family === famFilter);
  if (catFilter) filtered = filtered.filter((i) => i.category === catFilter);
  filtered.sort((a, b) => a.kind.localeCompare(b.kind) || a.family.localeCompare(b.family) || a.id.localeCompare(b.id));

  if (asJson) {
    console.log(JSON.stringify({ status: 'PASS', kind: kindFilter, count: filtered.length, components: filtered }, null, 2));
    return;
  }
  console.log(`Paper Studio Craft Library (${kindFilter}) — ${filtered.length} item(s)\n`);
  let curFam = '';
  for (const it of filtered) {
    if (it.family !== curFam) {
      curFam = it.family;
      console.log(`[${curFam}]`);
    }
    const extra = it.tokens
      ? `tokens=[${it.tokens.join(', ')}]`
      : (it.layerKind ? `layerKind=${it.layerKind}` : (it.gsm ? `${it.gsm}gsm` : (it.boneCount ? `${it.boneCount} bones` : it.kind)));
    console.log(`  - ${it.id.padEnd(26)} (${it.category}) ${extra}`);
  }
}

function cmdVerify(args) {
  const extraLibDirs = argVals(args, '--library-dir');
  const extraKitDirs = argVals(args, '--kit-dir');
  const asJson = args.includes('--json');
  const report = verifyLibraryIntegrity(extraLibDirs, extraKitDirs);
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.status === 'PASS') {
    const c = report.counts;
    console.log(
      `PASS: verified ${c.svg2dLibrary} library SVGs, ${c.svg2dKit} kit SVGs, ${c.pbrMaterials} PBR materials, ${c.reliefs3d} 3D reliefs, ${c.archetypes} archetypes, ${c.cutouts} cutouts, ${c.styles} styles`,
    );
  } else {
    console.error(`FAIL: ${report.errorCount} library integrity error(s):`);
    for (const e of report.errors) console.error(`  [${e.code}] ${e.where}: ${e.detail}`);
  }
  process.exit(report.status === 'PASS' ? 0 : 1);
}

function cmdContactSheet(args) {
  const outArg = argVal(args, '--out');
  if (!outArg) {
    console.error('Error: --out <DIR> is required for contact-sheet.');
    process.exit(2);
  }
  const extraDirs = [...argVals(args, '--library-dir'), ...argVals(args, '--kit-dir')];
  const famFilter = argVal(args, '--family');
  const noChrome = args.includes('--no-chrome');

  const errs = [];
  const cat = loadKitCatalog(extraDirs, (c, w, d) => errs.push({ code: c, where: w, detail: d }));
  if (errs.length > 0) {
    console.log(JSON.stringify({ status: 'FAIL', errors: errs }, null, 2));
    process.exit(1);
  }

  let entries = [...cat.values()];
  if (famFilter) entries = entries.filter((e) => inferFamily(e) === famFilter);
  entries.sort((a, b) => inferFamily(a).localeCompare(inferFamily(b)) || a.id.localeCompare(b.id));

  const sharedDefs = [
    buildPaperTexFilter(13),
    buildPaperBevelFilter({}, 'paperBevel', 1),
    buildPaperBevelFilter({}, 'paperBevelSoft', 0.65),
    buildGouacheGrainFilter(18),
    buildCutoutBorderFilter({}),
    buildBacklitPulpFilter({}, 24),
    '<filter id="shadowInner" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="1.4" stdDeviation="1.6" flood-color="#1e1510" flood-opacity="0.22"/></filter>',
    buildBuiltinMaterialPatterns(),
  ].join('\n');

  const cards = entries.map((e) => {
    const rendered = expandKitMacrosInString(`{{KIT:${e.id}}}`, cat, e.id, () => {});
    const craft = analyzeSvgCraft(rendered, e.id);
    const w = Array.isArray(e.size) ? e.size[0] : 80;
    const h = Array.isArray(e.size) ? e.size[1] : 80;
    const px = Array.isArray(e.pivot) ? e.pivot[0] : w * 0.5;
    const py = Array.isArray(e.pivot) ? e.pivot[1] : h * 0.5;
    const pad = Math.max(w, h) * 0.16;
    const vb = `${(-pad).toFixed(1)} ${(-pad).toFixed(1)} ${(w + pad * 2).toFixed(1)} ${(h + pad * 2).toFixed(1)}`;
    const fam = inferFamily(e);
    const swatches = Object.entries(e.tokens ?? {})
      .slice(0, 5)
      .map(([k, v]) => `<span class="sw" title="${escapeHtml(k)}: ${escapeHtml(v)}" style="background:${escapeHtml(v)}"></span>`)
      .join('');
    return `
      <div class="card">
        <div class="thumb">
          <svg viewBox="${vb}" width="100%" height="100%">
            <g transform="translate(${px},${py})" filter="url(#paperTex)">${rendered}</g>
          </svg>
        </div>
        <div class="meta">
          <div class="row"><span class="cid">${escapeHtml(e.id)}</span><span class="fam">${escapeHtml(fam)}</span></div>
          <div class="sub">${craft.totalPrimitives} prims · score ${craft.craftScore} <span class="swatches">${swatches}</span></div>
        </div>
      </div>`;
  }).join('\n');

  const outDir = resolve(outArg);
  mkdirSync(outDir, { recursive: true });
  const htmlPath = join(outDir, 'library_contact_sheet.html');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Paper Studio v2 — Private Craft Library Contact Sheet (${entries.length} components)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1c1917; color: #f5efe6; font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; border-bottom: 1px solid #3c342e; padding-bottom: 10px; }
  header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  header span { font-size: 13px; color: #c7baa9; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
  .card { background: #292421; border: 1px solid #443b35; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .thumb { background: radial-gradient(circle at 50% 42%, #faf4e8 0%, #e7dcc9 100%); height: 146px; padding: 8px; display: flex; align-items: center; justify-content: center; }
  .meta { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .cid { font-size: 12px; font-weight: 700; color: #fff8ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fam { font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; background: #3f352f; color: #f3c677; flex-shrink: 0; }
  .sub { font-size: 10.5px; color: #b8aa99; display: flex; align-items: center; justify-content: space-between; }
  .swatches { display: inline-flex; gap: 3px; }
  .sw { width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); display: inline-block; }
</style>
</head>
<body>
  <svg width="0" height="0" style="position:absolute"><defs>${sharedDefs}</defs></svg>
  <header>
    <h1>Paper Studio v2 — Curated Craft Library Contact Sheet</h1>
    <span>${entries.length} validated tokenized components · sRGB tactile filters</span>
  </header>
  <div class="grid">${cards}</div>
</body>
</html>\n`;
  writeFileSync(htmlPath, html, 'utf8');

  let pngPath = null;
  let captured = false;
  if (!noChrome) {
    const chromeBin = findChromeBinary();
    if (chromeBin) {
      pngPath = join(outDir, 'library_contact_sheet.png');
      const rows = Math.max(1, Math.ceil(entries.length / 6));
      const height = Math.min(3600, Math.max(840, 110 + rows * 212));
      const res = spawnSync(
        chromeBin,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--hide-scrollbars',
          `--window-size=1600,${height}`,
          '--virtual-time-budget=1200',
          `--screenshot=${pngPath}`,
          pathToFileURL(htmlPath).href,
        ],
        { encoding: 'utf8', timeout: 30000 },
      );
      captured = res.status === 0 && existsSync(pngPath);
    }
  }

  console.log(JSON.stringify({ status: 'PASS', count: entries.length, htmlPath, pngPath: captured ? pngPath : null }, null, 2));
}

function cmdImport(args) {
  const svgArg = argVal(args, '--svg');
  const idArg = argVal(args, '--id');
  const famArg = argVal(args, '--family');
  const catArg = argVal(args, '--category') ?? 'prop';
  const outDirArg = argVal(args, '--out-dir');

  if (!svgArg || !idArg || !famArg || !outDirArg) {
    console.error('Error: import requires --svg, --id, --family, and --out-dir.');
    process.exit(2);
  }
  if (!SAFE_SLUG_RE.test(idArg) || !SAFE_SLUG_RE.test(famArg) || !SAFE_SLUG_RE.test(catArg)) {
    console.log(JSON.stringify({
      status: 'FAIL',
      errors: [{ code: 'LIB_IMPORT_INVALID', where: 'args', detail: 'id, family, and category must match /^[a-z0-9][a-z0-9_-]{0,63}$/' }],
    }, null, 2));
    process.exit(1);
  }

  const svgPath = resolve(svgArg);
  if (!existsSync(svgPath)) {
    console.log(JSON.stringify({
      status: 'FAIL',
      errors: [{ code: 'LIB_IMPORT_MISSING', where: svgPath, detail: 'SVG file not found' }],
    }, null, 2));
    process.exit(1);
  }

  const rawSvg = readFileSync(svgPath, 'utf8');
  const svgMatch = rawSvg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) {
    console.log(JSON.stringify({
      status: 'FAIL',
      errors: [{ code: 'LIB_IMPORT_INVALID', where: svgPath, detail: 'input file must contain a valid <svg>...</svg> element' }],
    }, null, 2));
    process.exit(1);
  }

  const openAttrs = svgMatch[1];
  const innerRaw = svgMatch[2].trim();
  const errs = [];
  const pushErr = (code, where, detail) => errs.push({ code, where, detail });
  scanSvgFragment(innerRaw, svgPath, pushErr, {
    codeUnsafe: 'LIB_SVG_UNSAFE',
    codeMissingDef: 'LIB_MISSING_DEF',
    knownDefIds: getBuiltinViewerDefs({}),
    checkDefRefs: true,
  });

  if (errs.length > 0) {
    console.log(JSON.stringify({ status: 'FAIL', svg: svgPath, errorCount: errs.length, errors: errs }, null, 2));
    process.exit(1);
  }

  // Parse viewBox or width/height
  let minX = 0;
  let minY = 0;
  let width = 80;
  let height = 80;
  const vbM = openAttrs.match(/\bviewBox\s*=\s*["']\s*([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)[,\s]+([+-]?[\d.]+)\s*["']/i);
  if (vbM) {
    minX = Number(vbM[1]);
    minY = Number(vbM[2]);
    width = Number(vbM[3]);
    height = Number(vbM[4]);
  } else {
    const wM = openAttrs.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
    const hM = openAttrs.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
    if (wM) width = Number(wM[1]);
    if (hM) height = Number(hM[1]);
  }
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    console.log(JSON.stringify({
      status: 'FAIL',
      errors: [{ code: 'LIB_IMPORT_INVALID', where: svgPath, detail: 'SVG viewBox/dimensions must be positive finite numbers' }],
    }, null, 2));
    process.exit(1);
  }

  const pivotX = Number((width * 0.5).toFixed(2));
  const pivotY = Number((height * 0.5).toFixed(2));
  const tx = Number((-(minX + pivotX)).toFixed(2));
  const ty = Number((-(minY + pivotY)).toFixed(2));
  const wrappedSvg = `<g transform="translate(${tx},${ty})" filter="url(#paperBevelSoft)">${innerRaw}</g>`;

  const comp = {
    id: idArg,
    family: famArg,
    category: catArg,
    description: `Imported SVG craft component (${idArg})`,
    size: [Number(width.toFixed(2)), Number(height.toFixed(2))],
    pivot: [pivotX, pivotY],
    anchors: {},
    tokens: {},
    svg: wrappedSvg,
  };

  const outDir = resolve(outDirArg);
  const famDir = join(outDir, famArg);
  mkdirSync(famDir, { recursive: true });
  const outFile = join(famDir, `${idArg}.json`);
  const payload = JSON.stringify(comp, null, 2) + '\n';
  writeFileSync(outFile, payload, 'utf8');

  // Maintain index.json in outDir
  const idxPath = join(outDir, 'index.json');
  let idxDoc = { schemaVersion: 1, version: '4.0.0', count: 0, families: [], components: [] };
  if (existsSync(idxPath)) {
    try {
      const parsed = JSON.parse(readFileSync(idxPath, 'utf8'));
      if (parsed && Array.isArray(parsed.components)) idxDoc = parsed;
    } catch {
      // recreate clean index
    }
  }
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const craft = analyzeSvgCraft(wrappedSvg, idArg);
  const entry = {
    id: idArg,
    family: famArg,
    category: catArg,
    file: `${famArg}/${idArg}.json`,
    tokens: [],
    primitives: craft.totalPrimitives,
    craftScore: craft.craftScore,
    sha256,
    description: comp.description,
  };
  idxDoc.components = [...idxDoc.components.filter((c) => c.id !== idArg), entry].sort((a, b) => a.id.localeCompare(b.id));
  idxDoc.count = idxDoc.components.length;
  idxDoc.families = [...new Set(idxDoc.components.map((c) => c.family))].sort();
  writeFileSync(idxPath, JSON.stringify(idxDoc, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ status: 'PASS', id: idArg, family: famArg, outFile, sha256, primitives: craft.totalPrimitives }, null, 2));
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printHelp();
  process.exit(args.length === 0 ? 2 : 0);
}

const sub = args[0];
const rest = args.slice(1);
if (sub === 'list') cmdList(rest);
else if (sub === 'verify') cmdVerify(rest);
else if (sub === 'contact-sheet') cmdContactSheet(rest);
else if (sub === 'import') cmdImport(rest);
else {
  console.error(`Unknown command: ${sub}`);
  printHelp();
  process.exit(2);
}
