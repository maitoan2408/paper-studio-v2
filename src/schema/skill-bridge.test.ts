import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadArtPack } from './art-pack.ts';
import { validateRig } from './rig.ts';
import { code } from './test-helpers.ts';

const SKILL_DIR = resolve('skills/paper-cut-rig-craft');
const COMPILE_SCRIPT = join(SKILL_DIR, 'scripts/compile_rig_studio.mjs');
const VALIDATE_SKILL_PACK = join(SKILL_DIR, 'scripts/validate_pack.mjs');

function makePart(
  id: string,
  category: string,
  w: number,
  h: number,
  px: number,
  py: number,
  anchors: Record<string, [number, number]> = {},
  materialRef?: string,
) {
  return {
    id,
    category,
    size: [w, h],
    pivot: [px, py],
    anchors,
    ...(materialRef ? { materialRef } : {}),
    svg: `<rect x="${-px + 2}" y="${-py + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="#d9743b"/>`,
  };
}

function makeBipedBridgeBlueprint() {
  return {
    meta: { packId: 'bridge-biped-v1', version: '1.0.0', title: 'Bridge Biped Test', seed: 42 },
    style: 'shadowbox-moonlit',
    scene: {
      width: 960,
      height: 540,
      bgColor: '#0b1326',
      defsSvg: '',
      skySvg: '<rect x="0" y="0" width="960" height="540" fill="#0b1326"/>',
      layers3d: [
        { id: 'bg-strata', reliefRef: 'strata-mountain-mist', z: -2.4 },
        { id: 'fg-peony', reliefRef: 'peony-botanical-cluster', z: 0.9 },
      ],
    },
    parts: [
      makePart('pelvis', 'body', 56, 36, 28, 18, { spine: [28, 6], 'hip.l': [16, 28], 'hip.r': [40, 28] }, 'paper-cotton-300gsm'),
      makePart('spine', 'body', 48, 32, 24, 24, { torso: [24, 6] }, 'paper-cotton-300gsm'),
      makePart('torso-front', 'body', 68, 64, 34, 52, { head: [34, 10], 'shoulder.l': [12, 18], 'shoulder.r': [56, 18] }, 'paper-cotton-300gsm'),
      makePart('torso-tq', 'body', 64, 64, 32, 52, { head: [32, 10], 'shoulder.l': [14, 18], 'shoulder.r': [52, 18] }),
      makePart('torso-side', 'body', 52, 64, 26, 52, { head: [26, 10], 'shoulder.l': [22, 18], 'shoulder.r': [30, 18] }),
      makePart('head-front', 'head', 56, 56, 28, 46, { face: [28, 28] }),
      makePart('head-tq', 'head', 56, 56, 28, 46, { face: [30, 28] }),
      makePart('head-side', 'head', 52, 56, 24, 46, { face: [34, 28] }),
      makePart('face-neutral', 'face', 32, 20, 16, 10),
      makePart('face-happy', 'face', 32, 20, 16, 10),
      makePart('face-wonder', 'face', 32, 20, 16, 10),
      makePart('uarm', 'limb', 20, 44, 10, 8, { elbow: [10, 38] }),
      makePart('farm', 'limb', 18, 40, 9, 8, { wrist: [9, 34] }),
      makePart('hand-open', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makePart('hand-grip', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makePart('hand-point', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makePart('hand-relaxed', 'hand', 20, 22, 10, 6, { grip: [10, 14] }),
      makePart('thigh', 'limb', 24, 52, 12, 10, { knee: [12, 44] }),
      makePart('shin', 'limb', 20, 50, 10, 8, { ankle: [10, 42] }),
      makePart('foot', 'foot', 32, 18, 10, 8, { sole: [16, 16] }),
    ],
    rigs: [
      {
        id: 'short-artisan',
        archetypeRef: 'biped-storybook-base',
        rootPos: { x: 340, y: 380 },
        scale: 0.85,
        facing: 1,
        gait: {
          groundCurve: [[0, 470], [480, 462], [960, 470]],
        },
      },
      {
        id: 'tall-traveler',
        archetypeRef: 'biped-storybook-base',
        rootPos: { x: 620, y: 350 },
        scale: 1.15,
        facing: -1,
        gait: {
          groundCurve: [[0, 470], [480, 462], [960, 470]],
        },
      },
    ],
  };
}

function makeQuadrupedBridgeBlueprint() {
  return {
    meta: { packId: 'bridge-quadruped-v1', version: '1.0.0', title: 'Bridge Quadruped Test', seed: 77 },
    style: 'daylight-sculpted',
    scene: {
      width: 960,
      height: 540,
      bgColor: '#1b263b',
      defsSvg: '',
      skySvg: '<rect x="0" y="0" width="960" height="540" fill="#1b263b"/>',
      layers3d: [{ id: 'bg-clouds', reliefRef: 'clouds-billowing-canopy', z: -2.0 }],
    },
    parts: [
      makePart('q-pelvis', 'body', 74, 56, 37, 28, { chest: [62, 24], 'bhip.l': [24, 42], 'bhip.r': [36, 44], tail: [10, 22] }, 'paper-kraft-warm'),
      makePart('q-chest', 'body', 66, 56, 18, 28, { head: [50, 14], 'fhip.l': [34, 42], 'fhip.r': [44, 44] }),
      makePart('q-head', 'head', 70, 56, 18, 30),
      makePart('q-leg-u', 'limb', 24, 48, 12, 10, { knee: [12, 38] }),
      makePart('q-leg-l', 'limb', 26, 46, 13, 9, { ankle: [13, 38] }),
      makePart('q-paw', 'foot', 24, 16, 10, 6, { sole: [12, 14] }),
      makePart('q-tail1', 'tail', 48, 30, 38, 15, { tip: [8, 15] }),
      makePart('q-tail2', 'tail', 46, 30, 36, 15, { tip: [8, 15] }),
      makePart('q-tail3', 'tail', 42, 28, 32, 14),
    ],
    rigs: [
      {
        id: 'forest-fox',
        archetypeRef: 'quadruped-fable-base',
        rootPos: { x: 460, y: 360 },
        scale: 1.0,
        facing: 1,
      },
    ],
  };
}

test('Skill v5.1 → Film Engine Bridge: compiled sculpted3d Biped (2 rigs, 2+ variants) loads cleanly via loadArtPack + validateRig', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paper-studio-bridge-biped-'));
  try {
    const specPath = join(dir, 'biped.json');
    const packDir = join(dir, 'pack');
    writeFileSync(specPath, JSON.stringify(makeBipedBridgeBlueprint(), null, 2));

    execFileSync(process.execPath, [COMPILE_SCRIPT, '--spec', specPath, '--out-pack', packDir], { stdio: 'pipe' });
    execFileSync(process.execPath, [VALIDATE_SKILL_PACK, packDir], { stdio: 'pipe' });

    const pack = loadArtPack(packDir);
    assert.ok(pack.scene3d, 'loadArtPack must preserve and verify scene3d reference');
    assert.equal(pack.assets.get('pelvis')?.cardstock?.edgeColor, '#f6ebd4', 'loadArtPack must preserve cardstock metadata');

    const primaryRigRaw = JSON.parse(readFileSync(join(packDir, 'rig.json'), 'utf8'));
    const rig = validateRig(primaryRigRaw, pack);
    assert.equal(rig.data.id, 'short-artisan');
    assert.equal(rig.data.boneMapping?.pelvis, 'pelvis');
    assert.equal(rig.data.handTransition?.maxWristDegPerFrame, 22.5);
    assert.ok(rig.data.gait?.groundCurve && rig.data.gait.groundCurve.length === 3);

    const secondRigRaw = JSON.parse(readFileSync(join(packDir, 'rigs/tall-traveler.json'), 'utf8'));
    const secondRig = validateRig(secondRigRaw, pack);
    assert.equal(secondRig.data.id, 'tall-traveler');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Skill v5.1 → Film Engine Bridge: compiled sculpted3d Quadruped loads cleanly via loadArtPack + validateRig', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paper-studio-bridge-quad-'));
  try {
    const specPath = join(dir, 'quad.json');
    const packDir = join(dir, 'pack');
    writeFileSync(specPath, JSON.stringify(makeQuadrupedBridgeBlueprint(), null, 2));

    execFileSync(process.execPath, [COMPILE_SCRIPT, '--spec', specPath, '--out-pack', packDir], { stdio: 'pipe' });
    execFileSync(process.execPath, [VALIDATE_SKILL_PACK, packDir], { stdio: 'pipe' });

    const pack = loadArtPack(packDir);
    assert.ok(pack.scene3d);
    const rigRaw = JSON.parse(readFileSync(join(packDir, 'rig.json'), 'utf8'));
    const rig = validateRig(rigRaw, pack);
    assert.equal(rig.data.id, 'forest-fox');
    assert.equal(rig.data.ground.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Skill v5.1 → Film Engine Bridge Negative (fail-closed): tampered scene3d, bad boneMapping, or non-increasing groundCurve fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paper-studio-bridge-neg-'));
  try {
    const specPath = join(dir, 'biped.json');
    const packDir = join(dir, 'pack');
    writeFileSync(specPath, JSON.stringify(makeBipedBridgeBlueprint(), null, 2));
    execFileSync(process.execPath, [COMPILE_SCRIPT, '--spec', specPath, '--out-pack', packDir], { stdio: 'pipe' });

    const pack = loadArtPack(packDir);
    const rigRaw = JSON.parse(readFileSync(join(packDir, 'rig.json'), 'utf8'));

    // 1. Invalid boneMapping -> RIG_BONEMAPPING_INVALID
    const badMap = structuredClone(rigRaw);
    badMap.boneMapping.pelvis = 'nonexistent';
    assert.throws(() => validateRig(badMap, pack), code('RIG_BONEMAPPING_INVALID'));

    // 2. Non-increasing groundCurve X -> RIG_SCHEMA
    const badCurve = structuredClone(rigRaw);
    badCurve.gait.groundCurve = [[500, 470], [200, 470]];
    assert.throws(() => validateRig(badCurve, pack), code('RIG_SCHEMA'));

    // 3. Invalid handTransition (> 22.5 deg/frame) -> RIG_SCHEMA
    const badHand = structuredClone(rigRaw);
    badHand.handTransition.maxWristDegPerFrame = 30;
    assert.throws(() => validateRig(badHand, pack), code('RIG_SCHEMA'));

    // 4. Unknown followThrough bone -> RIG_UNKNOWN_PARENT
    const badFollow = structuredClone(rigRaw);
    badFollow.followThrough.chain = ['pelvis', 'ghost-bone'];
    assert.throws(() => validateRig(badFollow, pack), code('RIG_UNKNOWN_PARENT'));

    // 5. Tampered scene3d.json -> ART_HASH_MISMATCH
    const s3dPath = join(packDir, 'scene3d.json');
    const origS3d = readFileSync(s3dPath, 'utf8');
    writeFileSync(s3dPath, origS3d + '\n ');
    assert.throws(() => loadArtPack(packDir), code('ART_HASH_MISMATCH'));
    writeFileSync(s3dPath, origS3d);

    // 6. scene3d path traversal -> ART_PATH_UNSAFE
    const manPath = join(packDir, 'manifest.json');
    const manOrig = readFileSync(manPath, 'utf8');
    const manBadPath = JSON.parse(manOrig);
    manBadPath.scene3d.file = '../escape.json';
    writeFileSync(manPath, JSON.stringify(manBadPath, null, 2));
    assert.throws(() => loadArtPack(packDir), code('ART_PATH_UNSAFE'));

    // 7. Invalid cardstock thickness -> ART_SCHEMA
    const manBadCard = JSON.parse(manOrig);
    manBadCard.assets[0].cardstock = { thickness: -1 };
    writeFileSync(manPath, JSON.stringify(manBadCard, null, 2));
    assert.throws(() => loadArtPack(packDir), code('ART_SCHEMA'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
