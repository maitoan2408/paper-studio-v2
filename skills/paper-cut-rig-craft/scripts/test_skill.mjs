#!/usr/bin/env node
/**
 * Automated regression & contract test suite for paper-cut-rig-craft skill.
 * Zero external dependencies. Runs against real compile_rig_studio.mjs,
 * validate_pack.mjs, and assets/viewer-shell.html.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(__dirname, '..');
const COMPILE_SCRIPT = join(__dirname, 'compile_rig_studio.mjs');
const VALIDATE_SCRIPT = join(__dirname, 'validate_pack.mjs');
const VIEWER_HTML = join(SKILL_DIR, 'assets', 'viewer-shell.html');

function runNode(script, args) {
  const res = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  });
  let json = null;
  try {
    json = JSON.parse(res.stdout.trim());
  } catch {
    // non-JSON output
  }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

function makeBlueprintA() {
  return {
    meta: {
      packId: 'test-pack-alpha',
      version: '0.1.0',
      title: 'Test Alpha Multi-Rig Diorama',
      subtitle: 'Synthetic multi-rig fixture A',
      icon: 'A',
      seed: 17,
    },
    scene: {
      width: 960,
      height: 540,
      bgColor: '#101828',
      defsSvg:
        '<linearGradient id="bodyGradA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e07a5f"/><stop offset="100%" stop-color="#9e4736"/></linearGradient>' +
        '<linearGradient id="skyGradA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#101828"/><stop offset="100%" stop-color="#2b3a55"/></linearGradient>',
      skySvg: '<rect x="0" y="0" width="960" height="540" fill="url(#skyGradA)"/>',
      frame: {
        style: 'proscenium',
        radius: 52,
        inset: 10,
        step: 12,
        layers: ['#0b1320', '#1d2d44', '#3e5c76'],
      },
      lighting: {
        focalGlow: { x: 480, y: 300, r: 240, color: '#fff2b2', midColor: '#f4a261', opacity: 0.65 },
        mist: { y: 310, height: 140, color: '#e9c46a', opacity: 0.2 },
        vignetteOpacity: 0.3,
      },
      backLayers: [
        { parallax: 10, filter: 'shadowMed', svg: '<path d="M0 440 Q480 390 960 440 V540 H0 Z" fill="#264653"/>' },
      ],
      frontLayers: [
        { parallax: 20, filter: 'shadowDeep', svg: '<path d="M0 500 Q300 475 960 510 V540 H0 Z" fill="#1b263b"/>' },
      ],
      clusters: [
        {
          lane: 'back',
          mode: 'arc',
          cx: 720,
          cy: 150,
          rx: 150,
          ry: 80,
          a0: -3.14,
          a1: 0,
          count: 10,
          seed: 101,
          palette: [['#e76f51', '#c44d34'], ['#f4a261', '#d6823f']],
          shapeSvg: '<path d="M0 -8 L5 0 L0 8 Z" fill="FILL_A"/><path d="M0 -8 L-5 0 L0 8 Z" fill="FILL_B"/>',
        },
      ],
      emitters: [
        {
          type: 'falling',
          count: 8,
          seed: 202,
          speedY: 24,
          windX: -12,
          palette: [['#e9c46a', '#c9a248']],
          shapesSvg: ['<path d="M0 -6 L4 0 L0 6 Z" fill="FILL_A"/><path d="M0 -6 L-4 0 L0 6 Z" fill="FILL_B"/>'],
        },
        { type: 'fireflies', count: 6, seed: 303, color: '#ffe985' },
      ],
    },
    parts: [
      {
        id: 'bodyA',
        category: 'body',
        size: [120, 80],
        pivot: [60, 40],
        anchors: { hip: [30, 56], head: [96, 30] },
        svg: '<ellipse cx="0" cy="0" rx="44" ry="22" fill="url(#bodyGradA)"/>',
      },
      {
        id: 'headA',
        category: 'head',
        size: [60, 60],
        pivot: [20, 30],
        anchors: {},
        svg: '<circle cx="8" cy="0" r="18" fill="url(#bodyGradA)"/>',
      },
      {
        id: 'legUpperA',
        category: 'limb',
        size: [40, 60],
        pivot: [20, 12],
        anchors: { knee: [20, 44] },
        svg: '<rect x="-6" y="-6" width="12" height="38" rx="6" fill="#9e4736"/>',
      },
      {
        id: 'legLowerA',
        category: 'limb',
        size: [40, 60],
        pivot: [20, 10],
        anchors: { foot: [20, 40] },
        svg: '<rect x="-5" y="-5" width="10" height="34" rx="5" fill="#7a3225"/>',
      },
      {
        id: 'companionBody',
        category: 'body',
        size: [60, 60],
        pivot: [30, 30],
        anchors: { head: [30, 14] },
        svg: '<circle cx="0" cy="0" r="18" fill="#f4f1de"/>',
      },
      {
        id: 'companionHead',
        category: 'head',
        size: [40, 40],
        pivot: [20, 20],
        anchors: {},
        svg: '<circle cx="0" cy="-4" r="12" fill="#f4f1de"/>',
      },
    ],
    rigs: [
      {
        id: 'hero',
        label: 'Hero Rig',
        characterId: 'hero-a',
        rootPos: { x: 340, y: 380 },
        facing: 1,
        scale: 1,
        z: 1,
        groundY: 455,
        shadowRx: 52,
        shadowRy: 10,
        groupShadow: 'shadowDeep',
        bones: [
          { id: 'root', parent: null, attach: null, part: 'bodyA', limits: { min: -25, max: 25 }, rest: 0, z: 0 },
          { id: 'head', parent: 'root', attach: 'head', part: 'headA', limits: { min: -35, max: 35 }, rest: 5, z: 2, shadow: 'shadowInner' },
          { id: 'leg.u', parent: 'root', attach: 'hip', part: 'legUpperA', limits: { min: -60, max: 60 }, rest: 10, z: 1, brad: { r: 3.5, fill: '#f0c896', stroke: '#6e391c' } },
          { id: 'leg.l', parent: 'leg.u', attach: 'knee', part: 'legLowerA', limits: { min: -70, max: 70 }, rest: -12, z: 1 },
        ],
      },
      {
        id: 'companion',
        label: 'Companion Rig',
        characterId: 'comp-a',
        rootPos: { x: 640, y: 410 },
        facing: -1,
        scale: 1,
        z: 2,
        groundY: 455,
        shadowRx: 28,
        shadowRy: 7,
        groupShadow: 'shadowDeep',
        bones: [
          { id: 'root', parent: null, attach: null, part: 'companionBody', limits: { min: -20, max: 20 }, rest: 0, z: 0 },
          { id: 'head', parent: 'root', attach: 'head', part: 'companionHead', limits: { min: -30, max: 30 }, rest: 4, z: 1 },
        ],
      },
    ],
    motions: [
      {
        id: 'story',
        name: 'Story Cycle',
        type: 'cycle',
        period: 10,
        phases: [
          {
            from: 0,
            to: 0.5,
            label: 'Phase 1',
            rigs: {
              hero: {
                rootX: [300, 420],
                rootY: [380, 380],
                facing: 1,
                bones: { root: [0, 8], head: [-15, 20], 'leg.u': [-20, 30], 'leg.l': [-10, 25] },
              },
              companion: {
                facing: -1,
                bones: { head: [-10, 12] },
              },
            },
          },
          {
            from: 0.5,
            to: 1.0,
            label: 'Phase 2 (omits head & leg.l intentionally)',
            rigs: {
              hero: {
                rootX: [420, 420],
                rootY: [380, 370],
                facing: -1,
                bones: { root: 0 },
                waves: { 'leg.u': { freq: 3, amp: 8, phase: 0 } },
              },
            },
          },
        ],
      },
      {
        id: 'idle',
        name: 'Idle Harmonic',
        type: 'harmonic',
        label: 'Idle',
        rigs: {
          hero: {
            base: { head: 2 },
            waves: { head: { freq: 1.5, amp: 4, phase: 0 } },
          },
        },
      },
    ],
  };
}

function makeBlueprintB() {
  return {
    meta: {
      packId: 'test-pack-beta',
      version: '0.1.0',
      title: 'Test Beta IK & Variants Fixture',
      subtitle: 'Synthetic IK, variants & rising emitter fixture B',
      icon: 'B',
      seed: 29,
    },
    scene: {
      width: 960,
      height: 540,
      bgColor: '#071a26',
      defsSvg:
        '<linearGradient id="gradBeta" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0369a1"/></linearGradient>' +
        '<linearGradient id="meteorTrail" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity="0"/><stop offset="100%" stop-color="#e0f2fe" stop-opacity="0.95"/></linearGradient>',
      skySvg: '<rect x="0" y="0" width="960" height="540" fill="#071a26"/>',
      frame: { style: 'proscenium', layers: ['#041017', '#0b2536', '#16425b'] },
      emitters: [
        {
          type: 'falling',
          count: 10,
          seed: 404,
          speedY: -26,
          windX: 4,
          palette: [['#bae6fd', '#7dd3fc']],
          shapesSvg: ['<circle cx="0" cy="0" r="4" fill="FILL_A" opacity="0.7"/>'],
        },
        { type: 'meteor', x0: 120, y0: 60, dx: 240, dy: 90, period: 5, dur: 1 },
      ],
      swarms: [
        {
          lane: 'back',
          x0: 100,
          y0: 200,
          speed: 45,
          scale: 0.7,
          bodySvg: '<ellipse cx="0" cy="0" rx="10" ry="5" fill="#7dd3fc"/>',
          tailSvg: '<polygon points="0,0 -8,-4 -8,4" fill="#38bdf8"/>',
        },
      ],
    },
    parts: [
      {
        id: 'torso',
        category: 'body',
        size: [80, 100],
        pivot: [40, 80],
        anchors: { shoulder: [52, 24] },
        svg: '<rect x="-20" y="-60" width="40" height="65" rx="14" fill="url(#gradBeta)"/>',
      },
      {
        id: 'armUpper',
        category: 'limb',
        size: [40, 60],
        pivot: [20, 10],
        anchors: { elbow: [20, 46] },
        svg: '<rect x="-6" y="-6" width="12" height="42" rx="6" fill="#0ea5e9"/>',
      },
      {
        id: 'armLower',
        category: 'limb',
        size: [40, 60],
        pivot: [20, 10],
        anchors: { wrist: [20, 44] },
        svg: '<rect x="-5" y="-5" width="10" height="40" rx="5" fill="#38bdf8"/>',
      },
      {
        id: 'handOpen',
        category: 'hand',
        size: [32, 32],
        pivot: [16, 8],
        anchors: { grip: [16, 20] },
        svg: '<circle cx="0" cy="10" r="9" fill="#bae6fd"/>',
      },
      {
        id: 'handClosed',
        category: 'hand',
        size: [32, 32],
        pivot: [16, 8],
        anchors: { grip: [16, 20] },
        svg: '<rect x="-7" y="2" width="14" height="14" rx="6" fill="#e0f2fe"/>',
      },
    ],
    rigs: [
      {
        id: 'actor',
        label: 'Actor Rig',
        characterId: 'actor-b',
        rootPos: { x: 480, y: 360 },
        sides: ['l', 'r'],
        variants: { handPose: ['open', 'closed'] },
        ik: { arm: { upper: 'arm.u', lower: 'arm.l', end: 'hand', bend: 1 } },
        contacts: { rightGrip: { bone: 'hand', anchor: 'grip' } },
        bones: [
          { id: 'root', parent: null, attach: null, part: 'torso', limits: { min: -20, max: 20 }, rest: 0, z: 0 },
          { id: 'arm.u', parent: 'root', attach: 'shoulder', part: 'armUpper', limits: { min: -120, max: 120 }, rest: 15, z: 1 },
          { id: 'arm.l', parent: 'arm.u', attach: 'elbow', part: 'armLower', limits: { min: -130, max: 20 }, rest: -25, z: 2 },
          {
            id: 'hand',
            parent: 'arm.l',
            attach: 'wrist',
            part: 'handOpen',
            variantGroup: 'handPose',
            variants: { open: 'handOpen', closed: 'handClosed' },
            limits: { min: -45, max: 45 },
            rest: 0,
            z: 3,
          },
        ],
      },
    ],
    motions: [
      {
        id: 'wave',
        name: 'Gentle Wave',
        type: 'harmonic',
        label: 'Wave',
        rigs: {
          actor: {
            base: { 'arm.u': -40, 'arm.l': -50 },
            waves: { 'arm.l': { freq: 3, amp: 15, phase: 0 } },
          },
        },
      },
    ],
  };
}

function createDomStub() {
  const elems = new Map();
  const makeEl = (id) => {
    const el = {
      id,
      _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) { this._innerHTML = v; if (v) this.lastChild = makeEl(`${id}-last`); },
      textContent: '',
      style: {},
      dataset: {},
      value: '1',
      checked: true,
      children: [],
      lastChild: null,
      classList: {
        add() {},
        remove() {},
        toggle() {},
      },
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return this._attrs[k] ?? ''; },
      appendChild(child) {
        this.children.push(child);
        this.lastChild = child;
        return child;
      },
      addEventListener() {},
      querySelector() { return makeEl('sub'); },
      querySelectorAll() { return [makeEl('s0'), makeEl('s1')]; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
      setPointerCapture() {},
      createSVGPoint() { return { x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) }; },
      getScreenCTM() { return { inverse: () => ({}) }; },
    };
    return el;
  };
  const getEl = (id) => {
    if (!elems.has(id)) elems.set(id, makeEl(id));
    return elems.get(id);
  };
  return {
    document: {
      getElementById: getEl,
      createElement: (tag) => makeEl(tag),
      querySelectorAll: () => [],
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    navigator: {},
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    JSON,
    console,
  };
}

const workDir = mkdtempSync(join(tmpdir(), 'paper-cut-skill-test-'));
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}\n  ${err.stack || err.message}`);
  }
}

try {
  test('Hygiene: zero Math.random() across viewer and scripts', () => {
    const files = [
      VIEWER_HTML,
      COMPILE_SCRIPT,
      VALIDATE_SCRIPT,
      join(__dirname, 'render_audit.mjs'),
      join(__dirname, 'library_cli.mjs'),
      join(__dirname, 'lib', 'svg-guard.mjs'),
      join(__dirname, 'lib', 'craft-primitives.mjs'),
      join(__dirname, 'lib', 'kit-resolver.mjs'),
      join(__dirname, 'lib', 'craft-audit.mjs'),
      join(__dirname, 'lib', 'scene-craft.mjs'),
      join(__dirname, 'lib', 'style-loader.mjs'),
    ];
    for (const f of files) {
      assert.ok(existsSync(f), `Expected script file to exist: ${f}`);
      const txt = readFileSync(f, 'utf8');
      assert.equal(/Math\.random\s*\(/.test(txt), false, `Found Math.random() in ${f}`);
    }
  });

  test('Portability: viewer-shell.html defines CSS fallbacks and sRGB filters', () => {
    const html = readFileSync(VIEWER_HTML, 'utf8');
    assert.match(html, /var\(--background,\s*#[0-9a-fA-F]{3,8}\)/, 'Missing --background fallback');
    assert.match(html, /color-interpolation-filters="sRGB"/, 'Missing color-interpolation-filters="sRGB"');
  });

  test('Positive A: multi-rig compile + validate_pack PASS + paperTex synced', () => {
    const bpPath = join(workDir, 'a.blueprint.json');
    const packDir = join(workDir, 'pack-a');
    const htmlPath = join(workDir, 'a.html');
    writeFileSync(bpPath, JSON.stringify(makeBlueprintA(), null, 2));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}\n${c.stderr}`);
    assert.equal(c.json.pack.rigCount, 2);

    const v = runNode(VALIDATE_SCRIPT, ['--pretty', packDir]);
    assert.equal(v.status, 0, `validate failed: ${v.stdout}\n${v.stderr}`);
    assert.equal(v.json.status, 'PASS');
    assert.equal(v.json.errorCount, 0);

    const partSvg = readFileSync(join(packDir, 'body', 'bodyA.svg'), 'utf8');
    assert.match(partSvg, /baseFrequency="0\.06 0\.72"/, 'pack SVG paperTex baseFrequency not synced');
    assert.match(partSvg, /seed="17"/, 'pack SVG paperTex seed not synced from meta.seed');
    assert.match(partSvg, /color-interpolation-filters="sRGB"/, 'pack SVG paperTex missing sRGB');
  });

  test('Positive B: IK + variants + rising emitter + meteor compile & validate PASS', () => {
    const bpPath = join(workDir, 'b.blueprint.json');
    const packDir = join(workDir, 'pack-b');
    const htmlPath = join(workDir, 'b.html');
    writeFileSync(bpPath, JSON.stringify(makeBlueprintB(), null, 2));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}\n${c.stderr}`);

    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `validate failed: ${v.stdout}`);
    assert.equal(v.json.status, 'PASS');
  });

  test('Negative compile: missing required blueprint fields fails closed (BP_SCHEMA)', () => {
    const bpPath = join(workDir, 'neg-schema.json');
    const outDir = join(workDir, 'neg-schema-pack');
    writeFileSync(bpPath, JSON.stringify({ meta: {}, scene: {}, parts: [] }));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', outDir]);
    assert.equal(c.status, 1, `expected exit 1, got ${c.status}`);
    assert.equal(c.json?.status, 'FAIL');
    assert.ok(c.json.errors.some((e) => e.code === 'BP_SCHEMA'), `expected BP_SCHEMA, got ${c.stdout}`);
    assert.equal(existsSync(outDir), false, 'must not write pack dir on compile failure');
  });

  test('Negative compile: <script> in part.svg fails closed (BP_SVG_UNSAFE)', () => {
    const bp = makeBlueprintA();
    bp.parts[0].svg += '<script>alert(1)</script>';
    const bpPath = join(workDir, 'neg-part-script.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', join(workDir, 'neg-part-script.html')]);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE, got ${c.stdout}`);
  });

  test('Negative compile: onload= in scene.backLayers fails closed (BP_SVG_UNSAFE)', () => {
    const bp = makeBlueprintA();
    bp.scene.backLayers[0].svg = '<rect x="0" y="0" width="10" height="10" onload="alert(1)"/>';
    const bpPath = join(workDir, 'neg-scene-onload.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', join(workDir, 'neg-scene-onload.html')]);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE, got ${c.stdout}`);
  });

  test('Negative compile: external url() in scene.skySvg fails closed (BP_SVG_UNSAFE)', () => {
    const bp = makeBlueprintA();
    bp.scene.skySvg = '<rect x="0" y="0" width="100" height="100" fill="url(https://evil.example/a.svg#g)"/>';
    const bpPath = join(workDir, 'neg-scene-url.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', join(workDir, 'neg-scene-url.html')]);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE, got ${c.stdout}`);
  });

  test('Negative compile: xlink:href javascript: URI in scene.overlayProps fails closed (BP_SVG_UNSAFE)', () => {
    const bp = makeBlueprintA();
    bp.scene.overlayProps = [{ x: 100, y: 100, svg: '<use xlink:href="javascript:alert(1)"/>' }];
    const bpPath = join(workDir, 'neg-xlink-js.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--check']);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE, got ${c.stdout}`);
  });

  test('Negative compile: missing <defs> url(#id) in part.svg fails closed (BP_MISSING_DEF)', () => {
    const bp = makeBlueprintA();
    bp.parts[0].svg = '<ellipse cx="0" cy="0" rx="20" ry="10" fill="url(#missingPartGrad)"/>';
    const bpPath = join(workDir, 'neg-part-def.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', join(workDir, 'neg-part-def-pack')]);
    assert.equal(c.status, 1);
    const err = c.json?.errors?.find((e) => e.code === 'BP_MISSING_DEF');
    assert.ok(err, `expected BP_MISSING_DEF, got ${c.stdout}`);
    assert.match(err.detail, /missingPartGrad/, 'error should name missing id');
    assert.match(err.detail, /bodyGradA/, 'error should list available defs to aid self-correction');
  });

  test('Negative compile: missing <defs> url(#id) in scene.backLayers fails closed (BP_MISSING_DEF)', () => {
    const bp = makeBlueprintA();
    bp.scene.backLayers[0].svg = '<rect x="0" y="0" width="50" height="50" fill="url(#missingSceneGrad)"/>';
    const bpPath = join(workDir, 'neg-scene-def.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', join(workDir, 'neg-scene-def.html')]);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_MISSING_DEF'), `expected BP_MISSING_DEF, got ${c.stdout}`);
  });

  test('Negative validate: standalone pack SVG missing <defs> fails closed (ART_MISSING_DEF)', () => {
    const packDir = join(workDir, 'pack-a');
    const svgPath = join(packDir, 'body', 'bodyA.svg');
    const manifestPath = join(packDir, 'manifest.json');
    const origSvg = readFileSync(svgPath, 'utf8');
    const origManifest = readFileSync(manifestPath, 'utf8');
    try {
      const brokenSvg = origSvg.replace('url(#bodyGradA)', 'url(#ghostGrad)');
      writeFileSync(svgPath, brokenSvg, 'utf8');
      const m = JSON.parse(origManifest);
      const asset = m.assets.find((a) => a.id === 'bodyA');
      asset.sha256 = createHash('sha256').update(brokenSvg).digest('hex');
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));

      const v = runNode(VALIDATE_SCRIPT, [packDir]);
      assert.equal(v.status, 1, `expected exit 1, got ${v.status}`);
      assert.ok(v.json.errors.some((e) => e.code === 'ART_MISSING_DEF'), `expected ART_MISSING_DEF, got ${v.stdout}`);
    } finally {
      writeFileSync(svgPath, origSvg, 'utf8');
      writeFileSync(manifestPath, origManifest, 'utf8');
    }
  });

  test('Negative validate: tampered SHA-256 fails closed (ART_SHA_MISMATCH)', () => {
    const packDir = join(workDir, 'pack-a');
    const svgPath = join(packDir, 'body', 'bodyA.svg');
    const origSvg = readFileSync(svgPath, 'utf8');
    try {
      writeFileSync(svgPath, origSvg + '<!-- tampered -->', 'utf8');
      const v = runNode(VALIDATE_SCRIPT, [packDir]);
      assert.equal(v.status, 1);
      assert.ok(v.json.errors.some((e) => e.code === 'ART_SHA_MISMATCH'));
    } finally {
      writeFileSync(svgPath, origSvg, 'utf8');
    }
  });

  test('Negative validate: cycle, degenerate bone, and out-of-limit rest fail closed', () => {
    const packDir = join(workDir, 'pack-a');
    const rigPath = join(packDir, 'rig.json');
    const manifestPath = join(packDir, 'manifest.json');
    const origRig = readFileSync(rigPath, 'utf8');
    const origManifest = readFileSync(manifestPath, 'utf8');
    try {
      // 1) Cycle + out-of-limit rest
      const rig = JSON.parse(origRig);
      rig.bones[2].parent = 'leg.l';
      rig.characters[0].rest.head = 999;
      writeFileSync(rigPath, JSON.stringify(rig, null, 2));
      const v1 = runNode(VALIDATE_SCRIPT, [packDir]);
      assert.equal(v1.status, 1);
      assert.ok(v1.json.errors.some((e) => e.code === 'RIG_CYCLE'), `expected RIG_CYCLE, got ${v1.stdout}`);
      assert.ok(v1.json.errors.some((e) => e.code === 'RIG_REST_OUT_OF_LIMIT'), `expected RIG_REST_OUT_OF_LIMIT`);

      // 2) Degenerate bone (anchor === pivot)
      writeFileSync(rigPath, origRig, 'utf8');
      const m = JSON.parse(origManifest);
      const bodyAsset = m.assets.find((a) => a.id === 'bodyA');
      bodyAsset.anchors.hip = [...bodyAsset.pivot];
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));
      const v2 = runNode(VALIDATE_SCRIPT, [packDir]);
      assert.equal(v2.status, 1);
      assert.ok(v2.json.errors.some((e) => e.code === 'RIG_DEGENERATE_BONE'), `expected RIG_DEGENERATE_BONE, got ${v2.stdout}`);
    } finally {
      writeFileSync(rigPath, origRig, 'utf8');
      writeFileSync(manifestPath, origManifest, 'utf8');
    }
  });

  test('Determinism (t -> pose): phase omission never leaks prior state & order-independent evaluation', () => {
    const html = readFileSync(join(workDir, 'a.html'), 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    assert.ok(match, 'could not extract inline viewer script');
    const ctx = vm.createContext(createDomStub());
    vm.runInContext(
      `${match[1]}\nthis.__TEST__ = { evalMotion, rigStates, state, solveIk, RIG_BY_ID };`,
      ctx,
    );
    const { evalMotion, rigStates, state } = ctx.__TEST__;

    // Evaluate at t=2.5 (Phase 1)
    state.preset = 'story';
    evalMotion(2.5);
    const snap1 = JSON.parse(JSON.stringify(rigStates));

    // Evaluate at t=7.5 (Phase 2: omits hero.head, hero.leg.l, and companion entirely)
    evalMotion(7.5);
    const snapPhase2First = JSON.parse(JSON.stringify(rigStates));

    // In Phase 2, hero.head and hero.leg.l must reset to rest (5 and -12), NOT leak Phase 1 values!
    assert.equal(snapPhase2First.hero.angles.head, 5, `hero.head leaked from Phase 1: got ${snapPhase2First.hero.angles.head}`);
    assert.equal(snapPhase2First.hero.angles['leg.l'], -12, `hero.leg.l leaked from Phase 1: got ${snapPhase2First.hero.angles['leg.l']}`);
    // Calling evalMotion(7.5) repeatedly must NOT accumulate wave angles on leg.u!
    evalMotion(7.5);
    evalMotion(7.5);
    assert.equal(rigStates.hero.angles['leg.u'], snapPhase2First.hero.angles['leg.u'], 'wave angle accumulated across repeated calls at same t');

    // Companion omitted in Phase 2 must reset to its rest pose (head = 4, facing = -1)
    assert.equal(rigStates.companion.angles.head, 4, `companion.head leaked: got ${rigStates.companion.angles.head}`);

    // Switch to harmonic and back to story at t=2.5 -> must match snap1 exactly!
    state.preset = 'idle';
    evalMotion(4.0);
    state.preset = 'story';
    evalMotion(2.5);
    const snap1Again = JSON.parse(JSON.stringify(rigStates));
    assert.deepEqual(snap1Again, snap1, 'evalMotion(t) is not order-independent / pure');
  });

  test('IK safety: solveIk does not throw when upper bone has parent === null', () => {
    const html = readFileSync(join(workDir, 'b.html'), 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const ctx = vm.createContext(createDomStub());
    vm.runInContext(
      `${match[1]}\nthis.__TEST__ = { solveIk, RIG_BY_ID };`,
      ctx,
    );
    const { solveIk, RIG_BY_ID } = ctx.__TEST__;
    const rig = RIG_BY_ID.actor;
    // Construct a synthetic chain starting at root (parent === null)
    assert.doesNotThrow(() => {
      solveIk(rig, { upper: 'root', lower: 'arm.u', end: 'arm.l', bend: 1 }, { x: 520, y: 310 });
    }, 'solveIk threw when upper bone has parent === null');
  });

  test('Batch 2 negative compile: unsafe SVG in clusters.shapesSvg[], midLayers[], and emote.svg fails closed', () => {
    const bp1 = makeBlueprintA();
    bp1.scene.clusters[0].shapesSvg = ['<circle cx="0" cy="0" r="5" fill="FILL_A"/><script>bad()</script>'];
    const p1 = join(workDir, 'neg-b2-cluster.json');
    writeFileSync(p1, JSON.stringify(bp1));
    const r1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(r1.status, 1);
    assert.ok(r1.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE on clusters.shapesSvg: ${r1.stdout}`);

    const bp2 = makeBlueprintA();
    bp2.scene.midLayers = [{ z: 1.5, svg: '<rect x="0" y="0" width="10" height="10" fill="url(#missingMidGrad)"/>' }];
    const p2 = join(workDir, 'neg-b2-mid.json');
    writeFileSync(p2, JSON.stringify(bp2));
    const r2 = runNode(COMPILE_SCRIPT, ['--spec', p2, '--check']);
    assert.equal(r2.status, 1);
    assert.ok(r2.json?.errors?.some((e) => e.code === 'BP_MISSING_DEF'), `expected BP_MISSING_DEF on midLayers: ${r2.stdout}`);

    const bp3 = makeBlueprintA();
    bp3.motions[0].phases[0].rigs.hero.emote = { type: 'custom', svg: '<path d="M0 0" onclick="evil()"/>' };
    const p3 = join(workDir, 'neg-b2-emote.json');
    writeFileSync(p3, JSON.stringify(bp3));
    const r3 = runNode(COMPILE_SCRIPT, ['--spec', p3, '--check']);
    assert.equal(r3.status, 1);
    assert.ok(r3.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE on emote.svg: ${r3.stdout}`);
  });

  test('Batch 2 clusters: shapesSvg[] multi-variant + FILL_C + alignToPath + scaleByProgress', () => {
    const bp = makeBlueprintA();
    bp.scene.clusters = [
      {
        lane: 'back',
        mode: 'line',
        x0: 100,
        y0: 400,
        x1: 300,
        y1: 300,
        count: 8,
        seed: 707,
        alignToPath: true,
        scaleByProgress: [1.4, 0.6],
        palette: [['#112233', '#445566', '#778899']],
        shapesSvg: [
          '<path data-v="v1" d="M0 0 C2 -8 6 -10 8 -14" fill="FILL_A" stroke="FILL_C"/>',
          '<path data-v="v2" d="M0 0 C-3 -6 4 -12 0 -16" fill="FILL_B" stroke="FILL_C"/>',
        ],
      },
    ];
    const bpPath = join(workDir, 'b2-clusters.json');
    const htmlPath = join(workDir, 'b2-clusters.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { CLUSTERS, renderAll };`, ctx);
    const items = ctx.__TEST__.CLUSTERS.backItems[0].items;
    assert.equal(items.length, 8);
    assert.ok(items.some((it) => it.svg.includes('data-v="v1"')), 'missing variant v1 from shapesSvg[]');
    assert.ok(items.some((it) => it.svg.includes('data-v="v2"')), 'missing variant v2 from shapesSvg[]');
    assert.ok(items.every((it) => it.svg.includes('#778899') && !it.svg.includes('FILL_C')), 'FILL_C was not substituted');
  });

  test('Batch 2 scaleWaves: pure t -> scaleX/scaleY elastic deformation with zero state leakage', () => {
    const bp = makeBlueprintA();
    bp.motions[0].phases[0].rigs.hero.scaleWaves = {
      root: { freq: 4.0, ampX: 0.14, ampY: -0.12, phase: 0 },
    };
    const bpPath = join(workDir, 'b2-scalewaves.json');
    const htmlPath = join(workDir, 'b2-scalewaves.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const ctx = vm.createContext(createDomStub());
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, rigStates, state };`, ctx);
    const { evalMotion, rigStates, state } = ctx.__TEST__;

    state.preset = 'story';
    // At t = Math.PI / 8 (~0.3927, inside phase 1 [0..5s]), sin(4 * t) === 1
    evalMotion(Math.PI / 8);
    assert.ok(rigStates.hero.scales?.root, 'rigStates.hero.scales.root missing');
    assert.ok(Math.abs(rigStates.hero.scales.root.x - 1.14) < 0.01, `expected scaleX ~1.14, got ${rigStates.hero.scales.root.x}`);
    assert.ok(Math.abs(rigStates.hero.scales.root.y - 0.88) < 0.01, `expected scaleY ~0.88, got ${rigStates.hero.scales.root.y}`);

    // Phase 2 omits scaleWaves -> must reset cleanly to { x: 1, y: 1 }
    evalMotion(7.5);
    assert.deepEqual(JSON.parse(JSON.stringify(rigStates.hero.scales.root)), { x: 1, y: 1 }, 'scaleWaves leaked into phase without scaleWaves');
  });

  test('Batch 2 data-driven VFX & Emote + depth interleaving (midLayers & lane mid)', () => {
    const bp = makeBlueprintA();
    bp.rigs[0].z = 0;
    bp.rigs[1].z = 3;
    bp.scene.midLayers = [
      { z: 1, parallax: 15, svg: '<rect data-z="mid-layer-1" x="0" y="0" width="10" height="10" fill="#123456"/>' },
    ];
    bp.scene.clusters.push({
      lane: 'mid',
      z: 2,
      mode: 'scatter',
      cx: 400,
      cy: 300,
      rx: 20,
      ry: 20,
      count: 2,
      seed: 909,
      palette: [['#aabbcc', '#ddeeff']],
      shapesSvg: ['<circle data-z="mid-cluster-2" cx="0" cy="0" r="4" fill="FILL_A"/>'],
    });
    bp.motions[0].phases[0].rigs.companion.emote = {
      type: 'custom',
      offsetY: -88,
      svg: '<circle data-emote="custom-star" cx="0" cy="0" r="6" fill="#55ffee"/>',
    };
    bp.motions[0].phases[0].vfx = {
      warmGlow: { x: 520, y: 310, r: 95, color: '#66f7ff', midColor: '#22aacc', intensity: 0.9 },
      burst: { rigId: 'companion', y: 410, color: '#ff88cc', highlightColor: '#ffffff' },
      particles: { rigId: 'companion', intensity: 0.9, color: '#99ffaa', count: 5, dir: -1 },
    };
    const bpPath = join(workDir, 'b2-vfx-depth.json');
    const htmlPath = join(workDir, 'b2-vfx-depth.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll, state };`, ctx);
    ctx.__TEST__.state.preset = 'story';
    ctx.__TEST__.evalMotion(2.5);
    ctx.__TEST__.renderAll(2.5, 0, 0);

    const heroesHtml = stub.document.getElementById('layerHeroes').innerHTML;
    const vfxHtml = stub.document.getElementById('layerVfx').innerHTML;

    // Verify strict z-interleaving order inside layerHeroes:
    // hero (z=0) -> mid-layer-1 (z=1) -> mid-cluster-2 (z=2) -> companion (z=3)
    const idxHero = heroesHtml.indexOf('url(#bodyGradA)');
    const idxMidLayer = heroesHtml.indexOf('data-z="mid-layer-1"');
    const idxMidCluster = heroesHtml.indexOf('data-z="mid-cluster-2"');
    const idxComp = heroesHtml.indexOf('#f4f1de');
    assert.ok(idxHero >= 0 && idxMidLayer > idxHero && idxMidCluster > idxMidLayer && idxComp > idxMidCluster,
      `depth interleaving order broken: hero=${idxHero}, midLayer=${idxMidLayer}, midCluster=${idxMidCluster}, comp=${idxComp}`);

    // Verify custom emote & smooth data-driven dynVfxGlow radialGradient (no hard-edged solid circles)
    assert.ok(heroesHtml.includes('data-emote="custom-star"'), 'custom emote SVG not rendered');
    assert.ok(vfxHtml.includes('url(#dynVfxGlow)'), 'vfx.glow must use smooth radialGradient url(#dynVfxGlow)');
    assert.equal(stub.document.getElementById('vfxGlowS0').getAttribute('stop-color'), '#66f7ff', 'vfxGlowS0 stop-color not updated');
    assert.equal(stub.document.getElementById('vfxGlowS1').getAttribute('stop-color'), '#22aacc', 'vfxGlowS1 stop-color not updated');
    assert.ok(vfxHtml.includes('#ff88cc'), 'data-driven burst color not rendered');
    assert.ok(vfxHtml.includes('#99ffaa'), 'data-driven particles color not rendered');
  });

  test('Batch 2 polish: parent scaleWaves moves child anchors, falling emitter honors yMin/yMax, toolbar sits outside stageBox', () => {
    const bp = makeBlueprintA();
    bp.scene.emitters[0].yMin = 200;
    bp.scene.emitters[0].yMax = 450;
    bp.motions[0].phases[0].rigs.hero.scaleWaves = {
      root: { freq: 4.0, ampX: 0.2, ampY: -0.15, phase: 0 },
    };
    const bpPath = join(workDir, 'b2-polish.json');
    const htmlPath = join(workDir, 'b2-polish.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');

    // Toolbar must sit outside #stageBox so it never covers characters or foreground art on narrow screens
    const stageIdx = html.indexOf('id="stageBox"');
    const chkIdx = html.indexOf('id="chkBones"');
    const svgCloseIdx = html.indexOf('</svg>');
    const stageCloseIdx = html.indexOf('</div>', svgCloseIdx);
    assert.ok(stageIdx > 0 && chkIdx > stageCloseIdx, 'bottom toolbar (chkBones) must sit outside #stageBox');

    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, computeWorld, renderAll, RIG_BY_ID, state };`, ctx);
    const { evalMotion, computeWorld, renderAll, RIG_BY_ID, state } = ctx.__TEST__;

    // 1) Child bone head must track parent root's scaleWaves X/Y offset
    state.preset = 'story';
    evalMotion(0); // sin(0) = 0 -> scale (1,1)
    const wUnscaled = computeWorld(RIG_BY_ID.hero);
    const dxUnscaled = Math.hypot(wUnscaled.head.x - wUnscaled.root.x, wUnscaled.head.y - wUnscaled.root.y);
    evalMotion(Math.PI / 8); // sin(pi/2) = 1 -> scale (1.2, 0.85)
    const wScaled = computeWorld(RIG_BY_ID.hero);
    const dxScaled = Math.hypot(wScaled.head.x - wScaled.root.x, wScaled.head.y - wScaled.root.y);
    assert.ok(Math.abs(dxScaled - dxUnscaled) > 3, `child bone did not track parent scaleWaves (unscaled=${dxUnscaled}, scaled=${dxScaled})`);

    // 2) Falling emitter particles with yMin=200, yMax=450 must all stay inside [200, 450]
    renderAll(1.5, 0, 0);
    const fallingHtml = stub.document.getElementById('layerFallingBack').innerHTML + stub.document.getElementById('layerFallingFront').innerHTML;
    const ys = [...fallingHtml.matchAll(/translate\([-0-9.]+,([-0-9.]+)\)/g)].map((m) => Number(m[1]));
    assert.ok(ys.length > 0, 'expected rendered falling particles');
    for (const y of ys) {
      assert.ok(y >= 195 && y <= 455, `particle y=${y} escaped emitter [yMin=200, yMax=450]`);
    }

    // 3) Frame-1 tick() with an earlier rAF timestamp must never produce negative state.time (Phase-4 wrap bug)
    const stub2 = createDomStub();
    stub2.performance = { now: () => 500 };
    const ctx2 = vm.createContext(stub2);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { tick, state };`, ctx2);
    ctx2.__TEST__.tick(480); // timestamp earlier than performance.now()
    assert.equal(ctx2.__TEST__.state.time, 0, 'first frame must stay at t=0, not go negative');
    ctx2.__TEST__.tick(470); // even a backward monotonic glitch must clamp dt >= 0
    assert.equal(ctx2.__TEST__.state.time, 0, 'backward timestamp must clamp dt to 0');
    ctx2.__TEST__.tick(486); // +16ms forward
    assert.ok(ctx2.__TEST__.state.time > 0.015 && ctx2.__TEST__.state.time < 0.017, `expected ~0.016s, got ${ctx2.__TEST__.state.time}`);
  });

  test('Batch 2 universal negative compile: unsafe SVG in vfx.burst.svg and vfx.particles.shapeSvg fails closed', () => {
    const bp1 = makeBlueprintA();
    bp1.motions[0].phases[0].vfx = { burst: { mode: 'phase', svg: '<g onload="alert(1)"><circle r="5"/></g>' } };
    const p1 = join(workDir, 'neg-burst-svg.json');
    writeFileSync(p1, JSON.stringify(bp1));
    const c1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(c1.status, 1);
    assert.ok(c1.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE for burst.svg, got ${c1.stdout}`);

    const bp2 = makeBlueprintA();
    bp2.motions[0].phases[0].vfx = { particles: { shapeSvg: '<script>alert(1)</script>' } };
    const p2 = join(workDir, 'neg-part-shape-svg.json');
    writeFileSync(p2, JSON.stringify(bp2));
    const c2 = runNode(COMPILE_SCRIPT, ['--spec', p2, '--check']);
    assert.equal(c2.status, 1);
    assert.ok(c2.json?.errors?.some((e) => e.code === 'BP_SVG_UNSAFE'), `expected BP_SVG_UNSAFE for particles.shapeSvg, got ${c2.stdout}`);
  });

  test('Batch 2 universal generalization: burst types/svg, custom particle shapeSvg, daylight lighting colors, sortY clusters, and 360° spins', () => {
    const bp = makeBlueprintA();
    bp.scene.lighting.vignetteColor = '#5c3a21';
    bp.scene.lighting.shadowColor = '#3b2414';
    bp.scene.clusters = [
      {
        lane: 'back',
        mode: 'scatter',
        cx: 400,
        cy: 300,
        rx: 80,
        ry: 90,
        count: 14,
        seed: 777,
        sortY: true,
        sway: 0,
        parallax: 0,
        palette: [['#88aa44', '#557722', '#ddeebb']],
        shapesSvg: ['<circle cx="0" cy="0" r="6" fill="FILL_A"/>'],
      },
    ];
    // Widened limits on head so it can act as a 360-degree spinning mechanism in phase 1 and reset in phase 2
    bp.rigs[0].bones[1].limits = { min: -180, max: 180 };
    bp.rigs[0].bones[1].rest = 0;
    bp.motions[0].period = 10;
    bp.motions[0].phases = [
      {
        from: 0.0,
        to: 0.5,
        label: 'Spin & Forge Sparks',
        rigs: {
          hero: {
            emote: { type: 'music', color: '#ffaa33' },
            spins: { head: 180 },
          },
        },
        vfx: {
          burst: { mode: 'phase', type: 'sparks', x: 420, y: 320, color: '#ffbb44', highlightColor: '#ffffff' },
          particles: { rigId: 'hero', intensity: 0.9, count: 4, color: '#ffcc55', shapeSvg: '<polygon data-p="note" points="0,-4 4,0 0,4 -4,0" fill="FILL_A"/>' },
        },
      },
      {
        from: 0.5,
        to: 1.0,
        label: 'Rest Phase',
        rigs: { hero: {} },
      },
    ];

    const bpPath = join(workDir, 'b2-universal.json');
    const htmlPath = join(workDir, 'b2-universal.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(!html.includes('id="warmMomentGlow"'), 'legacy warmMomentGlow must be removed');

    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll, rigStates, state };`, ctx);
    const { evalMotion, renderAll, rigStates, state } = ctx.__TEST__;

    // 1) Daylight shadowColor & vignetteColor applied in <defs>
    const defsHtml = stub.document.getElementById('svgDefs').innerHTML;
    assert.ok(defsHtml.includes('#5c3a21'), 'custom vignetteColor not applied to autoVignette');
    assert.ok(defsHtml.includes('#3b2414'), 'custom shadowColor not applied to shadow filters');

    // 2) sortY: true renders cluster items in ascending Y order (shingle layering)
    renderAll(0, 0, 0);
    const clHtml = stub.document.getElementById('layerClustersBack').innerHTML;
    const clYs = [...clHtml.matchAll(/translate\([-0-9.]+,([-0-9.]+)\)\s+rotate\(/g)].map((m) => Number(m[1]));
    assert.equal(clYs.length, 14);
    for (let i = 1; i < clYs.length; i++) {
      assert.ok(clYs[i] >= clYs[i - 1], `cluster sortY violated at index ${i}: ${clYs[i - 1]} > ${clYs[i]}`);
    }

    // 3) 360-degree continuous spin is pure function of t and resets cleanly when omitted
    state.preset = 'story';
    evalMotion(0.5); // 0.5s * 180 deg/s = +90 deg
    assert.ok(Math.abs(rigStates.hero.angles.head - 90) < 0.01, `expected +90 deg at t=0.5, got ${rigStates.hero.angles.head}`);
    evalMotion(1.5); // 1.5s * 180 deg/s = 270 deg -> wrapped to -90 deg
    assert.ok(Math.abs(rigStates.hero.angles.head - (-90)) < 0.01, `expected -90 deg at t=1.5, got ${rigStates.hero.angles.head}`);
    evalMotion(7.0); // Phase 2 omits spins -> must reset cleanly to rest (0)
    assert.equal(rigStates.hero.angles.head, 0, 'omitted spin must reset cleanly to rest');

    // 4) Non-water burst type="sparks", custom particle shapeSvg, and music emote
    evalMotion(2.5); // mid Phase 1 (lt = 0.5)
    renderAll(2.5, 0, 0);
    const vfxHtml = stub.document.getElementById('layerVfx').innerHTML;
    const heroesHtml = stub.document.getElementById('layerHeroes').innerHTML;
    assert.ok(vfxHtml.includes('data-burst="sparks"'), 'expected burst type="sparks"');
    assert.ok(vfxHtml.includes('data-p="note"'), 'expected custom particle shapeSvg');
    assert.ok(heroesHtml.includes('data-emote="music"'), 'expected built-in music emote');
  });

  test('Batch 2.5 Tactile Paper Engine: paperBevel, paperBevelSoft, built-in patterns, and custom scene.materials[] compile + validate cleanly', () => {
    const bp = makeBlueprintA();
    bp.scene.lighting.bevelDir = [-1, -1];
    bp.scene.lighting.bevelLightColor = '#fff6dc';
    bp.scene.lighting.bevelWidth = 1.4;
    bp.scene.materials = [
      { id: 'pat-tweed-warm', type: 'linen', color: '#5c3d2e', bg: '#8c6248', opacity: 0.3, scale: 1.1 },
      { id: 'pat-stone-grain', type: 'kraft', color: '#475569', bg: '#94a3b8', opacity: 0.25, scale: 1.0 },
    ];
    bp.parts[0].svg = '<g filter="url(#paperBevel)"><path d="M-24 -30 C-10 -34 10 -34 24 -30 L26 24 C10 30 -10 30 -26 24 Z" fill="url(#bodyGradA)"/><path d="M-24 -30 C-10 -34 10 -34 24 -30 L26 24 C10 30 -10 30 -26 24 Z" fill="url(#pat-tweed-warm)" opacity="0.45"/><path d="M0 -30 L0 26" stroke="#fff4d8" stroke-width="1.2" opacity="0.4"/></g>';
    bp.scene.backLayers[0].svg = '<rect x="0" y="340" width="960" height="200" fill="url(#pat-stone-grain)" filter="url(#paperBevelSoft)"/>';

    const bpPath = join(workDir, 'b25-tactile.json');
    const packDir = join(workDir, 'b25-tactile-pack');
    const htmlPath = join(workDir, 'b25-tactile.html');
    writeFileSync(bpPath, JSON.stringify(bp));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile failed: ${c.stdout}`);
    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `validate_pack failed on pack using paperBevel & scene.materials: ${v.stdout}`);

    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { renderAll };`, ctx);
    const defsHtml = stub.document.getElementById('svgDefs').innerHTML;
    assert.ok(defsHtml.includes('id="paperBevel"'), 'missing paperBevel filter in viewer defs');
    assert.ok(defsHtml.includes('id="paperBevelSoft"'), 'missing paperBevelSoft filter in viewer defs');
    assert.ok(defsHtml.includes('id="pat-linen"'), 'missing built-in pat-linen pattern in viewer defs');
    assert.ok(defsHtml.includes('id="pat-kraft"'), 'missing built-in pat-kraft pattern in viewer defs');
    assert.ok(defsHtml.includes('id="pat-tweed-warm"'), 'missing custom scene.materials pattern pat-tweed-warm');
    assert.ok(defsHtml.includes('#fff6dc'), 'custom bevelLightColor not applied to paperBevel');
  });

  test('Batch 2.5 Negative material: invalid scene.materials entry fails closed', () => {
    const bp = makeBlueprintA();
    bp.scene.materials = [{ id: 'bad id!', type: 'unknown-type', color: '#fff' }];
    const bpPath = join(workDir, 'b25-bad-mat.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--check']);
    assert.equal(c.status, 1);
    assert.ok(c.json?.errors?.some((e) => e.code === 'BP_SCHEMA'), `expected BP_SCHEMA for invalid material, got ${c.stdout}`);
  });

  test('Batch 2.5 Craft Primitives: deterministic, SVG-guard clean, theme-agnostic, and fail-closed on bad inputs', () => {
    const craftPath = join(__dirname, 'lib', 'craft-primitives.mjs');
    assert.ok(existsSync(craftPath), 'craft-primitives.mjs must exist');
    const res = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
        import { deckleEdgePath, taperedRibbon, scallopBorder, layeredShingleFan, origamiCrease, stitchTrack, kirigamiCutout } from ${JSON.stringify(craftPath)};
        import { scanSvgFragment } from ${JSON.stringify(join(__dirname, 'lib', 'svg-guard.mjs'))};
        const d1 = deckleEdgePath([[0,0],[40,0],[40,40],[0,40]], { seed: 42, amplitude: 1.8 });
        const d2 = deckleEdgePath([[0,0],[40,0],[40,40],[0,40]], { seed: 42, amplitude: 1.8 });
        assert.equal(d1, d2, 'deckleEdgePath must be deterministic');
        const rib = taperedRibbon([[0,0],[20,-10],[45,-4],[70,8]], { widthStart: 14, widthEnd: 3 });
        const scal = scallopBorder([[0,0],[40,0],[80,0]], { depth: 8, scallops: 6 });
        const fan = layeredShingleFan({ cx: 0, cy: 0, rows: 3, countPerRow: 4, radius: 32, seed: 7 });
        const fold = origamiCrease({ p1: [0,-20], p2: [0,20], left: [-18,0], right: [18,0], lightFill: '#eee', darkFill: '#999' });
        const st = stitchTrack([[0,0],[20,10],[40,0]]);
        const kiri = kirigamiCutout({ cx: 0, cy: 0, r: 24, petals: 8 });
        const errs = [];
        const combined = \`<g><path d="\${d1}" fill="#aaa"/><path d="\${rib}" fill="#bbb"/><path d="\${scal}" fill="#ccc"/>\${fan}\${fold}\${st}\${kiri}</g>\`;
        scanSvgFragment(combined, 'craft-test', (c,w,d) => errs.push({c,w,d}));
        assert.equal(errs.length, 0, 'craft primitives emitted unsafe SVG: ' + JSON.stringify(errs));
        assert.throws(() => taperedRibbon([[0,0]], { widthStart: 10, widthEnd: 2 }), /CRAFT_PARAM_INVALID/);
        assert.throws(() => kirigamiCutout({ r: -5 }), /CRAFT_PARAM_INVALID/);
        console.log('CRAFT_OK');`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `craft-primitives check failed: ${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('CRAFT_OK'));
  });

  test('Batch 2.5 Modular Component Kit: kitRef on parts[], {{KIT:...}} macro in scene, custom --kit-dir, and fail-closed security', () => {
    const kitDir = join(SKILL_DIR, 'assets', 'kit');
    assert.ok(existsSync(kitDir), 'assets/kit directory must exist');

    // Positive: use built-in kit components via kitRef and {{KIT:...}} macro
    const bp = makeBlueprintA();
    bp.parts.push({
      id: 'kit_hand_test',
      category: 'hand',
      kitRef: {
        id: 'hand-open',
        tokens: { PRIMARY: '#f2c7a4', SHADOW: '#c9936d', HIGHLIGHT: '#fff1e0', STROKE: '#6b412a' },
      },
    });
    bp.rigs[0].bones[1].variants = { open: 'kit_hand_test' };
    bp.scene.cornersSvg = '{{KIT:kirigami-rosette|PRIMARY=#e8c589|SHADOW=#8a6230|ACCENT=#fff4d6|x=42|y=42|scale=0.8}}';

    const bpPath = join(workDir, 'b25-kit.json');
    const packDir = join(workDir, 'b25-kit-pack');
    const htmlPath = join(workDir, 'b25-kit.html');
    writeFileSync(bpPath, JSON.stringify(bp));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `kit compile failed: ${c.stdout}`);
    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `kit pack validation failed: ${v.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('#f2c7a4') && !html.includes('{{KIT:'), 'kit macro or tokens were not resolved');

    // Positive: custom --kit-dir overrides/adds studio artist component without touching code
    const customKitDir = join(workDir, 'studio-kit');
    spawnSync('mkdir', ['-p', customKitDir]);
    writeFileSync(
      join(customKitDir, 'custom-badge.json'),
      JSON.stringify({
        id: 'custom-badge',
        category: 'prop',
        size: [40, 40],
        pivot: [20, 20],
        anchors: { mount: [20, 34] },
        tokens: { PRIMARY: '#ffffff', ACCENT: '#000000' },
        svg: '<g data-custom-kit="1"><path d="M-12 -12 L12 -12 L14 12 L-14 12 Z" fill="{{PRIMARY}}"/><path d="M-6 0 L0 -6 L6 0 L0 6 Z" fill="{{ACCENT}}"/></g>',
      }),
    );
    const bpCustom = makeBlueprintA();
    bpCustom.scene.cornersSvg = '{{KIT:custom-badge|PRIMARY=#ff5533|ACCENT=#ffee99|x=20|y=20}}';
    const bpCustomPath = join(workDir, 'b25-custom-kit.json');
    writeFileSync(bpCustomPath, JSON.stringify(bpCustom));
    const cCustom = runNode(COMPILE_SCRIPT, ['--spec', bpCustomPath, '--kit-dir', customKitDir, '--check']);
    assert.equal(cCustom.status, 0, `custom --kit-dir compile failed: ${cCustom.stdout}`);

    // Negative 1: unknown kit ID fails closed with BP_KIT_NOT_FOUND
    const bpMissing = makeBlueprintA();
    bpMissing.scene.cornersSvg = '{{KIT:does-not-exist-999}}';
    const pMissing = join(workDir, 'b25-kit-missing.json');
    writeFileSync(pMissing, JSON.stringify(bpMissing));
    const cMissing = runNode(COMPILE_SCRIPT, ['--spec', pMissing, '--check']);
    assert.equal(cMissing.status, 1);
    assert.ok(cMissing.json?.errors?.some((e) => e.code === 'BP_KIT_NOT_FOUND'), `expected BP_KIT_NOT_FOUND, got ${cMissing.stdout}`);

    // Negative 2: XSS injection via kit token fails closed
    const bpXss = makeBlueprintA();
    bpXss.scene.cornersSvg = '{{KIT:kirigami-rosette|PRIMARY=#fff" onload="alert(1)}}';
    const pXss = join(workDir, 'b25-kit-xss.json');
    writeFileSync(pXss, JSON.stringify(bpXss));
    const cXss = runNode(COMPILE_SCRIPT, ['--spec', pXss, '--check']);
    assert.equal(cXss.status, 1);
    assert.ok(
      cXss.json?.errors?.some((e) => e.code === 'BP_KIT_INVALID' || e.code === 'BP_SVG_UNSAFE'),
      `expected fail-closed security error for malicious kit token, got ${cXss.stdout}`,
    );
  });

  test('Batch 2.5 Craft Audit & validate_pack --strict-craft: flags bare primitive hero parts, passes multi-layer crafted parts', () => {
    // Primitive blueprint (bare 1-rect/1-circle hero parts)
    const bpSimple = makeBlueprintA();
    bpSimple.parts[0].svg = '<rect x="-12" y="-12" width="24" height="24" fill="#888888"/>';
    bpSimple.parts[1].svg = '<circle cx="0" cy="0" r="14" fill="#aaaaaa"/>';
    const pSimple = join(workDir, 'b25-simple.json');
    const packSimple = join(workDir, 'b25-simple-pack');
    writeFileSync(pSimple, JSON.stringify(bpSimple));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', pSimple, '--out-pack', packSimple]).status, 0);

    // Default validate_pack still PASSes technically, but surfaces craftWarnings
    const vDefault = runNode(VALIDATE_SCRIPT, [packSimple]);
    assert.equal(vDefault.status, 0, `default validate_pack should pass technical checks: ${vDefault.stdout}`);
    assert.ok(Array.isArray(vDefault.json?.craftWarnings) && vDefault.json.craftWarnings.length > 0, 'expected craftWarnings on bare primitive hero parts');
    assert.ok(vDefault.json.craftWarnings.some((w) => w.code === 'CRAFT_TOO_SIMPLE'), `expected CRAFT_TOO_SIMPLE warning, got ${JSON.stringify(vDefault.json?.craftWarnings)}`);

    // Strict craft mode fails closed on bare primitive hero parts
    const vStrict = runNode(VALIDATE_SCRIPT, ['--strict-craft', packSimple]);
    assert.equal(vStrict.status, 1, 'expected --strict-craft to fail on primitive hero parts');

    // Richly crafted blueprint (multi-layer paths + gradients/patterns + bevel/creases) passes --strict-craft
    const bpRich = makeBlueprintA();
    const richSvg = '<g filter="url(#paperBevel)"><path d="M-24 -30 C-10 -34 10 -34 24 -30 C28 -8 28 10 24 28 C10 32 -10 32 -24 28 C-28 10 -28 -8 -24 -30 Z" fill="url(#bodyGradA)"/><path d="M-24 -30 C-10 -34 10 -34 24 -30 L24 28 L-24 28 Z" fill="url(#pat-linen)" opacity="0.35"/><path d="M-22 -24 C-6 -20 6 -20 22 -24 L18 22 C4 26 -8 24 -20 18 Z" fill="#182235" opacity="0.22"/><path d="M-18 -26 C-4 -30 8 -30 18 -24" fill="none" stroke="#fff7e4" stroke-width="1.4" opacity="0.55"/><path d="M-10 -12 L10 -12 M-8 4 L8 4" stroke="#f5d9a8" stroke-width="1.1" stroke-dasharray="3 3" opacity="0.6"/></g>';
    bpRich.parts = bpRich.parts.map((pt) => ({ ...pt, svg: richSvg }));
    const pRich = join(workDir, 'b25-rich.json');
    const packRich = join(workDir, 'b25-rich-pack');
    writeFileSync(pRich, JSON.stringify(bpRich));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', pRich, '--out-pack', packRich]).status, 0);
    const vRichStrict = runNode(VALIDATE_SCRIPT, ['--strict-craft', packRich]);
    assert.equal(vRichStrict.status, 0, `richly crafted pack should pass --strict-craft: ${vRichStrict.stdout}`);
    assert.ok((vRichStrict.json?.craftAudit?.overallCraftScore ?? 0) >= 75, `expected high craft score, got ${JSON.stringify(vRichStrict.json?.craftAudit)}`);
  });

  test('Batch 2.5 Viewer Audit Query Modes & render_audit.mjs: stageOnly, silhouette, cropRig, and deterministic report', () => {
    const AUDIT_SCRIPT = join(__dirname, 'render_audit.mjs');
    assert.ok(existsSync(AUDIT_SCRIPT), 'render_audit.mjs must exist');

    const bp = makeBlueprintA();
    const bpPath = join(workDir, 'b25-audit.json');
    const htmlPath = join(workDir, 'b25-audit.html');
    const auditOut = join(workDir, 'b25-audit-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);

    // 1) Verify silhouette=1 and cropRig=hero URL modes in viewer-shell.html runtime
    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    stub.window = { location: { search: '?t=1.2&pause=1&stageOnly=1&silhouette=1&cropRig=hero' } };
    stub.URLSearchParams = URLSearchParams;
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { renderAll, state };`, ctx);
    ctx.__TEST__.renderAll(1.2, 0, 0);
    assert.equal(ctx.__TEST__.state.playing, false, 'pause=1 must pause playback');
    assert.equal(ctx.__TEST__.state.silhouette, true, 'silhouette=1 must enable silhouette mode');
    const skyHtml = stub.document.getElementById('layerSky').innerHTML;
    assert.ok(skyHtml.includes('#f4efe6'), 'silhouette mode must render light high-contrast backdrop');
    const heroesHtml = stub.document.getElementById('layerHeroes').innerHTML;
    assert.ok(heroesHtml.includes('url(#silhouetteFilter)'), 'silhouette mode must apply silhouetteFilter to rigs');
    const vb = stub.document.getElementById('sceneSvg').getAttribute('viewBox');
    assert.ok(vb && vb !== '0 0 960 540', `cropRig=hero must zoom viewBox onto hero rig, got viewBox="${vb}"`);

    // 2) Run render_audit.mjs in --no-chrome mode for deterministic CI-safe craft report
    const a = runNode(AUDIT_SCRIPT, ['--html', htmlPath, '--spec', bpPath, '--out', auditOut, '--no-chrome']);
    assert.equal(a.status, 0, `render_audit --no-chrome failed: ${a.stderr}\n${a.stdout}`);
    assert.ok(a.json && a.json.craftAudit && typeof a.json.craftAudit.overallCraftScore === 'number', `missing craftAudit in report: ${a.stdout}`);
    assert.ok(existsSync(join(auditOut, 'audit_report.json')), 'audit_report.json not written');
  });

  test('Batch 2.5 Starter Kit Catalog: every assets/kit/*.json passes svg-guard safety and craft audit', () => {
    const res = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
        import { loadKitCatalog, expandKitMacrosInString } from ${JSON.stringify(join(__dirname, 'lib', 'kit-resolver.mjs'))};
        import { scanSvgFragment, getBuiltinViewerDefs } from ${JSON.stringify(join(__dirname, 'lib', 'svg-guard.mjs'))};
        import { analyzeSvgCraft } from ${JSON.stringify(join(__dirname, 'lib', 'craft-audit.mjs'))};
        const errs = [];
        const cat = loadKitCatalog([], (c,w,d) => errs.push({c,w,d}));
        assert.equal(errs.length, 0, 'kit catalog load errors: ' + JSON.stringify(errs));
        assert.ok(cat.size >= 12, 'expected at least 12 starter kit components, got ' + cat.size);
        const defs = getBuiltinViewerDefs({});
        for (const [id, comp] of cat.entries()) {
          const rendered = expandKitMacrosInString(\`{{KIT:\${id}}}\`, cat, id, (c,w,d) => errs.push({c,w,d}));
          scanSvgFragment(rendered, id, (c,w,d) => errs.push({c,w,d}), { knownDefIds: defs, checkDefRefs: true });
          const score = analyzeSvgCraft(rendered, id);
          assert.ok(score.totalPrimitives >= 4, \`kit \${id} too simple (\${score.totalPrimitives} primitives)\`);
        }
        assert.equal(errs.length, 0, 'kit validation errors: ' + JSON.stringify(errs));
        console.log('KIT_CATALOG_OK:' + cat.size);`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `kit catalog test failed: ${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('KIT_CATALOG_OK:'));
  });

  test('Batch 2.8 v3 Surface & Seamless Limbs: gouacheGrain, chalkShadow, seamGroup merged silhouette, and continuous Bezier hoses[]', () => {
    const bp = makeBlueprintB();
    bp.rigs[0].groundY = 445;
    bp.rigs[0].bones[1].seamGroup = 'armMerged';
    bp.rigs[0].bones[1].seamFilter = 'paperBevelSoft';
    bp.rigs[0].bones[2].seamGroup = 'armMerged';
    bp.rigs[0].bones[2].seamFilter = 'paperBevelSoft';
    bp.rigs[0].bones[1].hiddenInViewer = true;
    bp.rigs[0].bones[2].hiddenInViewer = true;
    bp.rigs[0].hoses = [
      {
        id: 'arm_hose',
        upper: 'arm.u',
        lower: 'arm.l',
        end: 'hand',
        z: 1.5,
        widthStart: 14,
        widthMid: 11,
        widthEnd: 8,
        fill: 'url(#gradBeta)',
        cuffAt: 0.58,
        cuffFill: '#bae6fd',
        rimColor: '#ffffff',
        seamGroup: 'armMerged',
      },
    ];
    bp.parts[0].svg = '<g filter="url(#gouacheGrain)"><rect x="-20" y="-60" width="40" height="65" rx="14" fill="url(#gradBeta)"/></g>';

    const bpPath = join(workDir, 'v3-seamless.json');
    const packDir = join(workDir, 'v3-seamless-pack');
    const htmlPath = join(workDir, 'v3-seamless.html');
    writeFileSync(bpPath, JSON.stringify(bp));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `v3 seamless compile failed: ${c.stdout}`);
    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `v3 seamless validate_pack failed: ${v.stdout}`);

    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll };`, ctx);
    ctx.__TEST__.evalMotion(1.0);
    ctx.__TEST__.renderAll(1.0, 0, 0);

    const defsHtml = stub.document.getElementById('svgDefs').innerHTML;
    assert.ok(defsHtml.includes('id="gouacheGrain"'), 'missing gouacheGrain filter in viewer defs');
    assert.ok(defsHtml.includes('id="chalkShadow"'), 'missing chalkShadow filter in viewer defs');

    const heroesHtml = stub.document.getElementById('layerHeroes').innerHTML;
    assert.ok(heroesHtml.includes('data-seam-group="armMerged"'), 'missing merged seamGroup wrapper');
    assert.ok(heroesHtml.includes('data-hose="arm_hose"'), 'missing continuous Bezier hose path');
    // Verify hiddenInViewer suppressed the rigid rect capsules while keeping hand visible
    assert.ok(!heroesHtml.includes('fill="#0ea5e9"'), 'hiddenInViewer bone arm.u should not be drawn');
    assert.ok(heroesHtml.includes('fill="#bae6fd"'), 'cuffFill / hand should still render');
  });

  test('Batch 2.8 v3 Negative hose: unknown bone or unsafe fill in rig.hoses[] fails closed', () => {
    const bp = makeBlueprintB();
    bp.rigs[0].hoses = [{ id: 'bad_hose', upper: 'arm.u', lower: 'missing_bone', end: 'hand', fill: '#fff' }];
    const p1 = join(workDir, 'v3-bad-hose.json');
    writeFileSync(p1, JSON.stringify(bp));
    const c1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(c1.status, 1);
    assert.ok(c1.json?.errors?.some((e) => e.code === 'BP_RIG_INVALID'), `expected BP_RIG_INVALID for bad hose bone, got ${c1.stdout}`);
  });

  test('Batch 2.8 v3 Anti-Stiff Living Motion: stateless IK gait (2x bob + foot-lock), followThrough inertia, and deterministic eye blink', () => {
    const bp = makeBlueprintB();
    // Add a scarf bone with followThrough and an eye element with data-eye="1"
    bp.parts[0].anchors.scarf = [28, 26];
    bp.parts[0].svg = '<g><rect x="-20" y="-60" width="40" height="65" rx="14" fill="url(#gradBeta)"/><g data-eye="1" transform="translate(8,-42)"><circle cx="0" cy="0" r="4" fill="#111"/></g></g>';
    bp.parts.push({
      id: 'scarfTail',
      category: 'cloth',
      size: [48, 24],
      pivot: [40, 12],
      anchors: { tip: [6, 12] },
      svg: '<path d="M0 -5 C-12 -3 -24 0 -34 4 C-24 8 -12 7 0 5 Z" fill="#f97316"/>',
    });
    bp.rigs[0].bones.push({
      id: 'scarf',
      parent: 'root',
      attach: 'scarf',
      part: 'scarfTail',
      limits: { min: -45, max: 45 },
      rest: 0,
      z: 1,
      followThrough: { lag: 0.15, velGain: 0.22 },
    });
    bp.rigs[0].blink = { period: 3.0, duration: 0.2, phase: 0 };

    bp.motions = [
      {
        id: 'walk',
        name: 'Procedural Walk',
        type: 'cycle',
        period: 4,
        phases: [
          {
            from: 0,
            to: 1,
            label: 'Walk Stride',
            rigs: {
              actor: {
                rootX: [320, 560],
                rootY: [360, 360],
                gait: {
                  freq: 1.0,
                  stride: 36,
                  lift: 18,
                  bob: 6,
                  stanceFrac: 0.6,
                  chains: [{ ik: 'arm', phase: 0.0, footBone: 'hand', toeOff: 10 }],
                },
              },
            },
          },
        ],
      },
    ];

    const bpPath = join(workDir, 'v3-living-motion.json');
    const htmlPath = join(workDir, 'v3-living-motion.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `living motion compile failed: ${c.stdout}`);

    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll, rigStates, state };`, ctx);
    const { evalMotion, renderAll, rigStates, state } = ctx.__TEST__;
    state.preset = 'walk';

    // 1) Verify 2x vertical bob during gait (rootY at t=0.25 must bob up vs t=0.0)
    evalMotion(0.0);
    const yAtContact = rigStates.actor.rootY;
    evalMotion(0.25); // sin(2*pi*0.25) = 1 -> peak bob lift!
    const yAtMidStance = rigStates.actor.rootY;
    assert.ok(yAtContact - yAtMidStance >= 4.5, `expected >= 4.5px vertical gait bob, got contact=${yAtContact}, mid=${yAtMidStance}`);

    // 2) Verify IK gait bends lower limb differently between stance (t=0.2) and swing peak (t=0.8)
    evalMotion(0.2);
    const elbowStance = rigStates.actor.angles['arm.l'];
    evalMotion(0.8);
    const elbowSwing = rigStates.actor.angles['arm.l'];
    assert.ok(Math.abs(elbowSwing - elbowStance) > 3, `expected IK gait knee/elbow bend change between stance (${elbowStance}) and swing (${elbowSwing})`);

    // 3) Verify stateless followThrough trails scarf angle when moving right and is 100% order-independent
    evalMotion(1.8);
    const scarfForwardPass1 = rigStates.actor.angles.scarf;
    assert.ok(Math.abs(scarfForwardPass1) > 1.5, `expected followThrough inertia on scarf while moving, got ${scarfForwardPass1}`);
    evalMotion(0.1);
    evalMotion(3.7);
    evalMotion(1.8);
    const scarfForwardPass2 = rigStates.actor.angles.scarf;
    assert.equal(scarfForwardPass1, scarfForwardPass2, 'followThrough must be 100% stateless and order-independent');

    // 4) Verify deterministic eye blink scales eyelid closed during blink window (t=0.08) and open outside (t=1.2)
    evalMotion(0.08);
    renderAll(0.08, 0, 0);
    const closedHtml = stub.document.getElementById('layerHeroes').innerHTML;
    evalMotion(1.2);
    renderAll(1.2, 0, 0);
    const openHtml = stub.document.getElementById('layerHeroes').innerHTML;
    assert.notEqual(closedHtml, openHtml, 'expected deterministic eye blink to animate data-eye element between blink and open frames');
  });

  test('Batch 2.8 v3 Scene Craft (MIT-adapted fbm ridges + shadow facets + asymmetric storyTree + windingPath): deterministic and SVG-guard clean', () => {
    const sceneCraftPath = join(__dirname, 'lib', 'scene-craft.mjs');
    assert.ok(existsSync(sceneCraftPath), 'scene-craft.mjs must exist');
    const res = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
        import { terrainRidgeLayer, storyTree, foliageSpray, windingPath } from ${JSON.stringify(sceneCraftPath)};
        import { scanSvgFragment, extractDefIds, getBuiltinViewerDefs } from ${JSON.stringify(join(__dirname, 'lib', 'svg-guard.mjs'))};
        const r1 = terrainRidgeLayer({ width: 960, height: 540, baseY: 320, amplitude: 55, seed: 101, fill: '#4a6b82', shadowFill: '#2c4659', lightAngleDeg: 135 });
        const r2 = terrainRidgeLayer({ width: 960, height: 540, baseY: 320, amplitude: 55, seed: 101, fill: '#4a6b82', shadowFill: '#2c4659', lightAngleDeg: 135 });
        assert.equal(r1.svg, r2.svg, 'terrainRidgeLayer must be deterministic');
        assert.ok(r1.shadowBandCount >= 1, 'terrainRidgeLayer should emit directional pseudo-3D shadow facets');
        const tPine = storyTree({ idPrefix: 'tp1', species: 'pine', x: 200, y: 400, height: 210, seed: 55, snow: true });
        const tOak = storyTree({ idPrefix: 'to1', species: 'oak', x: 500, y: 410, height: 190, seed: 77 });
        const spray = foliageSpray({ x: 120, y: 480, count: 7, seed: 33 });
        const road = windingPath({ points: [[480, 405], [440, 455], [360, 540]], widthStart: 22, widthEnd: 110, fill: '#e6d2b5', bankFill: '#bfa582' });
        const allDefs = (r1.defsSvg ?? '') + (tPine.defsSvg ?? '') + (tOak.defsSvg ?? '');
        const known = new Set([...getBuiltinViewerDefs({}), ...extractDefIds(allDefs)]);
        const errs = [];
        scanSvgFragment(\`<g>\${allDefs}\${r1.svg}\${tPine.svg}\${tOak.svg}\${spray}\${road}</g>\`, 'scene-craft', (c,w,d) => errs.push({c,w,d}), { knownDefIds: known, checkDefRefs: true });
        assert.equal(errs.length, 0, 'scene-craft emitted invalid SVG: ' + JSON.stringify(errs));
        console.log('SCENE_CRAFT_OK');`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `scene-craft test failed: ${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('SCENE_CRAFT_OK'));
  });

  test('Batch 2.8 v3 render_audit motion_sheet: writes 6-frame motion_sheet.html for anti-stiffness review', () => {
    const AUDIT_SCRIPT = join(__dirname, 'render_audit.mjs');
    const bp = makeBlueprintA();
    const bpPath = join(workDir, 'v3-ms.json');
    const htmlPath = join(workDir, 'v3-ms.html');
    const auditOut = join(workDir, 'v3-ms-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);
    const a = runNode(AUDIT_SCRIPT, ['--html', htmlPath, '--spec', bpPath, '--out', auditOut, '--no-chrome']);
    assert.equal(a.status, 0, `render_audit failed: ${a.stderr}\n${a.stdout}`);
    assert.ok(existsSync(join(auditOut, 'motion_sheet.html')), 'motion_sheet.html must be generated for 6-phase stride/motion inspection');
  });

  test('v4.0 Style Grammar Packs: 4 styles exist with STYLE.md + preset.json, merge defaults cleanly, and unknown style fails closed (BP_STYLE_UNKNOWN)', () => {
    const styleSlugs = ['storybook-gouache', 'paper-lightbox', 'paper-popup', 'shadow-craft'];
    for (const slug of styleSlugs) {
      assert.ok(existsSync(join(SKILL_DIR, 'styles', slug, 'STYLE.md')), `missing styles/${slug}/STYLE.md`);
      assert.ok(existsSync(join(SKILL_DIR, 'styles', slug, 'preset.json')), `missing styles/${slug}/preset.json`);
    }

    const bp = makeBlueprintB();
    bp.style = 'paper-popup';
    const bpPath = join(workDir, 'v4-style-popup.json');
    const htmlPath = join(workDir, 'v4-style-popup.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `style preset compile failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"style":"paper-popup"'), 'compiled HTML must preserve resolved style');

    const badBp = makeBlueprintB();
    badBp.style = 'nonexistent-neon-style';
    const badPath = join(workDir, 'v4-style-bad.json');
    writeFileSync(badPath, JSON.stringify(badBp));
    const cBad = runNode(COMPILE_SCRIPT, ['--spec', badPath, '--check']);
    assert.equal(cBad.status, 1, 'unknown style must fail closed');
    assert.ok(cBad.json?.errors?.some((e) => e.code === 'BP_STYLE_UNKNOWN'), `expected BP_STYLE_UNKNOWN, got ${cBad.stdout}`);
  });

  test('v4.0 Cut-Paper Optics: cutoutBorder and backlitPulp sRGB filters render in viewer and auto-embed in standalone pack SVGs', () => {
    const bp = makeBlueprintB();
    bp.style = 'paper-popup';
    bp.parts[0].svg = '<g filter="url(#cutoutBorder)"><path d="M-20 -58 C-10 -64 10 -64 20 -58 L20 4 C10 8 -10 8 -20 4 Z" fill="url(#gradBeta)"/><path d="M-16 -52 L-16 0" stroke="#fff" stroke-width="1.2"/></g>';
    bp.parts[1].svg = '<g filter="url(#backlitPulp)"><path d="M-6 -4 C-6 -8 6 -8 6 -4 L5 36 C2 39 -2 39 -5 36 Z" fill="#0ea5e9"/><path d="M-2 0 L-2 32" stroke="#fff" stroke-width="1"/></g>';
    const bpPath = join(workDir, 'v4-optics.json');
    const packDir = join(workDir, 'v4-optics-pack');
    const htmlPath = join(workDir, 'v4-optics.html');
    writeFileSync(bpPath, JSON.stringify(bp));

    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `optics compile failed: ${c.stdout}`);
    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `optics validate_pack failed: ${v.stdout}`);

    const torsoSvg = readFileSync(join(packDir, 'body', 'torso.svg'), 'utf8');
    const armSvg = readFileSync(join(packDir, 'limb', 'armUpper.svg'), 'utf8');
    assert.ok(torsoSvg.includes('id="cutoutBorder"') && torsoSvg.includes('color-interpolation-filters="sRGB"'), 'cutoutBorder sRGB filter not embedded in pack SVG');
    assert.ok(armSvg.includes('id="backlitPulp"') && armSvg.includes('color-interpolation-filters="sRGB"'), 'backlitPulp sRGB filter not embedded in pack SVG');

    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll };`, ctx);
    const defsHtml = stub.document.getElementById('svgDefs').innerHTML;
    assert.ok(defsHtml.includes('id="cutoutBorder"'), 'missing cutoutBorder in viewer svgDefs');
    assert.ok(defsHtml.includes('id="backlitPulp"'), 'missing backlitPulp in viewer svgDefs');
  });

  test('v4.0 Living Motion: 12fps stepped cadence, deterministic tremor, multi-link strands[], and fail-closed strand validation', () => {
    const bp = makeBlueprintB();
    bp.scene.cadence = { charFps: 12 };
    bp.rigs[0].tremor = { ampX: 1.4, ampY: 1.0, ampDeg: 0.8 };
    bp.rigs[0].strands = [
      {
        id: 'ribbon_tail',
        bone: 'root',
        anchor: 'shoulder',
        z: 2.5,
        segments: 5,
        length: 48,
        dirDeg: 170,
        widthStart: 9,
        widthEnd: 2.5,
        fill: '#f59e0b',
        stripeColor: '#fffbeb',
        waveAmp: 8,
        waveFreq: 3.2,
      },
    ];
    bp.motions = [
      {
        id: 'walk',
        name: 'Stepped Walk',
        type: 'cycle',
        period: 4,
        phases: [
          {
            from: 0,
            to: 1,
            label: 'Walk',
            rigs: { actor: { rootX: [240, 560], rootY: [360, 360] } },
          },
        ],
      },
    ];
    const bpPath = join(workDir, 'v4-motion.json');
    const htmlPath = join(workDir, 'v4-motion.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `v4 motion compile failed: ${c.stdout}`);

    const html = readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const stub = createDomStub();
    const ctx = vm.createContext(stub);
    vm.runInContext(`${match[1]}\nthis.__TEST__ = { evalMotion, renderAll, rigStates, state };`, ctx);
    const { evalMotion, renderAll, rigStates, state } = ctx.__TEST__;
    state.preset = 'walk';

    // Within the same 1/12s step (t=1.01 vs t=1.05 -> floor(t*12)/12 === 1.0), stepped character rootX must match exactly!
    evalMotion(1.01);
    const xA = rigStates.actor.rootX;
    evalMotion(1.05);
    const xB = rigStates.actor.rootX;
    assert.equal(xA, xB, `expected 12fps stepped cadence to hold pose across same step (xA=${xA}, xB=${xB})`);
    // Across steps (t=1.01 vs t=1.26), character advances cleanly
    evalMotion(1.26);
    const xC = rigStates.actor.rootX;
    assert.ok(xC > xA + 5, `expected character to advance on next 12fps step (xA=${xA}, xC=${xC})`);

    // Render strand & verify data-strand attribute + deterministic output
    renderAll(1.26, 0, 0);
    const heroes1 = stub.document.getElementById('layerHeroes').innerHTML;
    assert.ok(heroes1.includes('data-strand="ribbon_tail"'), 'missing multi-link strand SVG output');
    evalMotion(0.1);
    evalMotion(1.26);
    renderAll(1.26, 0, 0);
    const heroes2 = stub.document.getElementById('layerHeroes').innerHTML;
    assert.equal(heroes1, heroes2, 'cadence + tremor + strands must be 100% deterministic and order-independent');

    // Negative: bad bone or unsafe fill on strands[] fails closed
    const badBp = makeBlueprintB();
    badBp.rigs[0].strands = [{ id: 'bad', bone: 'ghost_bone', anchor: 'shoulder', fill: '#fff' }];
    const badPath = join(workDir, 'v4-bad-strand.json');
    writeFileSync(badPath, JSON.stringify(badBp));
    const cBad = runNode(COMPILE_SCRIPT, ['--spec', badPath, '--check']);
    assert.equal(cBad.status, 1);
    assert.ok(cBad.json?.errors?.some((e) => e.code === 'BP_RIG_INVALID'), `expected BP_RIG_INVALID for unknown strand bone, got ${cBad.stdout}`);
  });

  test('v4.0 Craft & Scene Primitives: wobblyPath, crescentShadePath, and openworkCutout are deterministic and SVG-guard clean', () => {
    const res = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
        import { wobblyPath, crescentShadePath, openworkCutout } from ${JSON.stringify(join(__dirname, 'lib', 'scene-craft.mjs'))};
        import { scanSvgFragment, extractDefIds, getBuiltinViewerDefs } from ${JSON.stringify(join(__dirname, 'lib', 'svg-guard.mjs'))};
        const w1 = wobblyPath([[0,0],[40,0],[40,40],[0,40]], { closed: true, amp: 2.2, seed: 19 });
        const w2 = wobblyPath([[0,0],[40,0],[40,40],[0,40]], { closed: true, amp: 2.2, seed: 19 });
        assert.equal(w1, w2, 'wobblyPath must be deterministic');
        assert.ok(w1.includes('Q') && w1.endsWith('Z'), 'wobblyPath should emit curved closed path');
        const c = crescentShadePath({ idPrefix: 'cr1', pathD: w1, baseFill: '#f4a261', shadeFill: '#c86d3b', dx: 6, dy: 4 });
        assert.ok(c.defsSvg.includes('clipPath') && c.svg.includes('clip-path'), 'crescentShadePath must emit clipped crescent shade');
        const ow = openworkCutout({ outerD: 'M-20 -20 H20 V20 H-20 Z', holes: ['M-8 -8 H8 V8 H-8 Z'], fill: '#b91c1c' });
        assert.ok(ow.includes('fill-rule="evenodd"'), 'openworkCutout must use evenodd fill-rule');
        const known = new Set([...getBuiltinViewerDefs({}), ...extractDefIds(c.defsSvg)]);
        const errs = [];
        scanSvgFragment(\`<g>\${c.defsSvg}\${c.svg}\${ow}</g>\`, 'v4-prims', (cd,w,d) => errs.push({cd,w,d}), { knownDefIds: known, checkDefRefs: true });
        assert.equal(errs.length, 0, 'v4 primitives emitted unsafe SVG: ' + JSON.stringify(errs));
        console.log('V4_PRIMS_OK');`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `v4 primitives test failed: ${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('V4_PRIMS_OK'));
  });

  test('v4.0 Private Craft Library: assets/library/ has index.json + >=32 validated components across 5 families and supports --library-dir override', () => {
    const libIndexPath = join(SKILL_DIR, 'assets', 'library', 'index.json');
    assert.ok(existsSync(libIndexPath), 'assets/library/index.json must exist');
    const res = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
        import { readFileSync } from 'node:fs';
        import { loadKitCatalog, expandKitMacrosInString } from ${JSON.stringify(join(__dirname, 'lib', 'kit-resolver.mjs'))};
        import { scanSvgFragment, getBuiltinPartDefs } from ${JSON.stringify(join(__dirname, 'lib', 'svg-guard.mjs'))};
        import { analyzeSvgCraft } from ${JSON.stringify(join(__dirname, 'lib', 'craft-audit.mjs'))};
        const idx = JSON.parse(readFileSync(${JSON.stringify(libIndexPath)}, 'utf8'));
        assert.ok(Array.isArray(idx.components) && idx.components.length >= 32, 'expected >= 32 curated components in assets/library/index.json, got ' + idx.components?.length);
        const fams = new Set(idx.components.map((c) => c.family));
        for (const req of ['anatomy', 'garments', 'botanicals', 'props', 'frames']) {
          assert.ok(fams.has(req), 'missing library family: ' + req);
        }
        const errs = [];
        const cat = loadKitCatalog([], (c,w,d) => errs.push({c,w,d}));
        assert.equal(errs.length, 0, 'library load errors: ' + JSON.stringify(errs));
        assert.ok(cat.size >= 32, 'expected >= 32 total catalog components, got ' + cat.size);
        const defs = getBuiltinPartDefs({});
        for (const [id] of cat.entries()) {
          const rendered = expandKitMacrosInString(\`{{KIT:\${id}}}\`, cat, id, (c,w,d) => errs.push({c,w,d}));
          scanSvgFragment(rendered, id, (c,w,d) => errs.push({c,w,d}), { knownDefIds: defs, checkDefRefs: true });
          const sc = analyzeSvgCraft(rendered, id);
          assert.ok(sc.totalPrimitives >= 3, \`library component \${id} too simple (\${sc.totalPrimitives} primitives)\`);
        }
        assert.equal(errs.length, 0, 'library validation errors: ' + JSON.stringify(errs));
        console.log('LIB_OK:' + cat.size);`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `library catalog test failed: ${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('LIB_OK:'));

    // Test --library-dir override on compile_rig_studio.mjs
    const customLibDir = join(workDir, 'custom-user-lib');
    writeFileSync(join(workDir, 'dummy'), ''); // ensure workDir exists
    const bp = makeBlueprintB();
    bp.parts[0].kitRef = { id: 'custom-star-prop', tokens: { FILL: '#fbbf24' } };
    delete bp.parts[0].svg;
    const customJsonDir = join(customLibDir, 'props');
    spawnSync(process.execPath, ['-e', `import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync(${JSON.stringify(customJsonDir)}, { recursive: true }); writeFileSync(${JSON.stringify(join(customJsonDir, 'custom-star-prop.json'))}, JSON.stringify({ id: 'custom-star-prop', category: 'body', size: [80, 100], pivot: [40, 80], anchors: { shoulder: [52, 24] }, tokens: { FILL: '#f59e0b' }, svg: '<g filter="url(#paperBevel)"><path d="M-18 -54 C-6 -62 6 -62 18 -54 L18 2 C6 8 -6 8 -18 2 Z" fill="{{FILL}}"/><path d="M-10 -46 Q0 -50 10 -46" stroke="#fff" stroke-width="1.2" fill="none"/><circle cx="0" cy="-26" r="6" fill="#fff"/></g>' }));`]);
    const bpPath = join(workDir, 'v4-custom-lib.json');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--library-dir', customLibDir, '--check']);
    assert.equal(c.status, 0, `--library-dir override failed: ${c.stdout}`);
  });

  test('v4.0 library_cli.mjs: list, contact-sheet, and safe/fail-closed import --svg', () => {
    const LIB_CLI = join(__dirname, 'library_cli.mjs');
    assert.ok(existsSync(LIB_CLI), 'scripts/library_cli.mjs must exist');

    const ls = runNode(LIB_CLI, ['list', '--json']);
    assert.equal(ls.status, 0, `library_cli list failed: ${ls.stderr}\n${ls.stdout}`);
    assert.ok(ls.json && ls.json.count >= 32, `expected >= 32 listed components, got ${ls.stdout}`);

    const sheetOut = join(workDir, 'lib-sheet');
    const cs = runNode(LIB_CLI, ['contact-sheet', '--out', sheetOut, '--no-chrome']);
    assert.equal(cs.status, 0, `library_cli contact-sheet failed: ${cs.stderr}\n${cs.stdout}`);
    assert.ok(existsSync(join(sheetOut, 'library_contact_sheet.html')), 'contact-sheet must emit library_contact_sheet.html');

    // Safe SVG import
    const rawSvgPath = join(workDir, 'artist_hat.svg');
    writeFileSync(
      rawSvgPath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><path d="M8 32 C12 12 48 12 52 32 Z" fill="#8b5a2b"/><path d="M4 32 Q30 26 56 32 Q30 37 4 32 Z" fill="#5c3a1e"/><path d="M14 24 Q30 18 46 24" stroke="#f5deb3" stroke-width="1.5" fill="none"/></svg>',
    );
    const userLibOut = join(workDir, 'imported-lib');
    const imp = runNode(LIB_CLI, ['import', '--svg', rawSvgPath, '--id', 'artist-hat', '--family', 'garments', '--category', 'head', '--out-dir', userLibOut]);
    assert.equal(imp.status, 0, `library_cli import failed: ${imp.stderr}\n${imp.stdout}`);
    assert.ok(existsSync(join(userLibOut, 'garments', 'artist-hat.json')), 'imported component JSON must be written');

    // Unsafe SVG import must fail closed
    const evilSvgPath = join(workDir, 'evil.svg');
    writeFileSync(evilSvgPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><script>alert(1)</script><circle cx="20" cy="20" r="10" fill="#f00"/></svg>');
    const impBad = runNode(LIB_CLI, ['import', '--svg', evilSvgPath, '--id', 'evil-prop', '--family', 'props', '--out-dir', userLibOut]);
    assert.equal(impBad.status, 1, 'unsafe SVG import must fail closed');
    assert.equal(existsSync(join(userLibOut, 'props', 'evil-prop.json')), false, 'must not write unsafe imported asset');
  });

  test('v4.0 Prove-the-Look Model Sheet: render_audit emits modelsheet_<rigId>.html with 4 inspection views', () => {
    const AUDIT_SCRIPT = join(__dirname, 'render_audit.mjs');
    const bp = makeBlueprintB();
    const bpPath = join(workDir, 'v4-modelsheet.json');
    const htmlPath = join(workDir, 'v4-modelsheet.html');
    const auditOut = join(workDir, 'v4-modelsheet-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);
    const a = runNode(AUDIT_SCRIPT, ['--html', htmlPath, '--spec', bpPath, '--out', auditOut, '--no-chrome']);
    assert.equal(a.status, 0, `render_audit failed: ${a.stderr}\n${a.stdout}`);
    const msPath = join(auditOut, 'modelsheet_actor.html');
    assert.ok(existsSync(msPath), 'modelsheet_actor.html must be generated for every rig');
    const msHtml = readFileSync(msPath, 'utf8');
    assert.ok(msHtml.includes('rest=1') && msHtml.includes('silhouette=1') && msHtml.includes('cropRig=actor'), 'modelsheet HTML must embed Rest, Posed, Variant/Bones, and Silhouette views');
  });

  // =========================================================================
  // v5.0 TDD SUITE — Cinema-Grade 3D Sculpted & Backlit Three.js Engine
  // =========================================================================
  function makeSculpted3dBlueprint(styleSlug = 'shadowbox-moonlit') {
    const bp = makeBlueprintB();
    bp.style = styleSlug;
    bp.meta.packId = `test-3d-${styleSlug}`;
    bp.meta.title = `3D Sculpted Test (${styleSlug})`;
    bp.scene.layers3d = [
      {
        id: 'mountain_back',
        kind: 'folded_ridge',
        foldStyle: 'pleated',
        z: -2.4,
        baseY: -4.5,
        color: '#233b5e',
        edgeColor: '#8eb2de',
        pleats: 16,
        peaks: [[-1.8, 2.1, 0.65, 3.2], [2.1, 1.7, 0.58, 3.0]],
      },
      {
        id: 'cliff_mid',
        kind: 'folded_ridge',
        foldStyle: 'tiered_cliff_slabs',
        z: -1.2,
        baseY: -4.5,
        color: '#1e3554',
        edgeColor: '#9ec0e6',
        slabs: [
          { x: -2.2, y: -1.4, w: 3.4, h: 1.8, zStep: 0.16 },
          { x: 1.8, y: -1.6, w: 3.1, h: 1.6, zStep: 0.14 },
        ],
      },
      {
        id: 'lotus_fg',
        kind: 'cupped_petals',
        x: -3.2,
        y: -2.2,
        z: 0.85,
        color: '#f2dcb3',
        edgeColor: '#ffffff',
      },
    ];
    bp.parts[0].cardstock = { thickness: 0.11, bevel: 0.018, edgeColor: '#fff8ea', translucency: 0.28 };
    return bp;
  }

  test('v5.0 Style Presets: 4 new 3D presets exist and default to sculpted3d while v4 presets stay svg2d', () => {
    for (const slug of ['shadowbox-moonlit', 'lightbox-led', 'daylight-sculpted', 'winter-tunnel']) {
      const pFile = join(SKILL_DIR, 'styles', slug, 'preset.json');
      const sDoc = join(SKILL_DIR, 'styles', slug, 'STYLE.md');
      assert.ok(existsSync(pFile), `missing 3D style preset: ${pFile}`);
      assert.ok(existsSync(sDoc), `missing 3D style guide: ${sDoc}`);
      const preset = JSON.parse(readFileSync(pFile, 'utf8'));
      assert.equal(preset.sceneDefaults?.renderMode, 'sculpted3d', `${slug} must default to renderMode=sculpted3d`);
      assert.ok(preset.sceneDefaults?.boxCavity, `${slug} must define default boxCavity`);
      assert.ok(preset.sceneDefaults?.lighting3d, `${slug} must define default lighting3d`);
    }
    for (const legacy of ['storybook-gouache', 'paper-lightbox', 'paper-popup', 'shadow-craft']) {
      const preset = JSON.parse(readFileSync(join(SKILL_DIR, 'styles', legacy, 'preset.json'), 'utf8'));
      assert.notEqual(preset.sceneDefaults?.renderMode, 'sculpted3d', `legacy style ${legacy} must remain svg2d compatible`);
    }
  });

  test('v5.0 Vendor Bundle: three-sculpted.bundle.min.js + .sha256 exist and lock deterministic GTAO', () => {
    const bundlePath = join(SKILL_DIR, 'assets', 'vendor', 'three-sculpted.bundle.min.js');
    const shaPath = join(SKILL_DIR, 'assets', 'vendor', 'three-sculpted.bundle.sha256');
    assert.ok(existsSync(bundlePath), 'assets/vendor/three-sculpted.bundle.min.js must exist');
    assert.ok(existsSync(shaPath), 'assets/vendor/three-sculpted.bundle.sha256 must exist');
    const raw = readFileSync(bundlePath);
    const actualSha = createHash('sha256').update(raw).digest('hex');
    const expectedSha = readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0];
    assert.equal(actualSha, expectedSha, 'vendor bundle SHA-256 mismatch');
    const txt = raw.toString('utf8');
    assert.ok(txt.includes('createDeterministicGTAOPass'), 'vendor bundle must export createDeterministicGTAOPass');
  });

  test('v5.0 Engine Safety Guards: sculpted-paper-engine.js has zero Math.random() and zero negative scale.y', () => {
    const engPath = join(SKILL_DIR, 'assets', 'sculpted-paper-engine.js');
    const shell3dPath = join(SKILL_DIR, 'assets', 'viewer-shell-3d.html');
    assert.ok(existsSync(engPath), 'assets/sculpted-paper-engine.js must exist');
    assert.ok(existsSync(shell3dPath), 'assets/viewer-shell-3d.html must exist');
    const engSrc = readFileSync(engPath, 'utf8');
    assert.equal(/\bMath\.random\s*\(/.test(engSrc), false, 'sculpted-paper-engine.js must not call Math.random()');
    assert.equal(/\.scale\.y\s*=\s*-1\b/.test(engSrc), false, 'sculpted-paper-engine.js must not invert normals via scale.y = -1');
  });

  test('v5.0 Blueprint Validation: rejects invalid renderMode, invalid layers3d, and invalid part.cardstock', () => {
    const bpBadMode = makeBlueprintB();
    bpBadMode.scene.renderMode = 'unreal5';
    const p1 = join(workDir, 'v5-bad-mode.json');
    writeFileSync(p1, JSON.stringify(bpBadMode));
    const r1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(r1.status, 1);
    assert.ok(r1.json?.errors?.some((e) => e.code === 'BP_SCHEMA' && e.where.includes('renderMode')));

    const bpBadLayer = makeSculpted3dBlueprint();
    bpBadLayer.scene.layers3d.push({ id: 'broken_layer', kind: 'unknown_3d_kind', z: -1 });
    const p2 = join(workDir, 'v5-bad-layer3d.json');
    writeFileSync(p2, JSON.stringify(bpBadLayer));
    const r2 = runNode(COMPILE_SCRIPT, ['--spec', p2, '--check']);
    assert.equal(r2.status, 1);
    assert.ok(r2.json?.errors?.some((e) => e.code === 'BP_SCENE3D_INVALID'));

    const bpBadCard = makeSculpted3dBlueprint();
    bpBadCard.parts[0].cardstock = { thickness: -0.5 };
    const p3 = join(workDir, 'v5-bad-cardstock.json');
    writeFileSync(p3, JSON.stringify(bpBadCard));
    const r3 = runNode(COMPILE_SCRIPT, ['--spec', p3, '--check']);
    assert.equal(r3.status, 1);
    assert.ok(r3.json?.errors?.some((e) => e.code === 'BP_CARDSTOCK_INVALID'));
  });

  test('v5.0 Pack Compilation & Validation (sculpted3d): emits scene3d.json + cardstock with verified SHA-256', () => {
    const bp = makeSculpted3dBlueprint('shadowbox-moonlit');
    const bpPath = join(workDir, 'v5-pack-ok.json');
    const packDir = join(workDir, 'v5-pack-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir]);
    assert.equal(c.status, 0, `compile sculpted3d pack failed: ${c.stdout}\n${c.stderr}`);

    const scene3dPath = join(packDir, 'scene3d.json');
    assert.ok(existsSync(scene3dPath), 'sculpted3d pack must emit scene3d.json');
    const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
    assert.ok(manifest.scene3d && manifest.scene3d.file === 'scene3d.json' && manifest.scene3d.sha256, 'manifest.json must record scene3d file + sha256');
    const partEntry = manifest.assets.find((a) => a.id === bp.parts[0].id);
    assert.ok(partEntry?.cardstock && partEntry.cardstock.thickness === 0.11, 'manifest asset must preserve cardstock metadata');

    const v = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(v.status, 0, `validate_pack failed on sculpted3d pack: ${v.stdout}`);
  });

  test('v5.0 Pack Validator Fail-Closed: detects tampered or missing scene3d.json', () => {
    const bp = makeSculpted3dBlueprint('daylight-sculpted');
    const bpPath = join(workDir, 'v5-tamper.json');
    const packDir = join(workDir, 'v5-tamper-pack');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir]).status, 0);

    // Tamper scene3d.json
    const s3dFile = join(packDir, 'scene3d.json');
    writeFileSync(s3dFile, readFileSync(s3dFile, 'utf8') + '\n ');
    const vTamper = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(vTamper.status, 1, 'tampered scene3d.json must fail closed');
    assert.ok(vTamper.json?.errors?.some((e) => e.code === 'SCENE3D_SHA_MISMATCH'));

    // Delete scene3d.json
    rmSync(s3dFile);
    const vMissing = runNode(VALIDATE_SCRIPT, [packDir]);
    assert.equal(vMissing.status, 1, 'missing scene3d.json must fail closed');
    assert.ok(vMissing.json?.errors?.some((e) => e.code === 'SCENE3D_MISSING'));
  });

  test('v5.0 Standalone Offline 3D Studio HTML: zero external CDN links, embeds engine & blueprint', () => {
    const bp = makeSculpted3dBlueprint('lightbox-led');
    const bpPath = join(workDir, 'v5-html.json');
    const htmlPath = join(workDir, 'v5-studio3d.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `compile 3D HTML failed: ${c.stdout}`);
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('data-render-mode="sculpted3d"'), '3D HTML must declare data-render-mode="sculpted3d"');
    assert.equal(/https?:\/\/(cdn|unpkg|jsdelivr)/i.test(html), false, '3D HTML must be 100% offline with zero external CDN URLs');
  });

  test('v5.0 Dual-Path Library + Hoses + Strands + IK Gait Compatibility in sculpted3d', () => {
    const bp = makeSculpted3dBlueprint('winter-tunnel');
    bp.parts.push({
      id: 'libProfileHead',
      category: 'head',
      kitRef: { id: 'head-profile-storybook', tokens: { SKIN: '#f7d8bf', HAIR_MAIN: '#3b2318' } },
    });
    bp.rigs[0].bones[1].part = 'libProfileHead';
    bp.rigs[0].strands = [
      { id: 'scarf3d', bone: bp.rigs[0].bones[0].id, z: 3, segments: 5, length: 42, widthStart: 9, widthEnd: 3, fill: '#d6453d', rimColor: '#ffdad6' },
    ];
    const bpPath = join(workDir, 'v5-dualpath.json');
    const htmlPath = join(workDir, 'v5-dualpath.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]);
    assert.equal(c.status, 0, `dual-path library + strands 3D compile failed: ${c.stdout}`);
  });

  test('v5.0 Multi-Character & Multi-Variant Reusability (>= 2 rigs, >= 2 variants) in sculpted3d', () => {
    const bp = makeBlueprintA();
    bp.style = 'shadowbox-moonlit';
    bp.parts[1].variants = undefined;
    bp.parts.push({
      id: 'headA_alt',
      category: 'head',
      size: [60, 60],
      pivot: [20, 30],
      anchors: {},
      svg: '<path d="M-12 -10 C-10 -22 12 -22 18 -10 C22 2 12 14 -4 12 Z" fill="#f4a261"/><circle cx="6" cy="-4" r="2.5" fill="#1d3557"/>',
    });
    bp.rigs[0].bones[1].variants = { alt: 'headA_alt' };
    bp.rigs[0].variants = { head: ['default', 'alt'] };
    const bpPath = join(workDir, 'v5-multirig.json');
    const packDir = join(workDir, 'v5-multirig-pack');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir]);
    assert.equal(c.status, 0, `multi-rig sculpted3d compile failed: ${c.stdout}`);
    assert.equal(runNode(VALIDATE_SCRIPT, [packDir]).status, 0);
  });

  test('v5.0 Single-Context Audit (--no-chrome): render_audit detects sculpted3d mode and configures 3D audit gates', () => {
    const AUDIT_SCRIPT = join(__dirname, 'render_audit.mjs');
    const bp = makeSculpted3dBlueprint('shadowbox-moonlit');
    const bpPath = join(workDir, 'v5-audit-nochrome.json');
    const htmlPath = join(workDir, 'v5-audit-nochrome.html');
    const auditOut = join(workDir, 'v5-audit-nochrome-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);
    const a = runNode(AUDIT_SCRIPT, ['--html', htmlPath, '--spec', bpPath, '--out', auditOut, '--no-chrome']);
    assert.equal(a.status, 0, `3D render_audit --no-chrome failed: ${a.stderr}\n${a.stdout}`);
    assert.equal(a.json?.renderMode, 'sculpted3d', 'audit report must detect renderMode=sculpted3d');
  });

  test('v5.0 WebGL2 Live Render & Bit-Exact Determinism Gate (Chrome Headless)', () => {
    const AUDIT_SCRIPT = join(__dirname, 'render_audit.mjs');
    const bp = makeSculpted3dBlueprint('shadowbox-moonlit');
    const bpPath = join(workDir, 'v5-audit-live.json');
    const htmlPath = join(workDir, 'v5-audit-live.html');
    const auditOut = join(workDir, 'v5-audit-live-out');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);
    const a = runNode(AUDIT_SCRIPT, ['--html', htmlPath, '--spec', bpPath, '--out', auditOut]);
    assert.equal(a.status, 0, `3D live WebGL2 render_audit failed: ${a.stderr}\n${a.stdout}`);
    assert.equal(a.json?.determinismCheck?.status, 'PASS', `expected determinismCheck PASS, got ${JSON.stringify(a.json?.determinismCheck)}`);
    assert.ok(existsSync(join(auditOut, 'frame_oblique_3d.png')), '3D audit must emit frame_oblique_3d.png');
    assert.ok(existsSync(join(auditOut, 'frame_exploded_z.png')), '3D audit must emit frame_exploded_z.png');
    assert.ok(existsSync(join(auditOut, 'motion_sheet.png')), '3D audit must emit motion_sheet.png');
    assert.ok(existsSync(join(auditOut, 'modelsheet_actor.png')), '3D audit must emit modelsheet_<rigId>.png');
  });

  test('v5.0 Legacy Backward Compatibility: blueprints without renderMode still emit svg2d HTML', () => {
    const bp = makeBlueprintB();
    const bpPath = join(workDir, 'v5-legacy-svg2d.json');
    const htmlPath = join(workDir, 'v5-legacy-svg2d.html');
    writeFileSync(bpPath, JSON.stringify(bp));
    assert.equal(runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-html', htmlPath]).status, 0);
    const html = readFileSync(htmlPath, 'utf8');
    assert.equal(html.includes('data-render-mode="sculpted3d"'), false, 'legacy blueprint must remain svg2d');
    assert.ok(html.includes('id="sceneSvg"'), 'legacy blueprint must use SVG viewer-shell.html');
  });

  // =========================================================================
  // v5.1 Step 2 TDD SUITE — Standardized 2D/3D/PBR/Cutout Library & Direct ID Refs
  // =========================================================================
  test('v5.1 Material & Relief Library Catalog: index.json registers >=4 PBR materials and >=5 3D relief presets with valid SHA-256', () => {
    const libDir = join(SKILL_DIR, 'assets', 'library');
    const idx = JSON.parse(readFileSync(join(libDir, 'index.json'), 'utf8'));
    assert.ok(Array.isArray(idx.materials) && idx.materials.length >= 4, 'index.json must declare >= 4 PBR paper materials');
    assert.ok(Array.isArray(idx.reliefs3d) && idx.reliefs3d.length >= 5, 'index.json must declare >= 5 procedural 3D reliefs');
    assert.ok(Array.isArray(idx.cutouts), 'index.json must declare optional cutouts[] array');
    for (const m of idx.materials) {
      const f = join(libDir, m.file);
      assert.ok(existsSync(f), `missing material file ${m.file}`);
      const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
      assert.equal(sha, m.sha256, `material SHA-256 mismatch for ${m.id}`);
    }
    for (const r of idx.reliefs3d) {
      const f = join(libDir, r.file);
      assert.ok(existsSync(f), `missing relief3d file ${r.file}`);
      const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
      assert.equal(sha, r.sha256, `relief3d SHA-256 mismatch for ${r.id}`);
    }
  });

  test('v5.1 library_cli.mjs verify & list --kind: verifies all assets/library, kit, and styles fail-closed', () => {
    const LIB_CLI = join(__dirname, 'library_cli.mjs');
    const vPass = runNode(LIB_CLI, ['verify', '--json']);
    assert.equal(vPass.status, 0, `library_cli verify failed: ${vPass.stdout}\n${vPass.stderr}`);
    assert.equal(vPass.json?.status, 'PASS');

    const listMat = runNode(LIB_CLI, ['list', '--kind', 'pbr-paper', '--json']);
    assert.equal(listMat.status, 0, `list --kind pbr-paper failed: ${listMat.stdout}`);
    assert.ok((listMat.json?.count ?? 0) >= 4, 'must list >= 4 pbr-paper materials');

    const listRel = runNode(LIB_CLI, ['list', '--kind', 'procedural-3d', '--json']);
    assert.equal(listRel.status, 0, `list --kind procedural-3d failed: ${listRel.stdout}`);
    assert.ok((listRel.json?.count ?? 0) >= 5, 'must list >= 5 procedural-3d reliefs');

    // Negative: tampered SHA-256 in custom library index.json must fail closed
    const badLib = join(workDir, 'v51-tampered-lib');
    mkdirSync(join(badLib, 'materials'), { recursive: true });
    const matObj = {
      id: 'custom-paper',
      kind: 'pbr-paper',
      family: 'materials',
      gsm: 300,
      cardstock: { thickness: 0.08, bevel: 0.015, edgeColor: '#f6ebd4', roughness: 0.88, normalScale: 0.65, translucency: 0.25 },
      description: 'Test paper',
    };
    writeFileSync(join(badLib, 'materials', 'custom-paper.json'), JSON.stringify(matObj, null, 2) + '\n');
    writeFileSync(join(badLib, 'index.json'), JSON.stringify({
      schemaVersion: 1,
      version: '5.1.0',
      components: [],
      materials: [{ id: 'custom-paper', kind: 'pbr-paper', family: 'materials', file: 'materials/custom-paper.json', sha256: '0'.repeat(64) }],
      reliefs3d: [],
      cutouts: [],
    }, null, 2));
    const vFail = runNode(LIB_CLI, ['verify', '--library-dir', badLib, '--json']);
    assert.equal(vFail.status, 1, 'tampered SHA-256 must fail closed');
    assert.ok(vFail.json?.errors?.some((e) => e.code === 'LIB_SHA_MISMATCH'), `expected LIB_SHA_MISMATCH, got ${vFail.stdout}`);
  });

  test('v5.1 Blueprint Direct ID Refs (materialRef + reliefRef): pure vector/procedural multi-rig + multi-variant compiles without cutouts', () => {
    const bp = makeBlueprintA();
    bp.style = 'shadowbox-moonlit';
    bp.meta.packId = 'test-v51-refs';
    bp.parts[0].materialRef = 'paper-cotton-300gsm';
    bp.parts[1].materialRef = { id: 'paper-washi-translucent', overrides: { translucency: 0.55 } };
    bp.parts.push({
      id: 'headA_v2',
      category: 'head',
      materialRef: 'paper-kraft-warm',
      size: [60, 60],
      pivot: [20, 30],
      anchors: {},
      svg: '<path d="M-12 -10 C-10 -22 12 -22 18 -10 C22 2 12 14 -4 12 Z" fill="#f4a261"/><circle cx="6" cy="-4" r="2.5" fill="#1d3557"/>',
    });
    bp.rigs[0].bones[1].variants = { alt: 'headA_v2' };
    bp.rigs[0].variants = { head: ['default', 'alt'] };
    bp.scene.layers3d = [
      { id: 'bg_strata', reliefRef: 'strata-mountain-mist', z: -2.4 },
      { id: 'mid_clouds', reliefRef: 'clouds-billowing-canopy', z: -1.4 },
      { id: 'fg_bonsai', reliefRef: 'bonsai-frame-pine', z: 0.6 },
      { id: 'fg_peony', reliefRef: 'peony-botanical-cluster', z: 0.9 },
    ];

    const bpPath = join(workDir, 'v51-refs.json');
    const packDir = join(workDir, 'v51-refs-pack');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir]);
    assert.equal(c.status, 0, `compile with materialRef + reliefRef failed: ${c.stdout}\n${c.stderr}`);

    const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
    const p0 = manifest.assets.find((a) => a.id === bp.parts[0].id);
    const p1 = manifest.assets.find((a) => a.id === bp.parts[1].id);
    assert.equal(p0?.cardstock?.edgeColor, '#f6ebd4', 'materialRef must populate cardstock defaults');
    assert.equal(p1?.cardstock?.translucency, 0.55, 'materialRef overrides must take precedence');

    const scene3d = JSON.parse(readFileSync(join(packDir, 'scene3d.json'), 'utf8'));
    assert.deepEqual(
      scene3d.layers3d.map((l) => l.kind),
      ['organic_strata', 'billowing_clouds', 'bonsai_calligraphy', 'sculpted_peony'],
      'reliefRef must expand to exact engine layer3d kinds',
    );
    assert.equal(runNode(VALIDATE_SCRIPT, [packDir]).status, 0, 'pack compiled from materialRef + reliefRef must pass validate_pack');
  });

  test('v5.1 Blueprint Direct ID Refs Negative (fail-closed): missing ID or tampered preset SHA fails closed', () => {
    const bpBadMat = makeSculpted3dBlueprint();
    bpBadMat.parts[0].materialRef = 'nonexistent-paper-999';
    const p1 = join(workDir, 'v51-bad-matref.json');
    writeFileSync(p1, JSON.stringify(bpBadMat));
    const r1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(r1.status, 1);
    assert.ok(r1.json?.errors?.some((e) => e.code === 'BP_MATERIAL_NOT_FOUND'), `expected BP_MATERIAL_NOT_FOUND, got ${r1.stdout}`);

    const bpBadRel = makeSculpted3dBlueprint();
    bpBadRel.scene.layers3d = [{ id: 'bad_rel', reliefRef: 'nonexistent-relief-999', z: -1 }];
    const p2 = join(workDir, 'v51-bad-relref.json');
    writeFileSync(p2, JSON.stringify(bpBadRel));
    const r2 = runNode(COMPILE_SCRIPT, ['--spec', p2, '--check']);
    assert.equal(r2.status, 1);
    assert.ok(r2.json?.errors?.some((e) => e.code === 'BP_RELIEF_NOT_FOUND'), `expected BP_RELIEF_NOT_FOUND, got ${r2.stdout}`);

    // Tampered SHA in custom library dir must fail closed at compile time
    const badLib = join(workDir, 'v51-tampered-compile-lib');
    mkdirSync(join(badLib, 'reliefs3d'), { recursive: true });
    const relObj = { id: 'custom-strata', kind: 'procedural-3d', family: 'reliefs3d', layerKind: 'organic_strata', defaults: { strata: [] }, description: 'tampered' };
    writeFileSync(join(badLib, 'reliefs3d', 'custom-strata.json'), JSON.stringify(relObj));
    writeFileSync(join(badLib, 'index.json'), JSON.stringify({
      schemaVersion: 1,
      version: '5.1.0',
      components: [],
      materials: [],
      reliefs3d: [{ id: 'custom-strata', kind: 'procedural-3d', family: 'reliefs3d', file: 'reliefs3d/custom-strata.json', sha256: 'f'.repeat(64) }],
      cutouts: [],
    }));
    const bpTampered = makeSculpted3dBlueprint();
    bpTampered.scene.layers3d = [{ id: 't_rel', reliefRef: 'custom-strata', z: -1 }];
    const p3 = join(workDir, 'v51-tampered-rel.json');
    writeFileSync(p3, JSON.stringify(bpTampered));
    const r3 = runNode(COMPILE_SCRIPT, ['--spec', p3, '--library-dir', badLib, '--check']);
    assert.equal(r3.status, 1);
    assert.ok(r3.json?.errors?.some((e) => e.code === 'LIB_SHA_MISMATCH'), `expected LIB_SHA_MISMATCH, got ${r3.stdout}`);
  });

  test('v5.1 Optional Cutout-Raster (cutoutRef): verified local PNG compiles to cutout_relief; tampered SHA, path traversal, or bad magic bytes fail closed', () => {
    // Valid 1x1 transparent PNG
    const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const pngBuf = Buffer.from(TINY_PNG_B64, 'base64');
    const pngSha = createHash('sha256').update(pngBuf).digest('hex');

    const okLib = join(workDir, 'v51-cutout-ok');
    mkdirSync(join(okLib, 'cutouts'), { recursive: true });
    writeFileSync(join(okLib, 'cutouts', 'sample.png'), pngBuf);
    const cutoutDoc = {
      id: 'sample-cutout-png',
      kind: 'cutout-raster',
      family: 'cutouts',
      imageFile: 'cutouts/sample.png',
      imageSha256: pngSha,
      mimeType: 'image/png',
      defaults: { width: 12.0, thickness: 0.11, reliefStrength: 2.2, alphaTest: 0.42 },
      description: 'Tiny verified local PNG cutout fixture',
    };
    const cutoutJsonText = JSON.stringify(cutoutDoc, null, 2) + '\n';
    writeFileSync(join(okLib, 'cutouts', 'sample-cutout-png.json'), cutoutJsonText);
    writeFileSync(join(okLib, 'index.json'), JSON.stringify({
      schemaVersion: 1,
      version: '5.1.0',
      components: [],
      materials: [],
      reliefs3d: [],
      cutouts: [{
        id: 'sample-cutout-png',
        kind: 'cutout-raster',
        family: 'cutouts',
        file: 'cutouts/sample-cutout-png.json',
        sha256: createHash('sha256').update(cutoutJsonText).digest('hex'),
        imageFile: 'cutouts/sample.png',
        imageSha256: pngSha,
      }],
    }, null, 2));

    const bpOk = makeSculpted3dBlueprint();
    bpOk.scene.layers3d = [{ id: 'raster_layer', cutoutRef: 'sample-cutout-png', z: -0.6 }];
    const pOk = join(workDir, 'v51-cutout-ok.json');
    const packOk = join(workDir, 'v51-cutout-ok-pack');
    writeFileSync(pOk, JSON.stringify(bpOk));
    const cOk = runNode(COMPILE_SCRIPT, ['--spec', pOk, '--library-dir', okLib, '--out-pack', packOk]);
    assert.equal(cOk.status, 0, `valid cutoutRef compile failed: ${cOk.stdout}\n${cOk.stderr}`);
    const s3d = JSON.parse(readFileSync(join(packOk, 'scene3d.json'), 'utf8'));
    assert.equal(s3d.layers3d[0].kind, 'cutout_relief');
    assert.ok(s3d.layers3d[0].imageDataUrl.startsWith('data:image/png;base64,'));
    assert.equal(runNode(VALIDATE_SCRIPT, [packOk]).status, 0);

    // Negative A: tampered binary PNG bytes -> LIB_SHA_MISMATCH
    writeFileSync(join(okLib, 'cutouts', 'sample.png'), Buffer.concat([pngBuf, Buffer.from([0x00])]));
    const cTamper = runNode(COMPILE_SCRIPT, ['--spec', pOk, '--library-dir', okLib, '--check']);
    assert.equal(cTamper.status, 1);
    assert.ok(cTamper.json?.errors?.some((e) => e.code === 'LIB_SHA_MISMATCH'), `expected LIB_SHA_MISMATCH on tampered PNG, got ${cTamper.stdout}`);

    // Negative B: path traversal / external URL -> LIB_UNSAFE_ASSET
    const badPathLib = join(workDir, 'v51-cutout-badpath');
    mkdirSync(join(badPathLib, 'cutouts'), { recursive: true });
    const badCutout = { ...cutoutDoc, id: 'evil-cutout', imageFile: '../outside.png' };
    const badTxt = JSON.stringify(badCutout);
    writeFileSync(join(badPathLib, 'cutouts', 'evil-cutout.json'), badTxt);
    writeFileSync(join(badPathLib, 'index.json'), JSON.stringify({
      schemaVersion: 1,
      version: '5.1.0',
      components: [],
      materials: [],
      reliefs3d: [],
      cutouts: [{ id: 'evil-cutout', kind: 'cutout-raster', family: 'cutouts', file: 'cutouts/evil-cutout.json', sha256: createHash('sha256').update(badTxt).digest('hex'), imageFile: '../outside.png', imageSha256: pngSha }],
    }));
    const bpBad = makeSculpted3dBlueprint();
    bpBad.scene.layers3d = [{ id: 'bad_cut', cutoutRef: 'evil-cutout', z: -0.6 }];
    const pBad = join(workDir, 'v51-cutout-bad.json');
    writeFileSync(pBad, JSON.stringify(bpBad));
    const cBad = runNode(COMPILE_SCRIPT, ['--spec', pBad, '--library-dir', badPathLib, '--check']);
    assert.equal(cBad.status, 1);
    assert.ok(cBad.json?.errors?.some((e) => e.code === 'LIB_UNSAFE_ASSET'), `expected LIB_UNSAFE_ASSET on traversal, got ${cBad.stdout}`);

    // Negative C: fake PNG magic bytes -> LIB_UNSAFE_ASSET
    const fakeLib = join(workDir, 'v51-cutout-fake');
    mkdirSync(join(fakeLib, 'cutouts'), { recursive: true });
    const fakeBuf = Buffer.from('<script>alert(1)</script>', 'utf8');
    const fakeSha = createHash('sha256').update(fakeBuf).digest('hex');
    writeFileSync(join(fakeLib, 'cutouts', 'fake.png'), fakeBuf);
    const fakeDoc = { ...cutoutDoc, id: 'fake-cutout', imageFile: 'cutouts/fake.png', imageSha256: fakeSha };
    const fakeTxt = JSON.stringify(fakeDoc);
    writeFileSync(join(fakeLib, 'cutouts', 'fake-cutout.json'), fakeTxt);
    writeFileSync(join(fakeLib, 'index.json'), JSON.stringify({
      schemaVersion: 1,
      version: '5.1.0',
      components: [],
      materials: [],
      reliefs3d: [],
      cutouts: [{ id: 'fake-cutout', kind: 'cutout-raster', family: 'cutouts', file: 'cutouts/fake-cutout.json', sha256: createHash('sha256').update(fakeTxt).digest('hex'), imageFile: 'cutouts/fake.png', imageSha256: fakeSha }],
    }));
    const bpFake = makeSculpted3dBlueprint();
    bpFake.scene.layers3d = [{ id: 'fake_cut', cutoutRef: 'fake-cutout', z: -0.6 }];
    const pFake = join(workDir, 'v51-cutout-fake.json');
    writeFileSync(pFake, JSON.stringify(bpFake));
    const cFake = runNode(COMPILE_SCRIPT, ['--spec', pFake, '--library-dir', fakeLib, '--check']);
    assert.equal(cFake.status, 1);
    assert.ok(cFake.json?.errors?.some((e) => e.code === 'LIB_UNSAFE_ASSET'), `expected LIB_UNSAFE_ASSET on bad magic bytes, got ${cFake.stdout}`);
  });

  // =========================================================================
  // v5.1 Step 2B TDD SUITE — Modular Rig Archetypes, Retargeting & Dynamic Parent
  // =========================================================================
  test('v5.1 Modular Rig Archetypes Catalog: index.json registers >=2 verified archetypes (biped + quadruped) with boneMapping and SHA-256', () => {
    const LIB_CLI = join(__dirname, 'library_cli.mjs');
    const libDir = join(SKILL_DIR, 'assets', 'library');
    const idx = JSON.parse(readFileSync(join(libDir, 'index.json'), 'utf8'));
    assert.ok(Array.isArray(idx.archetypes) && idx.archetypes.length >= 2, 'index.json must declare >= 2 modular rig archetypes');
    const ids = idx.archetypes.map((a) => a.id);
    assert.ok(ids.includes('biped-storybook-base'), 'must include biped-storybook-base archetype');
    assert.ok(ids.includes('quadruped-fable-base'), 'must include quadruped-fable-base archetype');
    for (const a of idx.archetypes) {
      const f = join(libDir, a.file);
      assert.ok(existsSync(f), `missing archetype file ${a.file}`);
      const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
      assert.equal(sha, a.sha256, `archetype SHA-256 mismatch for ${a.id}`);
      const doc = JSON.parse(readFileSync(f, 'utf8'));
      assert.equal(doc.kind, 'rig-archetype');
      assert.ok(doc.boneMapping && Object.keys(doc.boneMapping).length >= 6, `${a.id} must define canonical boneMapping`);
      assert.ok(Array.isArray(doc.bones) && doc.bones.length >= 6, `${a.id} must define bones[]`);
    }
    const listArch = runNode(LIB_CLI, ['list', '--kind', 'rig-archetype', '--json']);
    assert.equal(listArch.status, 0, `list --kind rig-archetype failed: ${listArch.stdout}`);
    assert.ok((listArch.json?.count ?? 0) >= 2, 'library_cli list --kind rig-archetype must return >= 2 items');
  });

  test('v5.1 Archetype Direct Ref & Retarget (archetypeRef + boneMapping): compiles across >=2 different-proportion characters and >=2 variants', () => {
    const bp = makeSculpted3dBlueprint('shadowbox-moonlit');
    bp.meta.packId = 'test-v51-archetype-retarget';
    // Add shared parts required by biped-storybook-base with 4 hand states + 3 head/torso angles + expressions
    const makeSimplePart = (id, cat, w, h, px, py, anchors = {}) => ({
      id,
      category: cat,
      size: [w, h],
      pivot: [px, py],
      anchors,
      svg: `<rect x="${-px + 2}" y="${-py + 2}" width="${w - 4}" height="${h - 4}" rx="8" fill="#f4a261"/>`,
    });
    bp.parts = [
      makeSimplePart('pelvis', 'body', 56, 36, 28, 18, { spine: [28, 6], hipL: [16, 28], hipR: [40, 28] }),
      makeSimplePart('spine', 'body', 48, 32, 24, 24, { torso: [24, 6] }),
      makeSimplePart('torso_front', 'body', 68, 64, 34, 52, { head: [34, 10], shL: [12, 18], shR: [56, 18] }),
      makeSimplePart('torso_tq', 'body', 64, 64, 32, 52, { head: [32, 10], shL: [14, 18], shR: [52, 18] }),
      makeSimplePart('torso_side', 'body', 52, 64, 26, 52, { head: [26, 10], shL: [22, 18], shR: [30, 18] }),
      makeSimplePart('head_front', 'head', 56, 56, 28, 46, { face: [28, 28] }),
      makeSimplePart('head_tq', 'head', 56, 56, 28, 46, { face: [30, 28] }),
      makeSimplePart('head_side', 'head', 52, 56, 24, 46, { face: [34, 28] }),
      makeSimplePart('face_neutral', 'face', 32, 20, 16, 10, {}),
      makeSimplePart('face_happy', 'face', 32, 20, 16, 10, {}),
      makeSimplePart('face_wonder', 'face', 32, 20, 16, 10, {}),
      makeSimplePart('uarm', 'limb', 20, 44, 10, 8, { elbow: [10, 38] }),
      makeSimplePart('farm', 'limb', 18, 40, 9, 8, { wrist: [9, 34] }),
      makeSimplePart('hand_open', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makeSimplePart('hand_grip', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makeSimplePart('hand_point', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makeSimplePart('hand_relaxed', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makeSimplePart('thigh', 'limb', 24, 52, 12, 10, { knee: [12, 44] }),
      makeSimplePart('shin', 'limb', 20, 50, 10, 8, { ankle: [10, 42] }),
      makeSimplePart('foot', 'foot', 32, 18, 10, 8, { sole: [16, 16] }),
    ];
    // 2 characters with different proportions sharing the exact same biped archetype & boneMapping
    bp.rigs = [
      {
        id: 'short_artisan',
        archetypeRef: 'biped-storybook-base',
        rootPos: { x: 340, y: 380 },
        scale: 0.85,
        facing: 1,
        gait: {
          enabled: true,
          lockToTravel: true,
          strideScaleByLegLength: true,
          groundCurve: [[0, 470], [480, 462], [960, 470]],
        },
      },
      {
        id: 'tall_traveler',
        archetypeRef: 'biped-storybook-base',
        rootPos: { x: 620, y: 350 },
        scale: 1.15,
        facing: -1,
        gait: {
          enabled: true,
          lockToTravel: true,
          strideScaleByLegLength: true,
          groundCurve: [[0, 470], [480, 462], [960, 470]],
        },
      },
    ];
    bp.motions = [
      {
        id: 'walk_retarget',
        name: 'Retargeted Walk',
        type: 'cycle',
        period: 4,
        phases: [
          {
            from: 0,
            to: 1,
            resetToRest: true,
            rigs: {
              short_artisan: { rootX: [300, 420], rootY: [380, 380] },
              tall_traveler: { rootX: [660, 540], rootY: [350, 350] },
            },
          },
        ],
      },
    ];

    const bpPath = join(workDir, 'v51-arch.json');
    const packDir = join(workDir, 'v51-arch-pack');
    writeFileSync(bpPath, JSON.stringify(bp));
    const c = runNode(COMPILE_SCRIPT, ['--spec', bpPath, '--out-pack', packDir]);
    assert.equal(c.status, 0, `archetypeRef compile failed: ${c.stdout}\n${c.stderr}`);
    const rigDoc = JSON.parse(readFileSync(join(packDir, 'rig.json'), 'utf8'));
    assert.ok(rigDoc.boneMapping && rigDoc.boneMapping.pelvis === 'pelvis', 'compiled rig.json must preserve boneMapping');
    assert.equal(runNode(VALIDATE_SCRIPT, [packDir]).status, 0, 'compiled archetype pack must pass validate_pack');
  });

  test('v5.1 Retarget & Gait Validation (fail-closed): unknown archetypeRef, bad boneMapping, or invalid groundCurve fails closed', () => {
    const bpBadArch = makeSculpted3dBlueprint();
    bpBadArch.rigs[0].archetypeRef = 'nonexistent-archetype-999';
    const p1 = join(workDir, 'v51-bad-arch.json');
    writeFileSync(p1, JSON.stringify(bpBadArch));
    const r1 = runNode(COMPILE_SCRIPT, ['--spec', p1, '--check']);
    assert.equal(r1.status, 1);
    assert.ok(r1.json?.errors?.some((e) => e.code === 'BP_ARCHETYPE_NOT_FOUND'), `expected BP_ARCHETYPE_NOT_FOUND, got ${r1.stdout}`);

    const bpBadMap = makeSculpted3dBlueprint();
    bpBadMap.rigs[0].boneMapping = { pelvis: 'nonexistent_bone_id' };
    const p2 = join(workDir, 'v51-bad-map.json');
    writeFileSync(p2, JSON.stringify(bpBadMap));
    const r2 = runNode(COMPILE_SCRIPT, ['--spec', p2, '--check']);
    assert.equal(r2.status, 1);
    assert.ok(r2.json?.errors?.some((e) => e.code === 'BP_BONEMAPPING_INVALID'), `expected BP_BONEMAPPING_INVALID, got ${r2.stdout}`);

    const bpBadCurve = makeSculpted3dBlueprint();
    bpBadCurve.rigs[0].gait = { enabled: true, groundCurve: [[500, 440], [200, 440]] }; // non-increasing X!
    const p3 = join(workDir, 'v51-bad-curve.json');
    writeFileSync(p3, JSON.stringify(bpBadCurve));
    const r3 = runNode(COMPILE_SCRIPT, ['--spec', p3, '--check']);
    assert.equal(r3.status, 1);
    assert.ok(r3.json?.errors?.some((e) => e.code === 'BP_GAIT_INVALID'), `expected BP_GAIT_INVALID, got ${r3.stdout}`);
  });

  test('v5.1 Dynamic Parent Interaction Contract (grip/release): valid prop & reach PASS; missing grip anchor, wrist >22.5 deg/f, or out-of-reach fails closed', () => {
    const makeInteractionBp = (eventOverride = {}, propAnchors = { grip: [16, 8], base: [16, 30] }) => {
      const bp = makeSculpted3dBlueprint();
      bp.parts.push({
        id: 'lanternProp',
        category: 'prop',
        size: [32, 32],
        pivot: [16, 16],
        anchors: propAnchors,
        svg: '<rect x="-10" y="-12" width="20" height="24" rx="4" fill="#ffd166"/>',
      });
      bp.motions = [
        {
          id: 'interact',
          name: 'Grip & Release',
          type: 'cycle',
          period: 4,
          phases: [
            {
              from: 0,
              to: 0.5,
              rigs: { [bp.rigs[0].id]: { rootX: [400, 400], rootY: [300, 300] } },
              events: [
                {
                  type: 'grip',
                  rig: bp.rigs[0].id,
                  ikChain: Object.keys(bp.rigs[0].ik)[0],
                  propPart: 'lanternProp',
                  handVariant: 'grip',
                  maxWristDegPerFrame: 18,
                  targetPos: [442, 264],
                  ...eventOverride,
                },
              ],
            },
          ],
        },
      ];
      return bp;
    };

    // Positive: within reach, valid grip+base anchors, wrist speed <= 22.5
    const pOk = join(workDir, 'v51-interact-ok.json');
    writeFileSync(pOk, JSON.stringify(makeInteractionBp()));
    const rOk = runNode(COMPILE_SCRIPT, ['--spec', pOk, '--check']);
    assert.equal(rOk.status, 0, `valid interaction event failed: ${rOk.stdout}`);

    // Negative A: missing grip anchor on prop
    const pNoGrip = join(workDir, 'v51-interact-nogrip.json');
    writeFileSync(pNoGrip, JSON.stringify(makeInteractionBp({}, { base: [16, 30] })));
    const rNoGrip = runNode(COMPILE_SCRIPT, ['--spec', pNoGrip, '--check']);
    assert.equal(rNoGrip.status, 1);
    assert.ok(rNoGrip.json?.errors?.some((e) => e.code === 'BP_INTERACTION_ANCHOR_MISSING'), `expected BP_INTERACTION_ANCHOR_MISSING, got ${rNoGrip.stdout}`);

    // Negative B: wrist rotation speed > 22.5 deg/frame
    const pFastWrist = join(workDir, 'v51-interact-wrist.json');
    writeFileSync(pFastWrist, JSON.stringify(makeInteractionBp({ maxWristDegPerFrame: 35 })));
    const rFastWrist = runNode(COMPILE_SCRIPT, ['--spec', pFastWrist, '--check']);
    assert.equal(rFastWrist.status, 1);
    assert.ok(rFastWrist.json?.errors?.some((e) => e.code === 'BP_INTERACTION_INVALID'), `expected BP_INTERACTION_INVALID, got ${rFastWrist.stdout}`);

    // Negative C: targetPos far outside 2-bone IK reach -> BP_REACH_EXCEEDED
    const pFar = join(workDir, 'v51-interact-far.json');
    writeFileSync(pFar, JSON.stringify(makeInteractionBp({ targetPos: [920, 40] })));
    const rFar = runNode(COMPILE_SCRIPT, ['--spec', pFar, '--check']);
    assert.equal(rFar.status, 1);
    assert.ok(rFar.json?.errors?.some((e) => e.code === 'BP_REACH_EXCEEDED'), `expected BP_REACH_EXCEEDED, got ${rFar.stdout}`);
  });

  // =========================================================================
  // v5.1 Step 3 TDD SUITE — paperFlex, groundCurve/lockToTravel & 5 New layers3d
  // =========================================================================
  test('v5.1 paperFlex Validation & Multi-Variant Compile: valid modes PASS across >=2 rigs; unknown mode fails closed (BP_CARDSTOCK_INVALID)', () => {
    const bp = makeBlueprintA();
    bp.style = 'shadowbox-moonlit';
    bp.meta.packId = 'test-v51-paperflex';
    bp.parts[0].cardstock = { thickness: 0.09, bevel: 0.015, edgeColor: '#f6ebd4', paperFlex: { mode: 'cloth_billow', amp: 0.12, freq: 1.5 } };
    bp.parts[1].cardstock = { thickness: 0.07, bevel: 0.012, edgeColor: '#fff6e0', paperFlex: { mode: 'wing_cup', amp: 0.16, freq: 2.0 } };
    bp.parts.push({
      id: 'headA_flex_alt',
      category: 'head',
      cardstock: { thickness: 0.08, paperFlex: { mode: 'tail_wave', amp: 0.14, freq: 1.8 } },
      size: [60, 60],
      pivot: [20, 30],
      anchors: {},
      svg: '<path d="M-12 -10 C-10 -22 12 -22 18 -10 C22 2 12 14 -4 12 Z" fill="#f4a261"/>',
    });
    bp.rigs[0].bones[1].variants = { alt: 'headA_flex_alt' };
    bp.rigs[0].variants = { head: ['default', 'alt'] };
    const pOk = join(workDir, 'v51-paperflex-ok.json');
    const packOk = join(workDir, 'v51-paperflex-pack');
    const htmlOk = join(workDir, 'v51-paperflex.html');
    writeFileSync(pOk, JSON.stringify(bp));
    const cOk = runNode(COMPILE_SCRIPT, ['--spec', pOk, '--out-pack', packOk, '--out-html', htmlOk]);
    assert.equal(cOk.status, 0, `paperFlex valid compile failed: ${cOk.stdout}`);
    assert.equal(runNode(VALIDATE_SCRIPT, [packOk]).status, 0);
    const manifest = JSON.parse(readFileSync(join(packOk, 'manifest.json'), 'utf8'));
    assert.equal(manifest.assets[0].cardstock?.paperFlex?.mode, 'cloth_billow');

    // Negative: invalid paperFlex.mode must fail closed
    const bpBad = makeSculpted3dBlueprint();
    bpBad.parts[0].cardstock = { thickness: 0.09, paperFlex: { mode: 'rubber_stretch_invalid' } };
    const pBad = join(workDir, 'v51-paperflex-bad.json');
    writeFileSync(pBad, JSON.stringify(bpBad));
    const cBad = runNode(COMPILE_SCRIPT, ['--spec', pBad, '--check']);
    assert.equal(cBad.status, 1);
    assert.ok(cBad.json?.errors?.some((e) => e.code === 'BP_CARDSTOCK_INVALID'), `expected BP_CARDSTOCK_INVALID, got ${cBad.stdout}`);
  });

  test('v5.1 Engine 5 New layers3d + groundCurve/lockToTravel + Docs Sync: all 5 kinds compile into 3D HTML & pack and are documented in blueprint-schema.md', () => {
    const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const bp = makeBlueprintA();
    bp.style = 'shadowbox-moonlit';
    bp.meta.packId = 'test-v51-5layers';
    bp.rigs[0].gait = { enabled: true, lockToTravel: true, groundCurve: [[0, 445], [480, 438], [960, 445]] };
    bp.rigs[1].gait = { enabled: true, lockToTravel: false, groundCurve: [[0, 445], [960, 445]] };
    bp.scene.layers3d = [
      { id: 'l_strata', reliefRef: 'strata-mountain-mist', z: -2.6 },
      { id: 'l_clouds', reliefRef: 'clouds-billowing-canopy', z: -1.8 },
      { id: 'l_bonsai', reliefRef: 'bonsai-frame-pine', z: 0.4 },
      { id: 'l_peony', reliefRef: 'peony-botanical-cluster', z: 0.8 },
      {
        id: 'l_cutout',
        kind: 'cutout_relief',
        z: -0.9,
        imageDataUrl: `data:image/png;base64,${TINY_PNG_B64}`,
        width: 12,
        thickness: 0.11,
        reliefStrength: 2.4,
        paperFlex: { anchor: 'edges', ampX: 0.12, ampZ: 0.15, freq: 1.3 },
      },
    ];
    const pOk = join(workDir, 'v51-5layers.json');
    const packOk = join(workDir, 'v51-5layers-pack');
    const htmlOk = join(workDir, 'v51-5layers.html');
    writeFileSync(pOk, JSON.stringify(bp));
    const cOk = runNode(COMPILE_SCRIPT, ['--spec', pOk, '--out-pack', packOk, '--out-html', htmlOk]);
    assert.equal(cOk.status, 0, `5 new layers3d compile failed: ${cOk.stdout}`);
    assert.equal(runNode(VALIDATE_SCRIPT, [packOk]).status, 0);

    // Negative: cutout_relief with external URL instead of data:image URI fails closed
    const bpBadCut = makeSculpted3dBlueprint();
    bpBadCut.scene.layers3d = [{ id: 'bad_cut', kind: 'cutout_relief', z: -1, imageDataUrl: 'https://example.com/evil.png' }];
    const pBadCut = join(workDir, 'v51-bad-cuturl.json');
    writeFileSync(pBadCut, JSON.stringify(bpBadCut));
    const cBadCut = runNode(COMPILE_SCRIPT, ['--spec', pBadCut, '--check']);
    assert.equal(cBadCut.status, 1);
    assert.ok(cBadCut.json?.errors?.some((e) => e.code === 'BP_SCENE3D_INVALID'));

    // Verify docs sync in blueprint-schema.md
    const schemaDoc = readFileSync(join(SKILL_DIR, 'references', 'blueprint-schema.md'), 'utf8');
    for (const kw of ['paperFlex', 'groundCurve', 'lockToTravel', 'organic_strata', 'bonsai_calligraphy', 'billowing_clouds', 'sculpted_peony', 'cutout_relief', 'boneMapping', 'materialRef', 'reliefRef', 'archetypeRef', 'cutoutRef']) {
      assert.ok(schemaDoc.includes(kw), `blueprint-schema.md must document "${kw}"`);
    }
  });
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
