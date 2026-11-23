/**
 * Thả tự do (M3 đợt 1). Dung sai theo đơn vị engine:
 *  - Rapier tính bằng f32 (WASM) theo mét; với pxPerMeter = 400, 1 ulp ở |x| ≈ 0.5 m ≈ 6e-8 m ≈ 2.4e-5 px.
 *    Sai số tích lũy qua 8 bước con nhỏ hơn 1e-3 px → dung sai vị trí 1e-3 px, vận tốc 1e-3 px/s.
 *  - Bước con h = dt/S = 1/(24·8) s. Vận tốc dưới trọng lực là tuyến tính: vy = vy0 − g·t đúng tới f32. Vị trí lệch khỏi
 *    parabol chính xác do rời rạc hóa; chặn trên của bộ tích phân bậc một qua 1 frame: g·h·dt/2 = g·dt²/(2S) ≈ 0.43 px
 *    ở cảnh này (đo được với Rapier 0.21: g·dt²/(8S) ≈ 0.11 px). Nhảy thật (vd. lấy pivot của R−2) ≈ 3 px → bị bắt.
 *  - Tiếp xúc: Rapier cho phép lún tối đa ~1 mm (allowed linear error) = 0.4 px ở 400 px/m → đáy không thấp hơn mặt sàn
 *    quá 0.5 px.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalSha256 } from '../core/hash.ts';
import { rotate } from '../core/space.ts';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { contactWorld } from '../motion/character.ts';
import { propPivot, propTimeline, segmentAt } from '../motion/props.ts';
import * as drop from './drop.ts';
import { dropBake, SUBSTEPS, type DropPose } from './drop.ts';
import { dropFixture } from './drop-fixtures.ts';
import { RAPIER, RAPIER_VERSION } from './rapier.ts';

const packs = new Map(['sample-m0', 'demo-cast'].map((x) => [x, loadArtPack(`assets/${x}`)]));
const motion = loadPackMotion(packs.get('demo-cast')!);
const raw = (id: string) => JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
const build = (d: unknown): Film =>
  validateFilm(d, packs, new Map([['demo-cast', motion.rig!]]), new Map([['demo-cast', motion.clips], ['sample-m0', new Map()]]));
const film = build(raw('m3-drop'));
const b = dropBake(film, 'drop-plant');
const R = b.releaseFrame;
const fps = film.data.output.fps;
const dt = 1 / fps;
const spec = film.data.physics[0]!;
const g = spec.world.gravity * spec.world.pxPerMeter; // px/s²
const held = (f: Film, fr: number) => propPivot(f, 'plant-1', fr, (ci, c) => contactWorld(f, ci, fr, c));

test('engine: rapier2d-deterministic-compat pinned to 0.21.0 (package.json exact) and loaded at that version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies['@dimforge/rapier2d-deterministic-compat'], RAPIER_VERSION);
  assert.equal(RAPIER.version(), RAPIER_VERSION);
  assert.equal(b.engine, `rapier2d-deterministic-compat@${RAPIER_VERSION}`);
});

test('release convention: held until R−1, free from R; the scene moves horizontally at release', () => {
  assert.ok(segmentAt(film, 'plant-1', R - 1).holders.length > 0 && !segmentAt(film, 'plant-1', R - 1).drop);
  assert.equal(segmentAt(film, 'plant-1', R).drop, 'drop-plant');
  assert.ok(Math.abs(b.init.velocity[0]) > 50, `hand carries the prop at ${b.init.velocity[0].toFixed(1)} px/s — not a clear horizontal motion`);
  const p1 = held(film, R - 1), p2 = held(film, R - 2);
  assert.deepEqual(b.init.pivot, p1);
  assert.ok(Math.abs(b.init.velocity[0] - (p1[0] - p2[0]) * fps) < 1e-9);
});

test('no jump and no lost momentum when the prop leaves the hand', () => {
  const p0 = b.init.pivot, v0 = b.init.velocity, s = b.poses[0]!;
  // x: không có lực ngang trước khi chạm → đúng v0·dt; vx giữ nguyên.
  assert.ok(Math.abs(s.x - (p0[0] + v0[0] * dt)) < 1e-3, `x jumped: ${s.x} vs ${p0[0] + v0[0] * dt}`);
  assert.ok(Math.abs(s.vx - v0[0]) < 1e-3, `horizontal speed lost: ${s.vx} vs ${v0[0]}`);
  // y: Euler bán ẩn với S bước con.
  const yExact = p0[1] + v0[1] * dt - (g * dt * dt) / 2;
  const disc = (g * dt * dt) / (2 * SUBSTEPS);
  assert.ok(Math.abs(s.y - yExact) <= disc + 1e-3, `y jumped: ${s.y} vs ${yExact} (±${disc.toFixed(3)} px discretisation)`);
  assert.ok(Math.abs(s.vy - (v0[1] - g * dt)) < 1e-3);
  assert.equal(s.angle, b.init.angle);
  // Trong lúc rơi tự do (trước khi chạm) vx giữ nguyên ở mọi frame.
  for (const q of b.poses.filter((q) => q.state === 'falling')) assert.ok(Math.abs(q.vx - v0[0]) < 1e-3, `frame ${q.frame}: vx ${q.vx}`);
});

test('camera motion does not change the world-space simulation', () => {
  const d = raw('m3-drop');
  d.camera.keys = [{ frame: 0, x: 300, y: 200, zoom: 0.8, ease: 'linear' }, { frame: 150, x: -400, y: 500, zoom: 1.9, ease: 'inOutSine' }, { frame: 239, x: 0, y: 330, zoom: 1.2 }];
  const other = dropBake(build(d), 'drop-plant');
  assert.deepEqual(other.poses, b.poses);
  assert.deepEqual(other.init, b.init);
});

test('handover: the giver letting go never starts a fall while the receiver still holds', () => {
  const h = raw('m2-handover');
  const giveIdx = h.timeline.findIndex((t: any) => t.clip === 'give');
  const f = build(h);
  assert.ok([...propTimeline(f).values()].flat().every((s) => !s.drop), 'no physics → no fall');
  const giverRelease = propTimeline(f).get('lantern-1')!.find((s, k, l) => k > 0 && s.holders.length < l[k - 1]!.holders.length && s.holders.length > 0)!;
  assert.equal(f.data.characters[giverRelease.holders[0]!.ci]!.id, 'tam', 'receiver keeps the lantern');
  h.physics = [{ ...spec, id: 'bad', prop: 'lantern-1', release: giveIdx }];
  assert.throws(() => build(h), code('PHYSICS_NOT_FREE'));
});

test('controlled place never triggers a free fall; referencing it from physics is a conflict', () => {
  const p = raw('m2-plant');
  const f = build(p);
  const list = propTimeline(f).get('plant-1')!;
  assert.ok(list.every((s) => !s.drop));
  const place = p.timeline.find((t: any) => t.clip === 'place');
  assert.deepEqual(list.at(-1)!.rest, [place.bind.place.x, 246]);
  p.physics = [{ ...spec, release: p.timeline.indexOf(place) }];
  assert.throws(() => build(p), code('PHYSICS_CONFLICT'));
  // Lần buông cuối không có place và không có drop: vẫn PROP_FLOATING như M2.
  const m = raw('m3-drop');
  m.physics = [];
  assert.throws(() => build(m), code('PROP_FLOATING'));
});

test('seeking straight to a frame gives the same SceneFrame as playing sequentially; the bake is reproducible', () => {
  const a = build(raw('m3-drop'));
  const picks = [239, R + 3, R, b.landFrame, R - 1, b.restFrame + 5];
  const direct = new Map(picks.map((fr) => [fr, canonicalSha256(sampleFrame(a, fr))]));
  const c = build(raw('m3-drop'));
  for (let fr = 0; fr < c.data.output.durationFrames; fr++) {
    const h = canonicalSha256(sampleFrame(c, fr));
    if (direct.has(fr)) assert.equal(h, direct.get(fr), `frame ${fr}`);
  }
  assert.deepEqual(dropBake(c, 'drop-plant'), dropBake(a, 'drop-plant'));
});

test('the prop never sinks through the floor and stops drifting once at rest', () => {
  const prop = film.data.props.find((p) => p.id === 'plant-1')!;
  const asset = film.assets.get(prop.asset)!;
  const floorY = film.data.stage.surfaces.find((s) => s.id === spec.onto)!.y;
  const corners = [[0, 0], [asset.width, 0], [0, asset.height], [asset.width, asset.height]].map(([x, y]) => [(x! - asset.pivot[0]) * prop.scale, (asset.pivot[1] - y!) * prop.scale] as [number, number]);
  for (const q of b.poses) {
    const low = Math.min(...corners.map((c) => q.y + rotate(c, q.angle)[1]));
    assert.ok(low >= floorY - 0.5, `frame ${q.frame}: bottom ${(floorY - low).toFixed(3)} px below the floor`);
  }
  assert.ok(b.landFrame > R && b.restFrame > b.landFrame && b.restFrame < film.data.output.durationFrames - 1);
  const rest = b.poses[b.restFrame - R]!;
  for (const q of b.poses.slice(b.restFrame - R + 1)) {
    assert.deepEqual([q.x, q.y, q.angle, q.vx, q.vy, q.spin, q.state], [rest.x, rest.y, rest.angle, 0, 0, 0, 'rest'], `frame ${q.frame} drifted`);
  }
  // Trước khi khóa: ≥ REST_FRAMES frame liên tiếp gần như đứng yên (không khóa khi còn đang trượt).
  for (const q of b.poses.slice(b.restFrame - R - 11, b.restFrame - R + 1)) assert.ok(Math.hypot(q.vx, q.vy) <= 2 && Math.abs(q.spin) <= 2, `frame ${q.frame}`);
});

const errs: [string, (d: any) => void][] = [
  // phim kết thúc khi chậu còn đang rơi
  ['PHYSICS_NOT_AT_REST', (d) => {
    d.output.durationFrames = 170; d.camera.keys[1].frame = 169;
    d.timeline = d.timeline.filter((t: any) => t.start < 170).map((t: any) => ({ ...t, durationFrames: Math.min(t.durationFrames, 170 - t.start), ...(t.clip === 'idle-breath' ? { repeat: 1 } : {}) }));
    d.walks = d.walks.filter((w: any) => w.start + w.durationFrames <= 170);
  }],
  // mặt đỡ không nằm dưới chỗ thả
  ['PHYSICS_NO_LANDING', (d) => (d.physics[0].onto = 'table-top')],
  // nhặt lại sau khi rơi: chưa hỗ trợ ở đợt 1
  ['PHYSICS_REGRIP', (d) => d.timeline.push({ character: 'tam', clip: 'pick-up', start: 200, durationFrames: 30, bind: { active: 'l', roles: { item: 'plant-1' } }, layer: 2 })],
  // trỏ vào mục timeline không có sự kiện buông
  ['PHYSICS_NO_RELEASE', (d) => (d.physics[0].release = d.timeline.findIndex((t: any) => t.clip === 'carry'))],
  ['FILM_UNKNOWN_REF', (d) => (d.physics[0].prop = 'cup')],
  ['FILM_SCHEMA', (d) => (d.physics[0].world.gravity = -9.81)],
];
for (const [c, mutate] of errs) {
  test(`${c} (drop)`, () => {
    const d = raw('m3-drop');
    mutate(d);
    assert.throws(() => build(d), code(c));
  });
}

test('draw order stays continuous at release: the falling prop keeps its slot in front of the releaser (no pop behind the legs)', () => {
  const slot = (fr: number) => {
    const ids = sampleFrame(film, fr).sprites.map((s) => s.id);
    const i = ids.indexOf('plant-1');
    return [ids[i - 1], ids[i + 1]];
  };
  const before = slot(R - 1);
  assert.equal(before[1], 'tam/hand.r', 'held prop is drawn just before the gripping hand');
  for (const fr of [R, R + 1, b.landFrame, b.restFrame, film.data.output.durationFrames - 1]) assert.deepEqual(slot(fr), before, `frame ${fr}`);
});

// ─── Tiếp đất: lần chạm đầu, được đỡ, nằm yên (fixture riêng — cảnh gốc ở trên giữ làm đối chứng) ─────────────────
const plantAsset = film.assets.get(film.data.props.find((p) => p.id === 'plant-1')!.asset)!;
const PS = film.data.props.find((p) => p.id === 'plant-1')!.scale;
const HW = (plantAsset.width * PS) / 2; // pivot = giữa đáy chậu ⇒ ở góc 0, x của pivot là tâm ngang, y là đáy
const corners = [[-HW, 0], [HW, 0], [-HW, plantAsset.height * PS], [HW, plantAsset.height * PS]] as [number, number][];
const lowest = (q: DropPose) => Math.min(...corners.map((c) => q.y + rotate(c, q.angle)[1]));
const highest = (q: DropPose) => Math.max(...corners.map((c) => q.y + rotate(c, q.angle)[1]));
const HH = (plantAsset.height * PS) / 2;
const centerY = (q: DropPose) => q.y + rotate([0, HH], q.angle)[1];
const at = (poses: DropPose[], fr: number) => poses.find((q) => q.frame === fr)!;
/**
 * Phim fixture KHÔNG bake (để xem diễn biến cả khi bake bị từ chối): TOÀN BỘ dữ liệu fixture (walks, surfaces, physics…)
 * trên art/rig/clip đã nạp của cảnh gốc. Fixture chỉ đổi số liệu của các mục đã có nên khớp schema; test "unbaked = bake"
 * bên dưới đối chiếu với validateFilm + dropBake ở các fixture bake được.
 */
