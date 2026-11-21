import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { characterState, contactWorld } from './character.ts';
import { contactFrame, solvedPoint } from './interaction.ts';

const packs = new Map(['sample-m0', 'demo-cast'].map((x) => [x, loadArtPack(`assets/${x}`)]));
const raw = () => JSON.parse(readFileSync('examples/films/m2-handover.json', 'utf8'));
const build = (data: unknown, tweakRig: (r: any) => void = () => {}): Film => {
  const m = loadPackMotion(packs.get('demo-cast')!);
  tweakRig(m.rig!.data);
  return validateFilm(data, packs, new Map([['demo-cast', m.rig!]]), new Map([['demo-cast', m.clips], ['sample-m0', new Map()]]));
};
const ci = (f: Film, id: string) => f.data.characters.findIndex((c) => c.id === id);
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/** Tại frame tiếp xúc, hai bàn tay tham gia trùng điểm đã giải. */
function handsMeet(f: Film) {
  const fr = contactFrame(f, 'handover');
  const P = solvedPoint(f, 'handover');
  for (const id of ['lan', 'tam']) assert.ok(dist(contactWorld(f, ci(f, id), fr, 'grip.l'), P) < 0.5, `${id} hand at frame ${fr}`);
  return { fr, P };
}

const base = build(raw());

test('contact frame = earliest grip/release of the clips using the point (receiver grips)', () => {
  const recv = base.data.timeline.find((t) => t.clip === 'receive')!;
  assert.equal(contactFrame(base, 'handover'), recv.start + Math.round(0.5 * (recv.durationFrames - 1)));
  handsMeet(base);
});

test('deterministic: the same film solves to the same point', () => {
  assert.deepEqual(solvedPoint(build(raw()), 'handover'), solvedPoint(base, 'handover'));
});

// Tổng quát hoá: chỉ đổi dữ liệu dàn cảnh, KHÔNG sửa tọa độ điểm gặp.
const variants: [string, (d: any) => void][] = [
  ['whole staging shifted 40 px right', (d) => {
    for (const c of d.characters) c.x += 40;
    for (const w of d.walks) w.toX += 40;
    for (const p of d.props) p.x += 40;
    for (const s of d.stage.surfaces) { if (s.id === 'table-top') { s.x0 += 40; s.x1 += 40; } }
  }],
  ['different body scales', (d) => {
    d.characters.find((c: any) => c.id === 'lan').scale = 1.2;
    d.characters.find((c: any) => c.id === 'tam').scale = 1.45;
  }],
  ['different prop (plant instead of lantern)', (d) => {
    const p = d.props.find((x: any) => x.id === 'lantern-1');
    p.asset = 'plant';
    p.scale = 0.8;
  }],
];
/** Cắt phim tới ngay sau đoạn trao đồ để biến thể chỉ kiểm bộ giải (phần đi về/đặt đồ dùng tọa độ cố định riêng). */
function untilHandover(d: any) {
  const recv = d.timeline.find((t: any) => t.clip === 'receive');
  const N = recv.start + recv.durationFrames + 20;
  d.output.durationFrames = N;
  d.timeline = d.timeline.filter((t: any) => t.start < N);
  for (const t of d.timeline) {
    if (t.start + t.durationFrames > N) {
      if (t.clip === 'idle-breath') { t.durationFrames = N - t.start; t.repeat = Math.max(1, Math.round(t.durationFrames / 96)); }
      else t.durationFrames = N - t.start;
    }
  }
  d.walks = d.walks.filter((w: any) => w.start + w.durationFrames <= N);
  d.camera.keys = d.camera.keys.filter((k: any) => k.frame < N);
}

for (const [name, mutate] of variants) {
  test(`generalizes without editing coordinates: ${name}`, () => {
    const d = raw();
    mutate(d);
    untilHandover(d);
    const f = build(d);
    const { P } = handsMeet(f);
    // Dời cảnh hay đổi tỷ lệ thì điểm phải đi theo; đổi đạo cụ thì không bắt buộc (neo là thân người).
    if (!name.startsWith('different prop')) assert.ok(dist(P, solvedPoint(base, 'handover')) > 1, 'point should follow the new staging');
  });
}

test('clearance is enforced: anchors at the feet force the point up until the held prop clears the floor', () => {
  const d = raw();
  d.points.handover.anchors = [
    { character: 'lan', bone: 'foot.l', anchor: 'sole' },
    { character: 'tam', bone: 'foot.l', anchor: 'sole' },
  ];
  untilHandover(d);
  const f = build(d);
  const { P } = handsMeet(f);
  const bottom = P[1] - 166 * f.data.props.find((p) => p.id === 'lantern-1')!.scale; // quai đèn cao 166 px art trên đáy
  assert.ok(bottom >= -1e-6, `lantern bottom ${bottom}`);
  assert.ok(P[1] > 100, 'point must have been lifted well above the feet');
});

test('solved at the contact frame while the receiver is still walking', () => {
  const d = raw();
  // tam đến muộn: vẫn đang bước ở frame tiếp xúc.
  const w = d.walks.find((x: any) => x.character === 'tam' && x.start === 0);
  w.start = 160;
  d.timeline.find((t: any) => t.clip === 'wave').start = 40;
  const f = build(d);
  const { fr } = handsMeet(f);
  assert.ok(characterState(f, ci(f, 'tam'), fr).walk.step, 'tam must be mid-walk at the contact frame');
  // Điểm theo tư thế ở frame tiếp xúc khác với điểm nếu (sai) lấy ở đầu clip.
  const early = structuredClone(d);
  early.points.handover.frame = d.timeline.find((t: any) => t.clip === 'receive').start;
  let atStart: number[] | undefined;
  try {
    atStart = [...solvedPoint(build(early), 'handover')];
  } catch {
    atStart = undefined; // đầu clip có thể còn không khả thi — càng chứng tỏ phải giải tại frame tiếp xúc
  }
  if (atStart) assert.ok(dist(atStart, solvedPoint(f, 'handover')) > 1);
});

test('joint limits are part of feasibility: tighter elbow limits move the point, and the result respects them', () => {
  const tight = (r: any) => {
    // Đo thật: tam đạt forearm.l ≈ 122.5° đúng ở điểm gặp (đỉnh của cả phim); lan tối đa 117.1°.
    // Siết max 118° chỉ ràng buộc tư thế trao đồ → bộ giải phải dời điểm.
    for (const b of r.bones) if (b.id === 'forearm.l') b.limits = { min: b.limits.min, max: 118 };
  };
  const f = build(raw(), tight);
  const { fr } = handsMeet(f);
  for (const id of ['lan', 'tam']) assert.ok(characterState(f, ci(f, id), fr).angles.get('forearm.l')! <= 118 + 1e-9);
  assert.ok(dist(solvedPoint(f, 'handover'), solvedPoint(base, 'handover')) > 1);
});

test('INTERACTION_INFEASIBLE when the characters stand too far apart', () => {
  const d = raw();
  d.walks.find((w: any) => w.character === 'tam' && w.start === 0).toX = -420;
  assert.throws(() => build(d), code('INTERACTION_INFEASIBLE'));
});

test('FILM_UNKNOWN_REF: bind uses an undefined point; spec names an unknown character', () => {
  const d1 = raw();
  d1.timeline.find((t: any) => t.clip === 'give').bind.points.meet = { use: 'nowhere' };
  assert.throws(() => build(d1), code('FILM_UNKNOWN_REF'));
  const d2 = raw();
  d2.points.handover.reach[0].character = 'ghost';
  assert.throws(() => build(d2), code('FILM_UNKNOWN_REF'));
});
