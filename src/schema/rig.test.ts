import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadArtPack } from './art-pack.ts';
import { validateRig } from './rig.ts';
import { code, makePack, type AssetSpec } from './test-helpers.ts';

/** Hai nhân vật cùng kiểu rig, khác số đo: "stout" (thấp đậm) và "lanky" (cao gầy). */
function fixture() {
  const body = (p: string, s: { torsoH: number; armL: number; farmL: number }): AssetSpec[] => [
    { id: `${p}-pelvis`, w: 80, h: 40, pivot: [40, 40] as [number, number], anchors: { waist: [40, 5] as [number, number] }, category: 'body' },
    { id: `${p}-torso`, w: 100, h: s.torsoH, pivot: [50, s.torsoH] as [number, number],
      anchors: { 'shoulder.l': [15, 10] as [number, number], 'shoulder.r': [85, 10] as [number, number] }, category: 'body' },
    { id: `${p}-uarm`, w: 30, h: s.armL + 10, pivot: [15, 5] as [number, number], anchors: { elbow: [15, s.armL + 5] as [number, number] }, category: 'body' },
    { id: `${p}-farm`, w: 26, h: s.farmL + 10, pivot: [13, 5] as [number, number], anchors: { wrist: [13, s.farmL + 5] as [number, number] }, category: 'body' },
    { id: `${p}-hand`, w: 30, h: 30, pivot: [15, 3] as [number, number], anchors: { grip: [15, 18] as [number, number] }, category: 'hand' },
    { id: `${p}-hand-fist`, w: 26, h: 24, pivot: [13, 3] as [number, number], anchors: { grip: [13, 14] as [number, number] }, category: 'hand' },
  ];
  const pack = makePack([
    ...body('stout', { torsoH: 120, armL: 70, farmL: 60 }),
    ...body('lanky', { torsoH: 190, armL: 110, farmL: 100 }),
  ]);
  const limits = (min: number, max: number) => ({ min, max });
  const sideBones = (s: 'l' | 'r') => [
    { id: `upper-arm.${s}`, parent: 'torso', attach: `shoulder.${s}`, limits: limits(-170, 170), z: s === 'l' ? -1 : 2 },
    { id: `forearm.${s}`, parent: `upper-arm.${s}`, attach: 'elbow', limits: limits(-150, 0), z: s === 'l' ? -1 : 2 },
    { id: `hand.${s}`, parent: `forearm.${s}`, attach: 'wrist', limits: limits(-60, 60), z: s === 'l' ? -1 : 2 },
  ];
  const character = (p: string) => ({
    id: p,
    skin: {
      pelvis: { default: `${p}-pelvis` },
      torso: { default: `${p}-torso` },
      ...Object.fromEntries((['l', 'r'] as const).flatMap((s) => [
        [`upper-arm.${s}`, { default: `${p}-uarm` }],
        [`forearm.${s}`, { default: `${p}-farm` }],
        [`hand.${s}`, { default: `${p}-hand`, variants: { fist: `${p}-hand-fist` } }],
      ])),
    } as Record<string, { default: string; variants?: Record<string, string> }>,
    rest: { pelvis: 0, torso: 0, 'upper-arm.l': -5, 'upper-arm.r': 5, 'forearm.l': -10, 'forearm.r': -10, 'hand.l': 0, 'hand.r': 0 } as Record<string, number>,
  });
  const rig = {
    schemaVersion: 1,
    id: 'biped-test',
    sides: ['l', 'r'],
    bones: [
      { id: 'pelvis', parent: null, attach: null, limits: limits(-20, 20), z: 0 } as any,
      { id: 'torso', parent: 'pelvis', attach: 'waist', limits: limits(-15, 40), z: 1 },
      ...sideBones('l'),
      ...sideBones('r'),
    ],
    contacts: { 'grip.l': { bone: 'hand.l', anchor: 'grip' }, 'grip.r': { bone: 'hand.r', anchor: 'grip' } },
    characters: [character('stout'), character('lanky')],
  };
  return { pack: loadArtPack(pack.dir), rig, packFixture: pack };
}