const unbaked = (name: string): { f: Film; d: drop.DropTrace } => {
  const fx = dropFixture(name);
  const f: Film = { ...film, data: fx };
  return { f, d: drop.simulateDrop(f, fx.physics[0]) };
};
const calmWindowSupported = (poses: DropPose[], restFrame: number) => {
  for (let fr = restFrame - drop.REST_FRAMES + 1; fr <= restFrame; fr++) {
    const q = at(poses, fr);
    assert.ok(q.supported && Math.hypot(q.vx, q.vy) <= drop.REST_SPEED_PX + 1e-9, `frame ${fr}: rest lock needs support and calm (${q.state}, ${Math.hypot(q.vx, q.vy).toFixed(2)} px/s)`);
  }
};

test('baseline m3-drop: first contact inside f165 (substep 6/8), supported from f166, rest at f178 — unchanged', () => {
  assert.deepEqual(b.firstContact, { frame: 165, substep: 6, time: 164.75 });
  assert.equal(b.landFrame, 165);
  assert.equal(b.restFrame, 178);
  calmWindowSupported(b.poses, b.restFrame);
  assert.ok(b.poses.filter((q) => q.frame < 165).every((q) => q.state === 'falling' && !q.touching));
});

test('bounce (restitution 0.65): the first impact is kept even though the pot is back in the air at the end of that frame', () => {
  const bb = dropBake(build(dropFixture('m3-drop-bounce')), 'drop-plant');
  const f164 = at(bb.poses, 164), f165 = at(bb.poses, 165);
  // diễn biến: đi xuống nhanh ở f164, đã bật lên ở f165
  assert.ok(f164.vy < -800 && f164.state === 'falling' && !f164.touching, `f164 ${f164.vy}`);
  assert.ok(f165.vy > 500, `f165 must already move up after the bounce (vy ${f165.vy})`);
  assert.ok(lowest(f165) > 1, 'f165 is drawn in the air above the floor');
  // sự kiện: chạm đầu trong bước con 6 của f165 — không phải lúc rơi lại / nằm yên (bản cũ: 176)
  assert.deepEqual(bb.firstContact, { frame: 165, substep: 6, time: 164.75 });
  assert.equal(bb.landFrame, 165);
  assert.ok(f165.touching && !f165.supported && f165.state === 'airborne');
  // đối chiếu vận tốc: đạn đạo từ f164 (khe 23.85 px, vy −814.9) chạm tại t* ∈ (bước con 5, bước con 6] của f165
  const g = spec.world.gravity * spec.world.pxPerMeter, gap = lowest(f164), v = -f164.vy;
  const tStar = 164 + ((-v + Math.sqrt(v * v + 2 * g * gap)) / g) * fps;
  assert.ok(tStar > bb.firstContact.time - 1 / SUBSTEPS && tStar <= bb.firstContact.time, `ballistic contact ${tStar.toFixed(3)} vs substep end ${bb.firstContact.time}`);
  // bay lại lên không: đã từng chạm (airborne, không phải falling), không được đỡ, không tiếp xúc; bay tự do: quay đều,
  // tâm khối có gia tốc đúng −g (sai phân bậc hai của Euler bán ẩn = −g·dt² chính xác tới f32)
  for (let fr = 166; fr <= 172; fr++) {
    const q = at(bb.poses, fr);
    assert.ok(q.state === 'airborne' && !q.touching && !q.supported, `frame ${fr}: ${q.state}`);
    if (fr >= 167) {
      const p = at(bb.poses, fr - 1), pp = at(bb.poses, fr - 2);
      assert.ok(Math.abs(q.spin - p.spin) < 1e-3, `frame ${fr}: spin changes in free flight`);
      assert.ok(Math.abs(centerY(q) - 2 * centerY(p) + centerY(pp) + g * dt * dt) < 1e-2, `frame ${fr}: centre not in free flight`);
    }
  }
  assert.ok(at(bb.poses, 168).vy > 0 && at(bb.poses, 169).vy < 0, 'apex between f168 and f169');
  // nằm yên chỉ khóa khi được đỡ và đứng yên đủ REST_FRAMES
  assert.ok(bb.restFrame > 172);
  calmWindowSupported(bb.poses, bb.restFrame);
  assert.ok(at(bb.poses, bb.restFrame).supported && lowest(at(bb.poses, bb.restFrame)) >= -0.5);
});

