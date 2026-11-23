#!/usr/bin/env node
/**
 * Automated regression & contract test suite for paper-cut-rig-craft skill.
 * Zero external dependencies. Runs against real compile_rig_studio.mjs,
 * validate_pack.mjs, and assets/viewer-shell.html.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      setAttribute() {},
      getAttribute() { return ''; },
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
    const files = [VIEWER_HTML, COMPILE_SCRIPT, VALIDATE_SCRIPT];
    const guardPath = join(__dirname, 'lib', 'svg-guard.mjs');
    if (existsSync(guardPath)) files.push(guardPath);
    for (const f of files) {
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
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
