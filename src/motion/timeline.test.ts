import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSha256 } from '../core/hash.ts';
import { castFixture } from '../schema/cast-fixture.ts';
import { sampleFrame, spriteToScreen } from '../scene/sample.ts';
import { characterPose, keyValue } from './timeline.ts';

const film = () => castFixture().validate();
const N = 96;
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test('keyValue: eases between keys and holds after the last key', () => {
  const keys = [{ t: 0, v: 0, ease: 'linear' as const }, { t: 0.5, v: 10, ease: 'linear' as const }, { t: 1, v: 0 }];
  assert.equal(keyValue(keys, 0.25), 5);
  assert.equal(keyValue(keys, 0.5), 10);
  assert.equal(keyValue(keys, 1), 0);
  assert.equal(keyValue([{ t: 0, v: 3 }], 0.7), 3);
});

test('pose is pure: same frame gives same pose in any order', () => {
  const f = film();
  const fwd = Array.from({ length: N }, (_, i) => canonicalSha256([...characterPose(f, 1, i).angles]));
  const rev = Array.from({ length: N }, (_, i) => N - 1 - i).map((i) => canonicalSha256([...characterPose(f, 1, i).angles])).reverse();
  assert.deepEqual(rev, fwd);
});

test('wave raises the LEFT arm of c1 (+) and, mirrored, the RIGHT arm of c2 (−)', () => {
  const f = film();
  // c1 wave: start 10, dur 64 → frame 30 có t = 20/63 ≈ 0.32, nằm trong đoạn giữ 120° (t 0.3–0.7).
  const p1 = characterPose(f, 0, 30);
  assert.ok(near(p1.angles.get('upper-arm.l')!, -5 + 120), `l=${p1.angles.get('upper-arm.l')}`);
  assert.equal(p1.angles.get('upper-arm.r'), 5); // tay kia không đổi
  // c2 wave: start 30, dur 60, active r → đổi dấu; frame 65 có t ≈ 0.59.
  const p2 = characterPose(f, 1, 65);
  assert.ok(near(p2.angles.get('upper-arm.r')!, 5 - 120), `r=${p2.angles.get('upper-arm.r')}`);
  assert.equal(p2.angles.get('upper-arm.l'), -5);
});

test('blendIn/blendOut ramp the weight; outside the clip the arm is at rest', () => {
  const f = film();
  const arm = (fr: number) => characterPose(f, 0, fr).angles.get('upper-arm.l')!;
  assert.equal(arm(9), -5); // trước clip
  assert.equal(arm(74), -5); // sau clip (10 + 64)
  assert.equal(arm(10), -5); // t = 0: offset 0
  assert.ok(arm(12) > -5 && arm(12) < arm(16)); // đang nâng tay, trọng số đang tăng
  assert.ok(near(arm(73), -5, 1e-9)); // frame cuối: t = 1 → offset 0, không giật khi clip kết thúc
});

test('variants switch inside the clip (hand → fist) and only for the active hand', () => {
  const f = film();
  assert.equal(characterPose(f, 0, 30).variants.get('hand.l'), 'fist');
  assert.equal(characterPose(f, 0, 30).variants.get('hand.r'), undefined);
  assert.equal(characterPose(f, 1, 65).variants.get('hand.r'), 'fist');
});

test('repeat loops the clip: breath starts each cycle at rest', () => {
  const f = film();
  const torso = (fr: number) => characterPose(f, 0, fr).angles.get('torso')!;
  // c1 breath: 96 frame, repeat 2 → chu kỳ ~ 47.5 frame; giữa chu kỳ torso lệch tối đa ~2°.
  assert.equal(torso(0), 0);
  assert.ok(torso(24) > 1.9);
  assert.ok(Math.abs(torso(47)) < 0.05 || Math.abs(torso(48)) < 0.05);
});

test('continuity: joints move < 12°/frame and the root < 2 px/frame for both characters', () => {
  const f = film();
  for (const ci of [0, 1]) {
    for (let fr = 1; fr < N; fr++) {
      const a = characterPose(f, ci, fr - 1);
      const b = characterPose(f, ci, fr);
      for (const [bone, v] of b.angles) assert.ok(Math.abs(v - a.angles.get(bone)!) < 12, `c${ci} ${bone} frame ${fr}`);
      assert.ok(Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1]) < 2, `c${ci} root frame ${fr}`);
    }
  }
});

test('on screen: both characters touch the floor line; c2 is mirrored', () => {
  const f = film();
  const sf = sampleFrame(f, 0);
  const floorY = 1080 / 2 - (0 - 400); // camera y=400, zoom 1, depth 1 → điểm y=0 ở màn hình y=940
  for (const id of ['c1', 'c2']) {
    // Fixture: ground = hai bàn tay (anchor grip); tư thế nghỉ ở frame 0 (breath t=0).
    const ys = ['hand.l', 'hand.r'].map((b) => {
      const s = sf.sprites.find((x) => x.id === `${id}/${b}`)!;
      const asset = f.packs.get('test-pack')!.assets.get(s.asset)!;
      return spriteToScreen(s, asset.anchors['grip']!)[1];
    });
    assert.ok(near(Math.max(...ys), floorY, 1e-6), `${id} lowest contact at ${Math.max(...ys)}, floor ${floorY}`);
  }
  assert.ok(sf.sprites.filter((s) => s.id.startsWith('c2/')).every((s) => s.scaleX < 0));
  assert.ok(sf.sprites.filter((s) => s.id.startsWith('c1/')).every((s) => s.scaleX > 0));
});

test('draw order inside a character follows bone z', () => {
  const ids = sampleFrame(film(), 0).sprites.filter((s) => s.id.startsWith('c1/')).map((s) => s.id.slice(3));
  assert.ok(ids.indexOf('upper-arm.l') < ids.indexOf('pelvis')); // z −1 trước z 0
  assert.ok(ids.indexOf('torso') < ids.indexOf('upper-arm.r')); // z 1 trước z 2
});

test('squashX narrows only the target bone sprite, around its pivot, and returns to 1', () => {
  const squash = { schemaVersion: 1, id: 'squash', rig: 'biped-test', events: [], requires: {},
    channels: [{ bone: 'torso', prop: 'squashX', mode: 'absolute', keys: [{ t: 0, v: 1, ease: 'linear' }, { t: 0.5, v: 0.5, ease: 'linear' }, { t: 1, v: 1 }] }] };
  const cf = castFixture({ squash });
  cf.film.timeline = [{ character: 'c1', clip: 'squash', start: 0, durationFrames: 11, bind: {} }];
  const f = cf.validate();
  const sx = (fr: number, b: string) => sampleFrame(f, fr).sprites.find((s) => s.id === `c1/${b}`)!.scaleX;
  assert.equal(sx(5, 'torso'), 0.5);
  assert.equal(sx(5, 'pelvis'), 1);
  assert.equal(sx(10, 'torso'), 1);
  assert.equal(sampleFrame(f, 5).sprites.find((s) => s.id === 'c1/torso')!.scale, 1); // chiều dọc không đổi
});