for (const [name, surfaceId] of [['m3-drop-edge-land', 'ledge'], ['m3-drop-edge-stool', 'stool-top']] as const) {
  test(`${name}: starts outside the left edge in mid-air, lands on "${surfaceId}" and rests there (not PHYSICS_NO_LANDING at f160)`, () => {
    const fb = build(dropFixture(name));
    const s = fb.data.stage.surfaces.find((x) => x.id === surfaceId)!;
    const e = dropBake(fb, 'drop-plant');
    const f160 = at(e.poses, 160);
    assert.ok(f160.x < s.x0 && lowest(f160) > s.y + 20, `f160: centre ${f160.x.toFixed(2)} outside x0 ${s.x0}, still ${(lowest(f160) - s.y).toFixed(1)} px up`);
    const first = at(e.poses, e.firstContact.frame);
    assert.ok(first.touching && e.poses.filter((q) => q.frame < e.firstContact.frame).every((q) => !q.touching));
    assert.ok(first.x - HW < s.x0, 'first contact while overhanging the edge');
    const r = at(e.poses, e.restFrame);
    assert.ok(r.supported && Math.abs(lowest(r) - s.y) <= 0.5, `rests on top of ${surfaceId}: bottom ${lowest(r).toFixed(3)} vs ${s.y}`);
    assert.ok(r.x >= s.x0 && r.x <= s.x1 && Math.abs(r.angle) < 1, `centre ${r.x.toFixed(2)} over [${s.x0}, ${s.x1}], angle ${r.angle.toFixed(2)}`);
    calmWindowSupported(e.poses, e.restFrame);
  });
}

