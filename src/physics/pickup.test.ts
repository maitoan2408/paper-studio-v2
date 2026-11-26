/**
 * M3 việc 6 — nhặt lại đạo cụ sau khi đã rơi tự do và nằm yên. Mọi ca qua loadFilm (file → validate → bake → kiểm).
 * Hai cảnh mẫu: m3-pickup-pot (Tam, tay trái, chậu hộp NẰM NGHIÊNG −90° trên bàn — góc khác góc dàn cảnh 0°) và
 * m3-pickup-lantern (Lan, tay trái, đèn hull đứng trên bàn sau khi rơi).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFilm, type Film } from '../schema/film.ts';
import { dropBake, dropPose, simulateWorld } from './drop.ts';
import { anchorOffset, ALIGN_TOLERANCE_PX, propAngle, propPivot, propTimeline, segmentAt } from '../motion/props.ts';
import { contactWorld } from '../motion/character.ts';
import { sampleFrame } from '../scene/sample.ts';
import { canonicalSha256 } from '../core/hash.ts';
import { artToLocal, type V2 } from '../core/space.ts';

const tmp = mkdtempSync(join(tmpdir(), 'ps-pickup-'));
const raw = (id: string) => JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
const variant = (id: string, edit: (d: any) => void) => {
  const d = raw(id);
  edit(d);
  const p = join(tmp, `${id}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(d));
  return { load: () => loadFilm(p, 'assets'), data: d };
};
const code = (c: string, re?: RegExp) => (e: Error) => e.message.startsWith(`${c}:`) && (!re || re.test(e.message));
const hand = (f: Film, fr: number) => (ci: number, c: string) => contactWorld(f, ci, fr, c);

/** Lần nhặt lại (đoạn có picked bắt đầu ở frame grip) của đạo cụ. */
function pickup(f: Film, prop: string) {
  const seg = propTimeline(f).get(prop)!.find((s) => s.picked && s.from === s.picked.frame)!;
  const h = seg.holders.at(-1)!;
  return { G: seg.from, drop: seg.picked!.drop, ci: h.ci, contact: h.contact, anchor: h.anchor, who: f.data.characters[h.ci]!.id };
}

/** Số đo qua lúc nắm: sai số tay–anchor ở G (so với vật nằm yên ở G−1), độ lệch pivot/góc G−1 → G. */
function measure(f: Film, prop: string) {
  const p = pickup(f, prop);
  const b = dropBake(f, p.drop);
  const rest = dropPose(f, p.drop, p.G - 1);
  const want: V2 = [rest.x + anchorOffset(f, prop, p.anchor, p.G - 1)[0], rest.y + anchorOffset(f, prop, p.anchor, p.G - 1)[1]];
  const got = contactWorld(f, p.ci, p.G, p.contact);
  const pv0 = propPivot(f, prop, p.G - 1, hand(f, p.G - 1)), pv1 = propPivot(f, prop, p.G, hand(f, p.G));
  return {
    ...p, b, rest,
    handErr: Math.hypot(got[0] - want[0], got[1] - want[1]),
    pivotJump: Math.hypot(pv1[0] - pv0[0], pv1[1] - pv0[1]),
    angleJump: Math.abs(propAngle(f, prop, p.G) - propAngle(f, prop, p.G - 1)),
  };
}

