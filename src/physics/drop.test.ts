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
import { dropBake, SUBSTEPS } from './drop.ts';
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