test('edge miss: the pot never reaches the surface — PHYSICS_NO_LANDING only once it is below the top with no way back up', () => {
  assert.throws(() => build(dropFixture('m3-drop-edge-miss')), (err: Error) => /PHYSICS_NO_LANDING/.test(err.message) && /frame 169/.test(err.message) && /never touched "ledge"/.test(err.message));
  const { d } = unbaked('m3-drop-edge-miss');
  assert.equal(d.firstContact, null);
  assert.equal(d.missFrame, 169);
  assert.ok(d.poses.every((q) => !q.touching && !q.supported && q.state === 'falling'));
  assert.ok(Math.max(...d.poses.map((q) => q.x + HW)) < -100, 'right side of the pot never gets over the surface');
  // không kết luận sớm: kết luận ở frame ĐẦU TIÊN mà cận trên bảo thủ (tâm + bán kính ngoại tiếp; vy ≤ 0 nên không cộng
  // độ cao đạn đạo) xuống dưới mặt đỡ; ở f160 (bản cũ đã báo lỗi) vật còn cao hơn mặt ~106 px.
  const R2 = Math.hypot(HW, HH);
  for (const q of d.poses) assert.ok(q.vy < 0 && (centerY(q) + R2 < -drop.LAND_GAP_PX) === (q.frame === 169), `frame ${q.frame}`);
  assert.ok(lowest(at(d.poses, 160)) > 100 && highest(at(d.poses, 169)) < -1);
});