for (const [film, prop, who, restAngle] of [['m3-pickup-pot', 'plant-1', 'tam', -90], ['m3-pickup-lantern', 'lantern-1', 'lan', 0]] as const) {
  test(`${film}: ${who} picks "${prop}" up after it rests — hand on the rotated anchor, pivot and angle continuous, follows the hand`, () => {
    const f = loadFilm(`examples/films/${film}.json`, 'assets');
    const m = measure(f, prop);
    assert.equal(m.who, who);
    // vật nằm yên và được đỡ ngay trước lúc nắm; bake của lần rơi kết thúc ở G−1 (thân rời thế giới từ G)
    assert.equal(m.rest.state, 'rest');
    assert.deepEqual(m.rest.supportedBy, ['surface:table-top']);
    assert.ok(m.b.restFrame > 0 && m.b.restFrame < m.G, `rest ${m.b.restFrame} < grip ${m.G}`);
    assert.equal(m.b.poses.at(-1)!.frame, m.G - 1);
    assert.throws(() => dropPose(f, m.drop, m.G), code('PHYSICS_FRAME', /picked up at frame/));
    assert.ok(Math.abs(m.rest.angle - restAngle) < 0.5, `rest angle ${m.rest.angle}`);
    // tay tới đúng anchor đã xoay; qua frame nắm pivot liên tục trong dung sai, góc không đổi
    assert.ok(m.handErr <= ALIGN_TOLERANCE_PX, `hand–anchor ${m.handErr}`);
    assert.ok(m.pivotJump <= ALIGN_TOLERANCE_PX, `pivot jump ${m.pivotJump}`);
    assert.equal(m.angleJump, 0);
    // sau grip: góc giữ góc nằm yên, vật bám tay nắm ở mọi frame còn cầm
    for (let fr = m.G; fr < f.data.output.durationFrames; fr++) {
      if (segmentAt(f, prop, fr).holders.length === 0) break;
      assert.equal(propAngle(f, prop, fr), m.rest.angle);
      const pv = propPivot(f, prop, fr, hand(f, fr)), off = anchorOffset(f, prop, m.anchor, fr), h = contactWorld(f, m.ci, fr, m.contact);
      assert.ok(Math.hypot(pv[0] + off[0] - h[0], pv[1] + off[1] - h[1]) < 1e-6, `frame ${fr}`);
    }
  });

  test(`${film}: seeking straight past the grip gives the same SceneFrame as playing in order`, () => {
    const seq = loadFilm(`examples/films/${film}.json`, 'assets');
    const N = seq.data.output.durationFrames;
    const G = pickup(seq, prop).G;
    const inOrder = Array.from({ length: N }, (_, i) => canonicalSha256(sampleFrame(seq, i)));
    for (const fr of [G, G + 1, G + 30, N - 1]) {
      const fresh = loadFilm(`examples/films/${film}.json`, 'assets');
      assert.equal(canonicalSha256(sampleFrame(fresh, fr)), inOrder[fr], `frame ${fr}`);
    }
  });
}

test('the rotated anchor matters: on the pot lying at −90° the scene angle (0°) would put the grip far from the hand', () => {
  const f = loadFilm('examples/films/m3-pickup-pot.json', 'assets');
  const m = measure(f, 'plant-1');
  const p = f.data.props.find((x) => x.id === 'plant-1')!;
  const a = f.assets.get(p.asset)!;
  const v = artToLocal(a.anchors['grip']!, a.pivot);
  const unrotated: V2 = [m.rest.x + v[0] * p.scale, m.rest.y + v[1] * p.scale]; // anchor theo góc dàn cảnh 0°
  const got = contactWorld(f, m.ci, m.G, m.contact);
  assert.equal(p.rotation, 0);
  assert.ok(Math.hypot(got[0] - unrotated[0], got[1] - unrotated[1]) > 50, 'scene-angle anchor is not where the hand grips');
  assert.ok(m.handErr <= ALIGN_TOLERANCE_PX);
});

