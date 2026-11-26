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

// ─── Hậu kiểm Codex @a401f62: đặt có kiểm soát (bind.place) vật đã nhặt lại ở góc khác 0 (pickupRotatedPlacement) ──
/** Đáy thật của đạo cụ = điểm thấp nhất của khung art theo scale và góc thế giới ở frame (tính độc lập với props.ts). */
function bottomY(f: Film, prop: string, fr: number): number {
  const p = f.data.props.find((x) => x.id === prop)!;
  const a = f.assets.get(p.asset)!;
  const pv = propPivot(f, prop, fr, hand(f, fr));
  const r = (propAngle(f, prop, fr) * Math.PI) / 180;
  return pv[1] + Math.min(...([[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]] as V2[]).map((c) => {
    const l = artToLocal(c, a.pivot);
    return l[0] * p.scale * Math.sin(r) + l[1] * p.scale * Math.cos(r);
  }));
}
/** Fixture trong STATE: m3-pickup-pot, N = 744, Tam đặt chậu (đang nằm −90°) lại lên bàn bằng clip place, x tùy chọn. */
const placePot = (x: number) => variant('m3-pickup-pot', (d) => {
  d.output.durationFrames = 744;
  d.timeline.push({ character: 'tam', clip: 'place', start: 464, durationFrames: 280, layer: 1, bind: { active: 'l', roles: { item: 'plant-1' }, place: { surface: 'table-top', x } } });
});
const TABLE_Y = 246 * 1.25;

test('rotated placement (fixture x −577.8): the lying pot is set ON the table — bottom at the table top at f675/f676 and after, hand on the anchor, pivot/angle continuous', () => {
  const v = placePot(-577.8);
  const f = v.load();
  const R = 464 + Math.round(0.76 * 279);
  assert.equal(R, 676);
  const seg = segmentAt(f, 'plant-1', R);
  assert.equal(seg.holders.length, 0);
  for (const fr of [R - 1, R, R + 1, 743]) assert.ok(Math.abs(bottomY(f, 'plant-1', fr) - TABLE_Y) <= ALIGN_TOLERANCE_PX, `bottom at f${fr}: ${bottomY(f, 'plant-1', fr).toFixed(3)} vs table ${TABLE_Y}`);
  // trong lúc hạ xuống (đang ở trên chỗ đặt) đáy không xuống dưới mặt bàn
  for (let fr = 600; fr < R; fr++) assert.ok(bottomY(f, 'plant-1', fr) >= TABLE_Y - ALIGN_TOLERANCE_PX || Math.abs(propPivot(f, 'plant-1', fr, hand(f, fr))[0] - -577.8) > 200, `f${fr}`);
  const owner = segmentAt(f, 'plant-1', R - 1).holders.at(-1)!;
  const pv0 = propPivot(f, 'plant-1', R - 1, hand(f, R - 1)), pv1 = propPivot(f, 'plant-1', R, hand(f, R));
  assert.ok(Math.hypot(pv1[0] - pv0[0], pv1[1] - pv0[1]) <= ALIGN_TOLERANCE_PX, `pivot jump ${pv1} ${pv0}`);
  assert.equal(propAngle(f, 'plant-1', R) - propAngle(f, 'plant-1', R - 1), 0);
  const off = anchorOffset(f, 'plant-1', owner.anchor, R), got = contactWorld(f, owner.ci, R, owner.contact);
  assert.ok(Math.hypot(got[0] - pv1[0] - off[0], got[1] - pv1[1] - off[1]) <= ALIGN_TOLERANCE_PX, 'hand on the anchor at the release');
});

test('upright control: placing the lantern (rest angle ≈ 0) keeps its pivot (= bottom) on the surface as before', () => {
  const v = variant('m3-pickup-lantern', (d) => {
    d.output.durationFrames = 760;
    d.timeline.push({ character: 'lan', clip: 'place', start: 520, durationFrames: 240, layer: 1, bind: { active: 'l', roles: { item: 'lantern-1' }, place: { surface: 'table-top', x: 300 } } });
  });
  const f = v.load();
  const R = 520 + Math.round(0.76 * 239);
  assert.equal(segmentAt(f, 'lantern-1', R).holders.length, 0);
  // góc nghỉ của đèn ≈ 0 (sai số float của Rapier) ⇒ pivot = đáy = mặt bàn, sai khác < 0,001 px
  const pv = propPivot(f, 'lantern-1', R, hand(f, R));
  assert.ok(Math.abs(pv[0] - 300) < 1e-9 && Math.abs(pv[1] - 246) < 1e-3, `${pv}`);
  assert.ok(Math.abs(bottomY(f, 'lantern-1', R) - 246) < 1e-3);
});

test('rotated placement out of reach fails closed: IK_UNREACHABLE at the place item, naming the raised rotated target', () => {
  // cùng fixture, đặt xa hơn (x −350, clip place 500 frame để không vượt tốc độ khớp trước): đích tay = anchor grip của
  // chậu nằm −90° khi ĐÁY chạm bàn ⇒ grip cao 358,5 (bản cũ 307,5 — đặt lún 51 px)
  const v = variant('m3-pickup-pot', (d) => {
    d.output.durationFrames = 964;
    d.timeline.push({ character: 'tam', clip: 'place', start: 464, durationFrames: 500, layer: 1, bind: { active: 'l', roles: { item: 'plant-1' }, place: { surface: 'table-top', x: -350 } } });
  });
  assert.throws(v.load, code('IK_UNREACHABLE', /film\.timeline\[8\] frame \d+ \(place\) — tam\.arm\.l: target is [\d.]+ px too far .*reaching "plant-1" anchor "grip" at \(-292\.2, 358\.5\)/));
});