test('edge slide: the engine sees the pot touch and stand on the ledge before it tips off the end', () => {
  assert.throws(() => build(dropFixture('m3-drop-edge-slide')), (err: Error) => /PHYSICS_NO_LANDING/.test(err.message) && /first touched "ledge" at frame 165/.test(err.message));
  const { d } = unbaked('m3-drop-edge-slide');
  const x1 = -190;
  assert.deepEqual(d.firstContact, { frame: 165, substep: 6, time: 164.75 });
  const sup = d.poses.filter((q) => q.supported).map((q) => q.frame);
  assert.ok(sup.length >= 2 && sup[0]! > 165 && d.lastSupported === sup.at(-1)!, `supported frames ${sup}`);
  assert.ok(d.missFrame > d.lastSupported && d.restFrame === -1);
  for (const q of d.poses.filter((q) => q.frame > d.lastSupported)) assert.ok(!q.supported && q.state === 'airborne', `frame ${q.frame}`);
  // trọng tâm đã ra ngoài mép (tâm pivot ở bên phải x1) và chậu lật theo chiều kim đồng hồ khi trượt khỏi mép
  const sl = at(d.poses, d.lastSupported), end = d.poses.at(-1)!;
  assert.ok(sl.x > x1 && sl.x - HW < x1, `standing on the end of the ledge at f${d.lastSupported}`);
  assert.ok(end.angle < sl.angle - 10 && highest(end) < -1, `tipped (${sl.angle.toFixed(1)}° → ${end.angle.toFixed(1)}°) and fell below`);
});

