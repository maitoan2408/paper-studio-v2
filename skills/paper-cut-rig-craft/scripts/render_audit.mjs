#!/usr/bin/env node
/**
 * Closed-Loop Visual Self-Critique, Multi-Angle 3D & Bit-Exact Determinism Auditor
 * for paper-cut-rig-craft (v5.0 — supports both sculpted3d WebGL2 and svg2d studios).
 * Zero external npm dependencies, 100% theme-agnostic.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPartsCraft } from './lib/craft-audit.mjs';
import { loadKitCatalog, resolveBlueprintKits } from './lib/kit-resolver.mjs';
import { applyStylePreset } from './lib/style-loader.mjs';

function printHelp() {
  console.log(`Usage: node scripts/render_audit.mjs --html <viewer.html> --out <audit_dir> [OPTIONS]

Run a closed-loop visual, craft & determinism audit on a compiled paper-cut rig studio HTML
(auto-detects WebGL2 sculpted3d vs classic svg2d).

Options:
  --html <FILE>        Compiled standalone viewer HTML file (required)
  --spec <FILE>        Optional source blueprint JSON (otherwise extracted from HTML)
  --kit-dir <DIR>      Optional extra modular kit directory if --spec uses custom kits
  --library-dir <DIR>  Optional private craft library directory
  --out <DIR>          Output directory for audit_report.json and PNG captures (required)
  --times <CSV>        Comma-separated timestamps in seconds (default: auto 0, 42%, 72% of period)
  --no-chrome          Skip headless browser screenshots (run static craft audit only)
  --strict-craft       Exit with code 1 if any hero part triggers CRAFT_TOO_SIMPLE
  --help, -h           Show this help message

Exit codes:
  0  PASS (audit + determinism check completed cleanly)
  1  FAIL (invalid input, --strict-craft violation, or AUDIT_NONDETERMINISTIC)
  2  USAGE_ERROR (missing required flags)`);
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

function extractBlueprintFromHtml(htmlText) {
  const m = htmlText.match(/const\s+BLUEPRINT\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+RIGS/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/<\\\/script/gi, '</script'));
  } catch {
    return null;
  }
}

function captureChrome(chromeBin, fileUrl, outPng, width = 1280, height = 720, is3d = false, budget = 900, userDataDir = null) {
  const gpuFlags = is3d
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    : ['--disable-gpu'];
  const profileFlags = userDataDir ? [`--user-data-dir=${userDataDir}`] : [];
  const res = spawnSync(
    chromeBin,
    [
      '--headless=new',
      ...gpuFlags,
      ...profileFlags,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--virtual-time-budget=${budget}`,
      `--screenshot=${outPng}`,
      fileUrl,
    ],
    { encoding: 'utf8', timeout: 120000 },
  );
  return {
    ok: res.status === 0 && existsSync(outPng),
    status: res.status,
    stderr: (res.stderr ?? '').trim().slice(0, 300),
  };
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  printHelp();
  process.exit(args.length === 0 ? 2 : 0);
}

const htmlArg = argVal(args, '--html');
const specArg = argVal(args, '--spec');
const extraKitDirs = [...argVals(args, '--kit-dir'), ...argVals(args, '--library-dir')];
const outArg = argVal(args, '--out');
const timesArg = argVal(args, '--times');
const noChrome = args.includes('--no-chrome');
const strictCraft = args.includes('--strict-craft');

if (!htmlArg || !outArg) {
  console.error('Error: --html and --out are required.');
  process.exit(2);
}

const htmlPath = resolve(htmlArg);
if (!existsSync(htmlPath)) {
  console.error(`Error: HTML file not found: ${htmlPath}`);
  process.exit(1);
}
const htmlText = readFileSync(htmlPath, 'utf8');
const htmlIs3d = htmlText.includes('data-render-mode="sculpted3d"');

let bp = null;
if (specArg) {
  const specPath = resolve(specArg);
  if (!existsSync(specPath)) {
    console.error(`Error: spec file not found: ${specPath}`);
    process.exit(1);
  }
  try {
    const raw = applyStylePreset(JSON.parse(readFileSync(specPath, 'utf8')), () => {});
    const catalog = loadKitCatalog(extraKitDirs);
    bp = resolveBlueprintKits(raw, catalog, () => {});
  } catch (err) {
    console.error(`Error: failed to parse spec JSON: ${err.message}`);
    process.exit(1);
  }
} else {
  bp = extractBlueprintFromHtml(htmlText);
}

if (!bp || !Array.isArray(bp.parts)) {
  console.error('Error: could not extract valid blueprint parts from --spec or --html.');
  process.exit(1);
}

const renderMode = htmlIs3d || bp.scene?.renderMode === 'sculpted3d' ? 'sculpted3d' : 'svg2d';
const is3d = renderMode === 'sculpted3d';

const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });

const rigs = Array.isArray(bp.rigs) && bp.rigs.length > 0 ? bp.rigs : (bp.rig ? [bp.rig] : []);
const heroPartIds = new Set();
for (const r of rigs) {
  for (const b of r.bones ?? []) {
    if (b.part) heroPartIds.add(b.part);
    for (const vId of Object.values(b.variants ?? {})) heroPartIds.add(vId);
  }
}

const craftAudit = auditPartsCraft(
  bp.parts.map((p) => ({ id: p.id, svg: p.svg ?? '' })),
  heroPartIds,
);

const period = bp.motions?.[0]?.period ?? 10;
let times = [0, Number((period * 0.42).toFixed(2)), Number((period * 0.72).toFixed(2))];
if (timesArg) {
  const parsed = timesArg.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  if (parsed.length > 0) times = parsed;
}
const midTime = times[Math.floor(times.length / 2)] ?? 0;
const baseUrl = pathToFileURL(htmlPath).href;
const sheetFracs = [0, 0.17, 0.34, 0.51, 0.68, 0.84];
const sheetTimes = sheetFracs.map((f) => Number((period * f).toFixed(2)));
const safeTitle = String(bp.meta?.title ?? 'Motion Sheet').replace(/[&<>"]/g, '');

// For classic svg2d, emit iframe-based motion_sheet.html & modelsheet_<rigId>.html;
// for sculpted3d, use single-context ?sheet=motion6 & ?sheet=modelsheet&rig=<id> directly!
let sheetHtmlPath = null;
const modelSheetEntries = [];

if (!is3d) {
  sheetHtmlPath = join(outDir, 'motion_sheet.html');
  const sheetCells = sheetTimes
    .map(
      (tv, idx) => `
    <div class="cell">
      <iframe src="${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(tv)}" loading="eager"></iframe>
      <div class="tag">#${idx + 1} &middot; t=${tv}s (${Math.round(sheetFracs[idx] * 100)}%)</div>
    </div>`,
    )
    .join('\n');
  writeFileSync(
    sheetHtmlPath,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${safeTitle} — 6-Phase Motion Sheet</title><style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;background:#090d16;color:#e2e8f0;font-family:system-ui,sans-serif;overflow:hidden}.grid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:8px;padding:8px;width:100vw;height:100vh}.cell{position:relative;background:#0f172a;border:1px solid #1e293b;border-radius:8px;overflow:hidden}iframe{width:100%;height:100%;border:0;pointer-events:none;display:block}.tag{position:absolute;left:8px;bottom:8px;background:rgba(9,13,22,0.84);border:1px solid rgba(148,163,184,0.3);color:#f8fafc;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px}</style></head><body><div class="grid">${sheetCells}</div></body></html>\n`,
    'utf8',
  );

  for (const r of rigs) {
    const rLabel = String(r.label ?? r.id).replace(/[&<>"]/g, '');
    const encRig = encodeURIComponent(r.id);
    const msHtmlPath = join(outDir, `modelsheet_${r.id}.html`);
    const views = [
      { label: `1. Rest Pose · ${rLabel}`, src: `${baseUrl}?stageOnly=1&pause=1&rest=1&cropRig=${encRig}&cropPad=110` },
      { label: `2. Active Pose (t=${midTime}s) · ${rLabel}`, src: `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&cropRig=${encRig}&cropPad=110` },
      { label: `3. Skeleton & Anchors · ${(r.bones ?? []).length} bones`, src: `${baseUrl}?stageOnly=1&pause=1&rest=1&showBones=1&showAnchors=1&cropRig=${encRig}&cropPad=110` },
      { label: `4. Monochrome Silhouette · Readability Check`, src: `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&silhouette=1&cropRig=${encRig}&cropPad=110` },
    ];
    const msCells = views.map((v) => `<div class="cell"><iframe src="${v.src}" loading="eager"></iframe><div class="tag">${v.label}</div></div>`).join('\n');
    writeFileSync(
      msHtmlPath,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${safeTitle} — Model Sheet (${rLabel})</title><style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;background:#090d16;color:#e2e8f0;font-family:system-ui,sans-serif;overflow:hidden}.grid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:8px;padding:8px;width:100vw;height:100vh}.cell{position:relative;background:#0f172a;border:1px solid #1e293b;border-radius:8px;overflow:hidden}iframe{width:100%;height:100%;border:0;pointer-events:none;display:block}.tag{position:absolute;left:10px;bottom:10px;background:rgba(9,13,22,0.86);border:1px solid rgba(148,163,184,0.35);color:#f8fafc;font-size:13px;font-weight:600;padding:4px 10px;border-radius:6px}</style></head><body><div class="grid">${msCells}</div></body></html>\n`,
      'utf8',
    );
    modelSheetEntries.push({ rigId: r.id, htmlPath: msHtmlPath, url: pathToFileURL(msHtmlPath).href, path: null, ok: false });
  }
} else {
  for (const r of rigs) {
    modelSheetEntries.push({
      rigId: r.id,
      url: `${baseUrl}?sheet=modelsheet&rig=${encodeURIComponent(r.id)}`,
      path: null,
      ok: false,
    });
  }
}

const captures = {
  mode: noChrome ? 'SKIPPED_NO_CHROME_FLAG' : 'PENDING',
  chromeBinary: null,
  motionSheetHtml: sheetHtmlPath,
  motionSheet: null,
  modelSheets: modelSheetEntries,
  frames: [],
  oblique3d: null,
  explodedZ: null,
  silhouette: null,
  closeups: [],
};

let determinismCheck = { status: noChrome ? 'SKIPPED' : 'NOT_RUN' };
let determinismFailed = false;

if (!noChrome) {
  const chromeBin = findChromeBinary();
  if (!chromeBin) {
    captures.mode = 'SKIPPED_NO_CHROME_BINARY';
    determinismCheck = { status: 'SKIPPED_NO_CHROME_BINARY' };
  } else {
    captures.mode = 'CAPTURED';
    captures.chromeBinary = chromeBin;
    const gpuCacheDir = is3d ? join(outDir, `_chrome_shader_cache_${process.pid}`) : null;
    if (gpuCacheDir) mkdirSync(gpuCacheDir, { recursive: true });

    try {
      const msPngPath = join(outDir, 'motion_sheet.png');
      const msUrl = is3d ? `${baseUrl}?sheet=motion6` : pathToFileURL(sheetHtmlPath).href;
      const msRes = captureChrome(chromeBin, msUrl, msPngPath, is3d ? 1920 : 1600, is3d ? 1080 : 900, is3d, is3d ? 1100 : 1200, gpuCacheDir);
      captures.motionSheet = { times: sheetTimes, path: msPngPath, ok: msRes.ok, ...(msRes.ok ? {} : { error: msRes.stderr }) };

      for (const msEntry of captures.modelSheets) {
        const pngPath = join(outDir, `modelsheet_${msEntry.rigId}.png`);
        const res = captureChrome(chromeBin, msEntry.url, pngPath, 1600, 900, is3d, is3d ? 1000 : 1200, gpuCacheDir);
        msEntry.path = pngPath;
        msEntry.ok = res.ok;
        if (!res.ok) msEntry.error = res.stderr;
      }

      for (let i = 0; i < times.length; i++) {
        const tVal = times[i];
        const pngPath = join(outDir, `frame_${i}_t${String(tVal).replace('.', 'p')}.png`);
        const url = `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(tVal)}`;
        const res = captureChrome(chromeBin, url, pngPath, 1280, 720, is3d, is3d ? 900 : 1200, gpuCacheDir);
        captures.frames.push({ t: tVal, path: pngPath, ok: res.ok, ...(res.ok ? {} : { error: res.stderr }) });
      }

      if (is3d) {
        const obPath = join(outDir, 'frame_oblique_3d.png');
        const obRes = captureChrome(chromeBin, `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&tiltX=18&tiltY=6`, obPath, 1280, 720, true, 900, gpuCacheDir);
        captures.oblique3d = { t: midTime, tilt: [18, 6], path: obPath, ok: obRes.ok, ...(obRes.ok ? {} : { error: obRes.stderr }) };

        const exPath = join(outDir, 'frame_exploded_z.png');
        const exRes = captureChrome(chromeBin, `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&tiltX=24&tiltY=8&explode=0.72`, exPath, 1280, 720, true, 900, gpuCacheDir);
        captures.explodedZ = { t: midTime, explode: 0.72, path: exPath, ok: exRes.ok, ...(exRes.ok ? {} : { error: exRes.stderr }) };

        // Bit-Exact Determinism Gate: direct(midTime) vs seek(seekFrom -> midTime)
        const seekOrigin = Number((period * 0.88).toFixed(2));
        const detDirect = join(outDir, '_det_direct.png');
        const detSeek = join(outDir, '_det_seek.png');
        const rDir = captureChrome(chromeBin, `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}`, detDirect, 960, 540, true, 900, gpuCacheDir);
        const rSeek = captureChrome(chromeBin, `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&seekFrom=${encodeURIComponent(seekOrigin)}`, detSeek, 960, 540, true, 900, gpuCacheDir);
        if (rDir.ok && rSeek.ok) {
          const h1 = createHash('sha256').update(readFileSync(detDirect)).digest('hex');
          const h2 = createHash('sha256').update(readFileSync(detSeek)).digest('hex');
          rmSync(detDirect, { force: true });
          rmSync(detSeek, { force: true });
          if (h1 === h2) {
            determinismCheck = { status: 'PASS', t: midTime, seekFrom: seekOrigin, sha256: h1 };
          } else {
            determinismCheck = { code: 'AUDIT_NONDETERMINISTIC', status: 'FAIL', t: midTime, seekFrom: seekOrigin, directSha256: h1, seekSha256: h2 };
            determinismFailed = true;
          }
        } else {
          determinismCheck = { code: 'AUDIT_CAPTURE_FAILED', status: 'FAIL', detail: rDir.stderr || rSeek.stderr };
          determinismFailed = true;
        }
      }

      const silPath = join(outDir, 'silhouette.png');
      const silRes = captureChrome(chromeBin, `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&silhouette=1`, silPath, 1280, 720, is3d, is3d ? 800 : 1200, gpuCacheDir);
      captures.silhouette = { t: midTime, path: silPath, ok: silRes.ok, ...(silRes.ok ? {} : { error: silRes.stderr }) };

      for (const r of rigs) {
        const cuPath = join(outDir, `closeup_${r.id}.png`);
        const cuUrl = `${baseUrl}?stageOnly=1&pause=1&t=${encodeURIComponent(midTime)}&cropRig=${encodeURIComponent(r.id)}&cropPad=110`;
        const cuRes = captureChrome(chromeBin, cuUrl, cuPath, 1280, 720, is3d, is3d ? 900 : 1200, gpuCacheDir);
        captures.closeups.push({ rigId: r.id, t: midTime, path: cuPath, ok: Boolean(cuPath && cuRes.ok), ...(cuRes.ok ? {} : { error: cuRes.stderr }) });
      }
    } finally {
      if (gpuCacheDir) rmSync(gpuCacheDir, { recursive: true, force: true });
    }
  }
}

const strictFailed = strictCraft && craftAudit.craftWarnings.length > 0;
const finalFailed = strictFailed || determinismFailed;

const report = {
  status: finalFailed ? 'FAIL' : 'PASS',
  renderMode,
  html: htmlPath,
  outDir,
  title: bp.meta?.title ?? '',
  rigs: rigs.map((r) => ({ id: r.id, label: r.label ?? r.id, bones: (r.bones ?? []).length })),
  determinismCheck,
  craftAudit: {
    overallCraftScore: craftAudit.overallCraftScore,
    grade: craftAudit.grade,
    heroPartCount: craftAudit.heroPartCount,
    flaggedHeroParts: craftAudit.flaggedHeroParts,
    bevelCoverage: craftAudit.bevelCoverage,
    materialCoverage: craftAudit.materialCoverage,
    parts: craftAudit.parts,
  },
  craftWarnings: craftAudit.craftWarnings,
  captures,
  critiqueChecklist: is3d
    ? [
        '1. Physical 3D Relief & Bevel Rim (inspect frame_oblique_3d.png & frame_exploded_z.png): clear cardstock thickness, cream cut-edge catchlight, pleated/faceted/tiered mountain volume?',
        '2. Deep Crevice GTAO & Shadow-Box Chiaroscuro (inspect frame_0_*.png): velvety contact occlusion in layer crevices without muddying moon/LED glow?',
        '3. Zero Z-Fighting on Multi-Element Library Parts (inspect modelsheet_*.png & closeup_*.png): crisp eyelashes, blush, gradients, and 3D hoses/strands?',
        '4. Grounded 2-Bone IK Gait & Moving Cast Shadows (inspect motion_sheet.png): 2x hip bob, foot-lock, and real 3D shadows sliding across relief behind characters?',
        '5. Silhouette Readability & Zero Tangents (inspect silhouette.png): instant pose recognition with >= 15px breathing room?',
        '6. Bit-Exact Determinism (determinismCheck.status === PASS): direct(t) SHA-256 matches out-of-order seek(t_other -> t)?',
      ]
    : [
        '1. Silhouette Readability & Zero Tangents (inspect silhouette.png): can every hero & creature be recognized instantly with clean breathing room?',
        '2. Anti-Stiffness Motion Arc & Ground Lock (inspect motion_sheet.png): do feet lock on ground, knees bend, hips bob 2x, scarves/tails trail, and eyes blink?',
        '3. Seamless Limb Silhouette (inspect closeup_*.png): zero wooden bevel rings across knees/elbows via seamGroup + continuous Bezier hoses[]?',
        '4. Tactile Gouache & Paper Materiality (inspect closeup_*.png): gouacheGrain, chalkShadow, crown/occlusion gradients, creases & stitch details?',
        '5. Natural Asymmetric Scenery: fbm/ridgedFbm ridgelines with directional slope shadows and asymmetric storyTree silhouettes?',
        '6. 3/4 Character Appeal & Handedness: expressive 3/4 face (near + far eye), contrapposto weight, and anatomically valid thumb orientation?',
      ],
};

writeFileSync(join(outDir, 'audit_report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(finalFailed ? 1 : 0);
