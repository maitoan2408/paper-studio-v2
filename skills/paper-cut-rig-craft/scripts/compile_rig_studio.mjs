#!/usr/bin/env node
/**
 * Compiles a declarative Paper-Cut Rig Blueprint JSON (single `rig` or multi-character `rigs[]`)
 * into:
 *   1. A paper-studio-v2 compatible asset pack (SVGs + manifest.json with SHA-256 + rig.json / rigs/*.json)
 *   2. A standalone interactive Shadow-Box Rig Viewer HTML powered by assets/viewer-shell.html
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHELL_PATH = resolve(__dirname, '../assets/viewer-shell.html');

function printHelp() {
  console.log(`Usage: node scripts/compile_rig_studio.mjs --spec <blueprint.json> [OPTIONS]

Compile a declarative Paper-Cut Rig Blueprint JSON into a paper-studio-v2 pack
and/or a standalone interactive HTML Shadow-Box Rig Viewer.

Options:
  --spec <FILE>      Input blueprint JSON file (required)
  --out-pack <DIR>   Output directory for SVG + manifest.json + rig.json
  --out-html <FILE>  Output path for standalone interactive preview HTML
  --help, -h         Show this help message

Example:
  node scripts/compile_rig_studio.mjs \\
    --spec fox-rabbit-autumn.blueprint.json \\
    --out-pack ./out/fox-rabbit-v1 \\
    --out-html ./out/fox_rabbit_studio.html`);
}

function argVal(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function wrapPartSvg(part, sharedDefs) {
  const [w, h] = part.size;
  const [ox, oy] = part.pivot;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><filter id="paperTex" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="2" seed="13" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.08  0 0 0 0 0.10  0 0 0 0.08 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gc"/><feBlend in="SourceGraphic" in2="gc" mode="multiply"/></filter>${sharedDefs ?? ''}</defs><g transform="translate(${ox},${oy})" filter="url(#paperTex)">${part.svg}</g></svg>\n`;
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

if (!specPath || (!outPack && !outHtml)) {
  console.error('Error: --spec and at least one of --out-pack or --out-html are required.');
  process.exit(2);
}

const bp = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
const rigList = Array.isArray(bp.rigs) && bp.rigs.length > 0 ? bp.rigs : [bp.rig];
const result = { spec: resolve(specPath), pack: null, html: null };

if (outPack) {
  const packDir = resolve(outPack);
  mkdirSync(packDir, { recursive: true });
  const manifestAssets = [];

  for (const part of bp.parts) {
    const category = part.category ?? 'body';
    const relFile = `${category}/${part.id}.svg`;
    mkdirSync(join(packDir, category), { recursive: true });
    const svgText = wrapPartSvg(part, bp.scene?.defsSvg ?? '');
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

  // Primary rig.json (always written for paper-studio-v2 single-rig compatibility)
  const primaryRig = buildRigDoc(rigList[0]);
  writeFileSync(join(packDir, 'rig.json'), JSON.stringify(primaryRig, null, 2) + '\n', 'utf8');

  // Additional rigs written into rigs/<id>.json when multi-character scene is defined
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

if (outHtml) {
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