// ─── Hậu kiểm Codex @fc643d5: tự ngủ khi trượt, cờ đỡ khi bật ở bước con cuối ───────────────────────────────────────
const gh = (spec.world.gravity * spec.world.pxPerMeter) / (fps * SUBSTEPS); // g·h: ngưỡng vận tốc tách của "đang đỡ"

test('sliding without friction to the end of a ledge: the pot keeps sliding and falls off (not frozen by engine sleep)', () => {
  assert.throws(() => build(dropFixture('m3-drop-slide-off')), (err: Error) =>
    /PHYSICS_NO_LANDING/.test(err.message) && /frame 222/.test(err.message) && /first touched "ledge" at frame 165/.test(err.message) && /last supported at frame 214/.test(err.message));
  const { d } = unbaked('m3-drop-slide-off');
  const x1 = -180;
  assert.equal(d.restFrame, -1);
  assert.ok(d.poses.every((q) => q.state !== 'rest'));
  // Trượt đều: ma sát 0 ⇒ không lực ngang; từ f170 tới khi trọng tâm qua mép vx giữ nguyên (bản cũ: 37,68 → 0 ở f179).
  const v = at(d.poses, 170).vx;
  assert.ok(Math.abs(v - 37.68) < 0.05, `slide speed ${v}`);
  const crossing = d.poses.find((q) => q.x > x1)!.frame;
  // dung sai 0,05 px/s (0,13 %): bộ giải tiếp xúc f32 trôi 37,676 → 37,71 px/s sau ~40 frame; dừng thật (bản cũ) là −37,68.
  for (let fr = 170; fr < crossing; fr++) {
    const q = at(d.poses, fr);
    assert.ok(q.supported && Math.abs(q.vx - v) < 0.05 && Math.abs(q.angle) < 0.1, `frame ${fr}: ${q.state} vx ${q.vx.toFixed(3)} angle ${q.angle.toFixed(3)}`);
    assert.ok(q.separation !== null && Math.abs(q.separation) <= gh, `frame ${fr}: separation ${q.separation}`);
  }
  // Diễn biến khỏi mép: tâm qua mép → còn đỡ bằng phần đáy chồm trên mép, lật dần → rời đỡ → rơi dưới mặt → lỗi f222.
  assert.ok(crossing > 190 && crossing < d.lastSupported, `centre crosses the edge at f${crossing}, last supported f${d.lastSupported}`);
  assert.equal(d.lastSupported, 214);
  for (const q of d.poses.filter((q) => q.frame > d.lastSupported)) assert.ok(!q.supported && q.state === 'airborne', `frame ${q.frame}`);
  const end = d.poses.at(-1)!;
  assert.equal(end.frame, 222);
  assert.ok(end.angle < -10 && highest(end) < -1, `tipped ${end.angle.toFixed(1)}°, top ${highest(end).toFixed(1)}`);
});

