import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJsonFile } from '../core/errors.ts';
import { loadArtPack } from '../schema/art-pack.ts';
import { validateRig } from '../schema/rig.ts';
import { code } from '../schema/test-helpers.ts';
import { contactPoint, forwardKinematics, restPose, type PoseInput } from '../rig/pose.ts';
import { solveChain } from './ik.ts';

const pack = loadArtPack('assets/demo-cast');
const rig = validateRig(readJsonFile('assets/demo-cast/rig.json'), pack);
const apply = (base: PoseInput, ang: Map<string, number>): PoseInput => ({ angle: (b) => ang.get(b) ?? base.angle(b), variant: base.variant });
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

for (const ch of ['tam', 'lan']) {
  for (const chain of ['arm.l', 'arm.r', 'leg.l', 'leg.r']) {
    test(`${ch} ${chain}: contact lands exactly on reachable targets`, () => {
      const rest = restPose(rig, ch);
      const parts = forwardKinematics(rig, pack, ch, rest);
      const c = contactPoint(rig, parts, rig.data.ik![chain]!.contact);
      const S = parts.find((p) => p.bone === rig.data.ik![chain]!.upper)!.pos;
      // Đích trong vùng với tới: kéo contact về phía khớp gốc (f) rồi lệch ngang (g).
      for (const [f, g] of [[0.1, 10], [0.2, -12], [0.3, 20], [0.15, 0]] as const) {
        const ax = S[0] - c[0];
        const ay = S[1] - c[1];
        const n = Math.hypot(ax, ay);
        const target: [number, number] = [c[0] + ax * f - (ay / n) * g, c[1] + ay * f + (ax / n) * g];
        const [dx, dy] = [f, g];
        const pose = apply(rest, solveChain(rig, pack, ch, rest, chain, target, 1));
        const got = contactPoint(rig, forwardKinematics(rig, pack, ch, pose), rig.data.ik![chain]!.contact);
        assert.ok(near(got[0], target[0], 1e-6) && near(got[1], target[1], 1e-6), `${dx},${dy} → ${got}`);
      }
    });
  }
}

test('legs keep the foot flat (endWorldAngle 0) and the knee bends to the + side', () => {
  const rest = restPose(rig, 'lan');
  const parts = forwardKinematics(rig, pack, 'lan', rest);
  const c = contactPoint(rig, parts, 'sole.l');
  const pose = apply(rest, solveChain(rig, pack, 'lan', rest, 'leg.l', [c[0] + 15, c[1] + 40], 1));
  const after = forwardKinematics(rig, pack, 'lan', pose);
  assert.ok(near(after.find((p) => p.bone === 'foot.l')!.angle, 0));
  // Gối (pivot shin) nằm bên phải đường hông→cổ chân khi bend = +1 (góc dương = CCW).
  const hip = after.find((p) => p.bone === 'thigh.l')!.pos;
  const knee = after.find((p) => p.bone === 'shin.l')!.pos;
  const ankle = after.find((p) => p.bone === 'foot.l')!.pos;
  const cross = (ankle[0] - hip[0]) * (knee[1] - hip[1]) - (ankle[1] - hip[1]) * (knee[0] - hip[0]);
  assert.ok(cross > 0, `cross=${cross}`);
});

test('weight 0 leaves FK untouched; weight 0.5 is halfway in joint space', () => {
  const rest = restPose(rig, 'tam');
  const parts = forwardKinematics(rig, pack, 'tam', rest);
  const c = contactPoint(rig, parts, 'grip.l');
  const t: [number, number] = [c[0] + 20, c[1] + 50];
  assert.equal(solveChain(rig, pack, 'tam', rest, 'arm.l', t, 0).size, 0);
  const full = solveChain(rig, pack, 'tam', rest, 'arm.l', t, 1);
  const half = solveChain(rig, pack, 'tam', rest, 'arm.l', t, 0.5);
  for (const [b, v] of full) assert.ok(near(half.get(b)!, (rest.angle(b) + v) / 2, 1e-9));
});

test('IK_UNREACHABLE: target beyond arm reach, with distance in the message', () => {
  const rest = restPose(rig, 'tam');
  const s = forwardKinematics(rig, pack, 'tam', rest).find((p) => p.bone === 'upper-arm.l')!.pos;
  assert.throws(
    () => solveChain(rig, pack, 'tam', rest, 'arm.l', [s[0] + 400, s[1]], 1),
    (e: any) => code('IK_UNREACHABLE')(e) && /px too far/.test(e.message),
  );
});

test('RIG_IK_INVALID: unknown chain', () => {
  assert.throws(() => solveChain(rig, pack, 'tam', restPose(rig, 'tam'), 'tail', [0, 0], 1), code('RIG_IK_INVALID'));
});

test('approaching (w < 1): an out-of-reach target stretches the arm toward it; at w = 1 it fails closed', () => {
  const rest = restPose(rig, 'tam');
  const s = forwardKinematics(rig, pack, 'tam', rest).find((p) => p.bone === 'upper-arm.l')!.pos;
  const far: [number, number] = [s[0] + 400, s[1]];
  const half = solveChain(rig, pack, 'tam', rest, 'arm.l', far, 0.5);
  assert.ok(half.size > 0);
  // Ở w = 1 với đích đã kéo về tầm với tối đa, contact nằm đúng trên tia vai → đích.
  const full = solveChain(rig, pack, 'tam', rest, 'arm.l', far, 0.999999);
  const g = contactPoint(rig, forwardKinematics(rig, pack, 'tam', apply(rest, full)), 'grip.l');
  assert.ok(Math.abs(g[1] - s[1]) < 0.5 && g[0] > s[0], `grip=${g}`);
  assert.throws(() => solveChain(rig, pack, 'tam', rest, 'arm.l', far, 1), code('IK_UNREACHABLE'));
});

test('bend flip puts the elbow on the other side and still lands on the target', () => {
  const rest = restPose(rig, 'lan');
  const parts = forwardKinematics(rig, pack, 'lan', rest);
  const c = contactPoint(rig, parts, 'grip.l');
  const S = parts.find((p) => p.bone === 'upper-arm.l')!.pos;
  const t: [number, number] = [c[0] + 10, c[1] + 50];
  const side = (flip: boolean) => {
    const pose = apply(rest, solveChain(rig, pack, 'lan', rest, 'arm.l', t, 1, flip));
    const p2 = forwardKinematics(rig, pack, 'lan', pose);
    const e = p2.find((p) => p.bone === 'forearm.l')!.pos;
    const g = contactPoint(rig, p2, 'grip.l');
    assert.ok(Math.hypot(g[0] - t[0], g[1] - t[1]) < 1e-6);
    return Math.sign((t[0] - S[0]) * (e[1] - S[1]) - (t[1] - S[1]) * (e[0] - S[0]));
  };
  assert.equal(side(true), -side(false));
});