test('two characters share one rig type; bone lengths come from art anchors', () => {
  const { pack, rig } = fixture();
  const r = validateRig(rig, pack);
  assert.equal(r.order[0]?.id, 'pelvis');
  const stout = r.characters.get('stout')!.boneLengths;
  const lanky = r.characters.get('lanky')!.boneLengths;
  // forearm gắn ở anchor elbow của upper-arm: |(15, armL+5) − (15, 5)| = armL.
  assert.equal(stout.get('forearm.l'), 70);
  assert.equal(lanky.get('forearm.r'), 110);
  assert.equal(stout.get('hand.l'), 60);
  assert.equal(lanky.get('hand.l'), 100);
  // torso gắn ở waist của pelvis: (40,5) so với pivot (40,40) = 35, giống nhau cho 2 người.
  assert.equal(stout.get('torso'), 35);
  assert.equal(lanky.get('torso'), 35);
});

test('parents always come before children in order', () => {
  const { pack, rig } = fixture();
  const order = validateRig(rig, pack).order.map((b) => b.id);
  for (const b of rig.bones) if (b.parent) assert.ok(order.indexOf(b.parent) < order.indexOf(b.id), b.id);
});

const cases: [string, (r: any) => void][] = [
  ['RIG_SCHEMA', (r) => (r.extra = true)],
  ['RIG_SCHEMA', (r) => (r.bones[1].id = 'Torso')],
  ['RIG_SCHEMA', (r) => r.bones.push({ ...r.bones[1] })],
  ['RIG_SCHEMA', (r) => (r.bones[1].attach = null)],
  ['RIG_SCHEMA', (r) => (r.bones[1].limits.max = 999)],
  ['RIG_UNKNOWN_PARENT', (r) => (r.bones[1].parent = 'spine')],
  ['RIG_UNKNOWN_PARENT', (r) => (r.contacts['grip.l'].bone = 'paw.l')],
  ['RIG_ROOT_COUNT', (r) => r.bones.push({ id: 'tail', parent: null, attach: null, limits: { min: -1, max: 1 }, z: 0 })],
  ['RIG_CYCLE', (r) => { r.bones[2].parent = 'hand.l'; r.bones[2].attach = 'grip'; }],
  ['RIG_SIDE_UNPAIRED', (r) => (r.bones = r.bones.filter((b: any) => b.id !== 'hand.r'))],
  ['RIG_LIMIT_INVALID', (r) => (r.bones[0].limits = { min: 10, max: 10 })],
  ['RIG_REST_OUT_OF_LIMIT', (r) => (r.characters[1].rest['forearm.l'] = 5)],
  ['RIG_SKIN_INCOMPLETE', (r) => delete r.characters[0].skin.torso],
  ['RIG_SKIN_INCOMPLETE', (r) => delete r.characters[1].rest['hand.r']],
  ['RIG_SKIN_INCOMPLETE', (r) => (r.characters[0].rest.tail = 0)],
  ['RIG_ASSET_MISSING', (r) => (r.characters[0].skin['hand.l'].variants.fist = 'nope')],
  ['RIG_ANCHOR_MISSING', (r) => (r.bones[2].attach = 'neck')],
];

for (const [c, mutate] of cases) {
  test(`${c}: ${mutate.toString().slice(0, 70)}`, () => {
    const { pack, rig } = fixture();
    mutate(rig);
    assert.throws(() => validateRig(rig, pack), code(c));
  });
}

test('RIG_ANCHOR_MISSING: a hand variant without the grip contact anchor', () => {
  const f = fixture();
  f.packFixture.manifest.assets.find((a) => a.id === 'lanky-hand-fist')!.anchors = {};
  f.packFixture.write();
  assert.throws(() => validateRig(f.rig, loadArtPack(f.packFixture.dir)), code('RIG_ANCHOR_MISSING'));
});

test('RIG_DEGENERATE_BONE: attach anchor on the pivot', () => {
  const f = fixture();
  const a = f.packFixture.manifest.assets.find((x) => x.id === 'stout-uarm')!;
  a.anchors = { elbow: [...a.pivot] as [number, number] };
  f.packFixture.write();
  assert.throws(() => validateRig(f.rig, loadArtPack(f.packFixture.dir)), code('RIG_DEGENERATE_BONE'));
});
