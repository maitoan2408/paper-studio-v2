import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRig } from '../schema/rig.ts';
import { rigFixture } from '../schema/rig-fixture.ts';
import { contactPoint, forwardKinematics, restPose, standingHeight } from './pose.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
function setup() {
  const f = rigFixture();
  return { rig: validateRig(f.rig, f.pack), pack: f.pack };
}
const zeroPose = { angle: () => 0, variant: () => 'default' };

test('FK at zero angles stacks parts exactly along art anchors (y-up)', () => {
  const { rig, pack } = setup();
  const parts = forwardKinematics(rig, pack, 'stout', zeroPose);
  const at = (b: string) => parts.find((p) => p.bone === b)!.pos;
  // waist (40,5) trên pelvis pivot (40,40) → torso ở (0, +35): ở TRÊN gốc.
  assert.deepEqual(at('torso'), [0, 35]);
  // shoulder.l (15,10) trên torso pivot (50,120) → (−35, +110) so với torso.
  assert.deepEqual(at('upper-arm.l'), [-35, 145]);
  // elbow nằm DƯỚI vai đúng armL = 70 (art vẽ tay buông xuống).
  assert.deepEqual(at('forearm.l'), [-35, 75]);
});

test('positive joint angle swings a hanging arm toward +x (CCW)', () => {
  const { rig, pack } = setup();
  const pose = { angle: (b: string) => (b === 'upper-arm.l' ? 90 : 0), variant: () => 'default' };
  const parts = forwardKinematics(rig, pack, 'stout', pose);
  const elbow = parts.find((p) => p.bone === 'forearm.l')!.pos;
  assert.ok(near(elbow[0], -35 + 70) && near(elbow[1], 145), `elbow=${elbow}`);
  // Con kế thừa góc cha: forearm cũng có góc thế giới 90.
  assert.equal(parts.find((p) => p.bone === 'forearm.l')!.angle, 90);
});

test('same rig, two characters: limb lengths differ only through art', () => {
  const { rig, pack } = setup();
  const reach = (c: string) => {
    const parts = forwardKinematics(rig, pack, c, zeroPose);
    const sh = parts.find((p) => p.bone === 'upper-arm.r')!.pos;
    const wr = parts.find((p) => p.bone === 'hand.r')!.pos;
    return Math.hypot(wr[0] - sh[0], wr[1] - sh[1]);
  };
  assert.equal(reach('stout'), 70 + 60);
  assert.equal(reach('lanky'), 110 + 100);
});

test('standingHeight puts the lowest ground contact exactly on the surface, per character', () => {
  const { rig, pack } = setup();
  for (const c of ['stout', 'lanky']) {
    const h = standingHeight(rig, pack, c);
    const parts = forwardKinematics(rig, pack, c, restPose(rig, c));
    const low = Math.min(...rig.data.ground.map((g) => contactPoint(rig, parts, g)[1]));
    assert.ok(near(low + h, 0), `${c}: lowest contact at ${low + h}`);
  }
  // Fixture dùng hai tay buông làm ground (không có chân): độ cao khác nhau chỉ vì art khác nhau.
  assert.notEqual(standingHeight(rig, pack, 'lanky'), standingHeight(rig, pack, 'stout'));
});

test('unknown character / variant fail with codes', () => {
  const { rig, pack } = setup();
  assert.throws(() => forwardKinematics(rig, pack, 'ghost', zeroPose), /RIG_UNKNOWN_CHARACTER/);
  assert.throws(() => forwardKinematics(rig, pack, 'stout', { angle: () => 0, variant: (b) => (b === 'hand.l' ? 'point' : 'default') }), /ACTION_UNKNOWN_VARIANT/);
});
