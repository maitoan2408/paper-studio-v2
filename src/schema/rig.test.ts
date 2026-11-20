import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadArtPack } from './art-pack.ts';
import { validateRig } from './rig.ts';
import { code } from './test-helpers.ts';
import { rigFixture as fixture } from './rig-fixture.ts';

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
  ['RIG_UNKNOWN_PARENT', (r) => (r.ground = ['sole.l'])],
  ['RIG_SCHEMA', (r) => (r.ground = [])],
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