test('after the grip the old body leaves the world: a prop falling later does not hit it (m3-collide, pot picked before the lantern drop)', () => {
  // Đối chứng thế giới (không qua validator: Tam không với tới chậu trên sàn — chỉ xét mô phỏng). Gốc: đèn va chậu f309.
  const base = loadFilm('examples/films/m3-collide.json', 'assets');
  const d = raw('m3-collide');
  d.timeline.push({ character: 'tam', clip: 'pick-up', start: 250, durationFrames: 30, bind: { active: 'l', roles: { item: 'plant-1' } }, layer: 2 });
  const f = { ...base, data: d } as Film;
  const G = 250 + Math.round(0.31 * 29);
  const w = simulateWorld(f);
  assert.equal(w.get('drop-plant')!.poses.at(-1)!.frame, G - 1);
  assert.deepEqual(simulateWorld(base).get('drop-lantern')!.contacts.map((c) => c.other), ['prop:plant-1', 'surface:floor']);
  assert.deepEqual(w.get('drop-lantern')!.contacts.map((c) => c.other), ['surface:floor']);
});

test('rejected: picking up while the prop is still flying — the error names the drop, frame and state', () => {
  // m3-pickup-pot: chậu buông f213, nằm yên f258; nắm ở f230 (bắt đầu pick-up sớm hơn) khi chậu còn đang bay/nảy
  const v = variant('m3-pickup-pot', (d) => { const it = d.timeline.find((t: any) => t.clip === 'pick-up' && t.start > 200); it.start = 230 - Math.round(0.31 * (it.durationFrames - 1)); it.layer = 2; });
  assert.throws(v.load, code('PHYSICS_PICKUP_NOT_AT_REST', /film\.timeline\[6\] frame 230 \(drop-plant\) — "plant-1" can only be picked up while it rests and is supported: at frame 229 it is (falling|airborne|supported) .*it has not come to rest since its release at frame 213/));
});

test('rejected: picking up a prop that had rested but was woken by another prop', () => {
  // m3-collide: chậu nằm yên từ f180, đèn đánh thức f309; Tam nắm chậu ở f315 (lớp riêng) — chưa nằm yên lại
  const v = variant('m3-collide', (d) => d.timeline.push({ character: 'tam', clip: 'pick-up', start: 306, durationFrames: 30, bind: { active: 'l', roles: { item: 'plant-1' } }, layer: 2 }));
  assert.throws(v.load, code('PHYSICS_PICKUP_NOT_AT_REST', /film\.timeline\[8\] frame 315 \(drop-plant\) — .*at frame 314 it is supported .*it came to rest at frame 180 but was woken at frame 309 \(pushed by prop:lantern-1\)/));
});

test('rejected: picking up a resting prop out of reach — IK_UNREACHABLE at the pick-up item and frame, naming the prop anchor', () => {
  // m3-drop: chậu nằm yên trên sàn từ f178; Tam (x −50) với tay trái tới anchor grip ở độ cao 57,8 px
  const v = variant('m3-drop', (d) => d.timeline.push({ character: 'tam', clip: 'pick-up', start: 200, durationFrames: 30, bind: { active: 'l', roles: { item: 'plant-1' } }, layer: 2 }));
  assert.throws(v.load, code('IK_UNREACHABLE', /film\.timeline\[6\] frame \d+ \(pick-up\) — tam\.arm\.l: target is [\d.]+ px too far .*reaching "plant-1" anchor "grip" at \(-173\.5, 57\.8\)/));
});

test('anchorOffset follows propAngle on a resting dropped prop (m3-drop-bounce: pot lying at −90°)', async () => {
  const { dropFixture } = await import('./drop-fixtures.ts');
  const f = { ...loadFilm('examples/films/m3-drop.json', 'assets'), data: dropFixture('m3-drop-bounce') } as Film;
  const ang = propAngle(f, 'plant-1', 230);
  assert.ok(Math.abs(ang + 90) < 0.01, `${ang}`);
  const off = anchorOffset(f, 'plant-1', 'grip', 230); // bản cũ: (0, 57.8) theo góc dàn cảnh 0°
  const r = (ang * Math.PI) / 180;
  assert.ok(Math.hypot(off[0] - -57.8 * Math.sin(r), off[1] - 57.8 * Math.cos(r)) < 1e-6 && off[0] > 57.79, `${off}`);
});