test('sliding without friction on a long ledge: still moving at the last frame ⇒ PHYSICS_NOT_AT_REST (no fake rest lock)', () => {
  assert.throws(() => build(dropFixture('m3-drop-slide-long')), (err: Error) => /PHYSICS_NOT_AT_REST/.test(err.message) && /speed 37\.7 px\/s/.test(err.message));
  const { d } = unbaked('m3-drop-slide-long');
  assert.equal(d.restFrame, -1);
  assert.equal(d.missFrame, -1);
  const last = d.poses.at(-1)!;
  assert.equal(last.frame, 239);
  assert.ok(last.supported && Math.abs(last.vx - 37.68) < 0.01, `f239: ${last.state} vx ${last.vx}`);
  for (const q of d.poses.filter((q) => q.frame >= 170)) assert.ok(q.supported && Math.abs(q.vx - last.vx) < 0.05, `frame ${q.frame}: vx ${q.vx}`);
});

test('bounce whose first impact is the last substep of f165: impact recorded, but the pot is separating, so not supported', () => {
  const e = dropBake(build(dropFixture('m3-drop-bounce-late')), 'drop-plant');
  assert.deepEqual(e.firstContact, { frame: 165, substep: 8, time: 165 });
  const f165 = at(e.poses, 165);
  assert.ok(f165.touching, 'impulse in the last substep is a contact event');
  assert.ok(f165.vy > 600, `bouncing off: vy ${f165.vy.toFixed(1)}`);
  assert.ok(!f165.supported && f165.state === 'airborne', `f165 is moving away from the ledge at ${f165.vy.toFixed(1)} px/s but is ${f165.state}`);
  assert.ok(f165.separation! > 600, `separation along the contact normal ${f165.separation} px/s`);
  assert.ok(e.restFrame > 165);
  calmWindowSupported(e.poses, e.restFrame);
  for (let fr = e.restFrame - drop.REST_FRAMES + 1; fr <= e.restFrame; fr++) assert.ok(Math.abs(at(e.poses, fr).separation!) <= gh, `frame ${fr}`);
});