// ─── Hậu kiểm Codex @46d0218: mặt đỡ hữu hạn khi đặt (pickupPlacementSurfaceExtent) ─────────────────────────────────
/** Điểm thấp nhất của khung art đã xoay CHỈ TRONG dải x ∈ [x0, x1] của mặt đỡ (cắt đa giác theo hai đường dọc) — tính
 *  độc lập với props.ts. null nếu khung không giao dải. */
function lowestOver(f: Film, prop: string, fr: number, x0: number, x1: number): { x: number; y: number } | null {
  const p = f.data.props.find((x) => x.id === prop)!;
  const a = f.assets.get(p.asset)!;
  const pv = propPivot(f, prop, fr, hand(f, fr));
  const r = (propAngle(f, prop, fr) * Math.PI) / 180;
  let poly: V2[] = ([[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]] as V2[]).map((c) => {
    const l = artToLocal(c, a.pivot);
    return [pv[0] + l[0] * p.scale * Math.cos(r) - l[1] * p.scale * Math.sin(r), pv[1] + l[0] * p.scale * Math.sin(r) + l[1] * p.scale * Math.cos(r)] as V2;
  });
  for (const [keep, xc] of [[(x: number) => x >= x0, x0], [(x: number) => x <= x1, x1]] as const) {
    const out: V2[] = [];
    poly.forEach((P, i) => {
      const Q = poly[(i + 1) % poly.length]!;
      if (keep(P[0])) out.push(P);
      if (keep(P[0]) !== keep(Q[0])) { const t = (xc - P[0]) / (Q[0] - P[0]); out.push([xc, P[1] + t * (Q[1] - P[1])]); }
    });
    poly = out;
  }
  if (poly.length === 0) return null;
  const low = poly.reduce((m, q) => (q[1] < m[1] ? q : m));
  return { x: low[0], y: low[1] };
}
/** Fixture trong STATE: m3-pickup-place, chậu collider hull (nghỉ ở −91,808896°), kệ "shelf" y 327,5 từ x0 −670 tới x1. */
const shelfPot = (x1: number, edit?: (d: any) => void) => variant('m3-pickup-place', (d) => {
  d.physics[0].body.collider = { type: 'hull', points: [[0, 0], [114, 0], [120, 190], [0, 190]] };
  d.stage.surfaces.push({ id: 'shelf', x0: -670, x1, y: 327.5 });
  d.timeline[8].bind.place.surface = 'shelf';
  edit?.(d);
});
const SHELF_Y = 327.5;

for (const [x1, name] of [[-550, 'short shelf (x1 −550): the lowest corner overhangs the edge'], [-400, 'wide shelf (x1 −400)']] as const) {
  test(`placement on a finite surface, ${name} — the part of the pot over [x0, x1] touches the shelf at f675, f676, f743`, () => {
    const f = shelfPot(x1).load();
    assert.ok(Math.abs(propAngle(f, 'plant-1', 676) - -91.808896) < 1e-5, `${propAngle(f, 'plant-1', 676)}`);
    for (const fr of [675, 676, 743]) {
      const low = lowestOver(f, 'plant-1', fr, -670, x1)!;
      assert.ok(Math.abs(low.y - SHELF_Y) <= ALIGN_TOLERANCE_PX, `f${fr}: lowest point over the shelf (${low.x.toFixed(3)}, ${low.y.toFixed(6)}) vs ${SHELF_Y}`);
    }
    // tay trùng anchor khi buông, pivot/góc liên tục 675 → 676, nằm yên tới hết phim
    const owner = segmentAt(f, 'plant-1', 675).holders.at(-1)!;
    const a = propPivot(f, 'plant-1', 675, hand(f, 675)), b = propPivot(f, 'plant-1', 676, hand(f, 676)), c = propPivot(f, 'plant-1', 743, hand(f, 743));
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) <= ALIGN_TOLERANCE_PX && Math.hypot(c[0] - b[0], c[1] - b[1]) === 0);
    const off = anchorOffset(f, 'plant-1', owner.anchor, 676), got = contactWorld(f, owner.ci, 676, owner.contact);
    assert.ok(Math.hypot(got[0] - b[0] - off[0], got[1] - b[1] - off[1]) <= ALIGN_TOLERANCE_PX);
  });
}

test('placement that cannot rest on the surface in its fixed pose fails at the place action (PROP_PLACE_OFF_SURFACE)', () => {
  // kệ kết thúc đúng tại x đặt: chậu nằm −90° chìa toàn thân sang phải, phần nằm trên kệ rộng chưa tới 0,5 px
  const v = variant('m3-pickup-place', (d) => {
    d.stage.surfaces.push({ id: 'shelf', x0: -670, x1: -577.8, y: 327.5 });
    d.timeline[8].bind.place.surface = 'shelf';
  });
  assert.throws(v.load, code('PROP_PLACE_OFF_SURFACE', /film\.timeline\[8\]\.bind\.place frame 676 — "plant-1" at angle -90\.000° placed at x=-577\.8 overlaps "shelf" \(x∈\[-670, -577\.8\]\) by 0\.000 px/));
});