test('real support is kept: resting, settling after a small hop, and standing on an edge while tipping all stay supported', () => {
  // cảnh gốc: chạm f165 (bật nhẹ, vₙ 91,7 > g·h ⇒ chưa đỡ), đỡ liên tục từ f166 tới khóa nghỉ f178
  assert.ok(!at(b.poses, 165).supported);
  for (let fr = 166; fr <= b.restFrame; fr++) {
    const q = at(b.poses, fr);
    assert.ok(q.supported && Math.abs(q.separation!) <= gh, `baseline frame ${fr}: separation ${q.separation}`);
  }
  // chạm mép rồi lật: các frame đỡ bằng góc đáy trên mép vẫn được đỡ (vₙ tại điểm tiếp xúc ≈ 0 dù vật đang quay)
  const { d } = unbaked('m3-drop-edge-slide');
  const sup = d.poses.filter((q) => q.supported);
  assert.deepEqual(sup.map((q) => q.frame), [166, 167, 168]);
  assert.ok(sup.some((q) => Math.abs(q.spin) > 100), 'tipping fast while supported');
  for (const q of sup) assert.ok(Math.abs(q.separation!) <= gh, `edge-slide frame ${q.frame}: separation ${q.separation}`);
});

test('test helper: the unbaked trace equals the validated bake for every fixture that bakes', () => {
  for (const name of ['m3-drop-bounce', 'm3-drop-bounce-late', 'm3-drop-edge-land', 'm3-drop-edge-stool']) {
    const e = dropBake(build(dropFixture(name)), 'drop-plant');
    const { d } = unbaked(name);
    assert.deepEqual(d.poses, e.poses, name);
    assert.deepEqual(d.firstContact, e.firstContact, name);
  }
});

// ─── Hậu kiểm Codex @cabaf67: "đỡ" phải xét đúng điểm chịu xung lực, không lấy min vₙ của mọi điểm ─────────────────
test('bounce-tumble (friction 1.5, ledge y −20): at f182 one corner is hit and bounces away, the other corner has no force — not supported', () => {
  const e = dropBake(build(dropFixture('m3-drop-bounce-tumble')), 'drop-plant');
  const f182 = at(e.poses, 182), f183 = at(e.poses, 183);
  assert.ok(f182.touching, 'f182: impulse on the ledge in the last substep');
  assert.ok(!f182.supported && f182.state === 'airborne', `f182 is bouncing off the ledge but is ${f182.state}`);
  assert.ok(f182.separation! > 200, `f182 separation at the loaded corner ${f182.separation} px/s`);
  // bằng chứng từng điểm ở bước con cuối: một góc chịu xung lực và đang tách > 200 px/s, góc kia xung lực 0
  const pts = f182.points!;
  assert.equal(pts.length, 2);
  const hit = pts.filter((p) => p.impulse > 0), idle = pts.filter((p) => p.impulse === 0);
  assert.ok(hit.length === 1 && idle.length === 1, JSON.stringify(pts));
  assert.ok(hit[0]!.separation > 200, JSON.stringify(pts));
  // f183 bay tự do: không tiếp xúc, không đỡ, quay đều (không mô-men từ mặt)
  assert.ok(!f183.touching && !f183.supported && f183.state === 'airborne', `f183 ${f183.state}`);
  assert.ok(Math.abs(f183.spin - f182.spin) < 1e-3, `f183 spin ${f183.spin} vs f182 ${f182.spin}`);
  assert.ok(e.restFrame > 183);
  calmWindowSupported(e.poses, e.restFrame);
});
