/**
 * M3 việc 2 — hai cảnh thả qua ĐƯỜNG NẠP PHIM THẬT (loadFilm: đọc file, nạp pack, validate, bake):
 *   m3-drop        Tam · tay phải · chậu cây (collider hộp = khung art, mặc định) · sàn     · thả f160
 *   m3-drop-table  Lan · tay trái · đèn lồng (collider hull khai báo trong film)      · mặt bàn · thả f237
 * Mỗi cảnh: còn trong tay ở R−1; tại R kế thừa vị trí/góc/vận tốc theo quy ước của drop.ts; chạm đúng collider đích;
 * được đỡ; nằm yên trên mặt đích. Riêng hull: cùng phim đổi sang hộp bao cho điểm chạm khác ⇒ engine dùng hình khai báo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import { loadFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { contactWorld } from '../motion/character.ts';
import { propPivot, segmentAt } from '../motion/props.ts';
import { dropBake, REST_FRAMES, REST_SPEED_PX, REST_SPIN_DEG, SUBSTEPS, type DropBake } from './drop.ts';

const tmp = mkdtempSync(join(tmpdir(), 'ps-drop-'));
/** Nạp một biến thể dữ liệu của phim mẫu qua đúng loadFilm (ghi file tạm). */
const loadVariant = (id: string, mutate: (d: any) => void): Film => {
  const d = JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
  mutate(d);
  const p = join(tmp, `${id}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(d));
  return loadFilm(p, 'assets');
};

interface Scene { id: string; character: string; contact: string; prop: string; collider: 'box' | 'hull'; onto: string; release: number }
const SCENES: Scene[] = [
  { id: 'm3-drop', character: 'tam', contact: 'grip.r', prop: 'plant-1', collider: 'box', onto: 'floor', release: 160 },
  { id: 'm3-drop-table', character: 'lan', contact: 'grip.l', prop: 'lantern-1', collider: 'hull', onto: 'table-top', release: 237 },
];

/** Đỉnh collider trong khung pivot (px, y-lên, ×scale) — cùng định nghĩa với drop.ts (box = khung art). */
function vertsAroundPivot(film: Film, propId: string): V2[] {
  const prop = film.data.props.find((p) => p.id === propId)!;
  const a = film.assets.get(prop.asset)!;
  const col = film.data.physics.find((d) => d.prop === propId)!.body.collider;
  const art: V2[] = col?.type === 'hull' ? col.points : [[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]];
  return art.map((p) => { const l = artToLocal(p, a.pivot); return [l[0] * prop.scale, l[1] * prop.scale]; });
}
const lowestY = (verts: V2[], x: number, y: number, angle: number) => Math.min(...verts.map((v) => y + rotate(v, angle)[1]));

for (const s of SCENES) {
  test(`${s.id}: ${s.character} ${s.contact} drops ${s.prop} (${s.collider}) onto ${s.onto} — held at R−1, continuous at R, lands on the target, rests`, () => {
    const film = loadFilm(`examples/films/${s.id}.json`, 'assets');
    const spec = film.data.physics[0]!;
    assert.equal(film.data.physics.length, 1, 'one falling prop per scene in this batch');
    assert.deepEqual([spec.prop, spec.onto, spec.body.collider?.type ?? 'box'], [s.prop, s.onto, s.collider]);
    const b: DropBake = dropBake(film, spec.id);
    const R = b.releaseFrame, fps = film.data.output.fps, dt = 1 / fps;
    assert.equal(R, s.release);
    // còn trong tay ở R−1 (đúng nhân vật, đúng tay), rơi tự do từ R
    const ci = film.data.characters.findIndex((c) => c.id === s.character);
    const held = segmentAt(film, s.prop, R - 1);
    assert.ok(held.holders.length === 1 && held.holders[0]!.ci === ci && held.holders[0]!.contact === s.contact && !held.drop, JSON.stringify(held.holders));
    assert.equal(segmentAt(film, s.prop, R).drop, spec.id);
    assert.equal(segmentAt(film, s.prop, R).releasedBy?.contact, s.contact);
    // quy ước kế thừa: pivot(R−1), v = (pivot(R−1) − pivot(R−2))·fps, góc dàn cảnh, ω = 0; R = sau đúng 1 frame mô phỏng
    const pv = (fr: number) => propPivot(film, s.prop, fr, (c, k) => contactWorld(film, c, fr, k));
    const p1 = pv(R - 1), p2 = pv(R - 2);
    assert.deepEqual(b.init.pivot, p1);
    assert.ok(Math.abs(b.init.velocity[0] - (p1[0] - p2[0]) * fps) < 1e-9 && Math.abs(b.init.velocity[1] - (p1[1] - p2[1]) * fps) < 1e-9);
    const q = b.poses[0]!, g = spec.world.gravity * spec.world.pxPerMeter;
    assert.ok(Math.abs(q.x - (p1[0] + b.init.velocity[0] * dt)) < 1e-3, `x at R: ${q.x}`);
    const yExact = p1[1] + b.init.velocity[1] * dt - (g * dt * dt) / 2;
    assert.ok(Math.abs(q.y - yExact) <= (g * dt * dt) / (2 * SUBSTEPS) + 1e-3, `y at R: ${q.y} vs ${yExact}`);
    assert.ok(Math.abs(q.vx - b.init.velocity[0]) < 1e-3 && Math.abs(q.vy - (b.init.velocity[1] - g * dt)) < 1e-3);
    assert.equal(q.angle, film.data.props.find((p) => p.id === s.prop)!.rotation);
    // chạm đúng collider đích: điểm chịu xung lực ở bước con chạm đầu nằm trên mặt `onto`
    const surf = film.data.stage.surfaces.find((x) => x.id === s.onto)!;
    const hit = b.firstContactPoints.filter((p) => p.impulse > 0);
    assert.ok(hit.length > 0, 'first contact has loaded points');
    for (const p of hit) assert.ok(Math.abs(p.y - surf.y) <= 1 && p.x >= surf.x0 && p.x <= surf.x1, `contact (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) not on ${s.onto} y=${surf.y} [${surf.x0}, ${surf.x1}]`);
    assert.ok(b.poses.filter((p) => p.frame < b.firstContact.frame).every((p) => !p.touching && p.state === 'falling'));
    // được đỡ và nằm yên trên mặt đích (đáy collider = mặt, ±0,5 px lún cho phép)
    assert.ok(b.restFrame > b.firstContact.frame && b.restFrame < film.data.output.durationFrames - 1);
    for (let fr = b.restFrame - REST_FRAMES + 1; fr <= b.restFrame; fr++) {
      const r = b.poses[fr - R]!;
      assert.ok(r.supported && Math.hypot(r.vx, r.vy) <= REST_SPEED_PX + 1 && Math.abs(r.spin) <= REST_SPIN_DEG, `frame ${fr}: ${r.state}`);
    }
    const rest = b.poses[b.restFrame - R]!;
    const verts = vertsAroundPivot(film, s.prop);
    assert.ok(Math.abs(lowestY(verts, rest.x, rest.y, rest.angle) - surf.y) <= 0.5, `rest bottom ${lowestY(verts, rest.x, rest.y, rest.angle)} vs ${s.onto} ${surf.y}`);
    assert.ok(rest.x >= surf.x0 && rest.x <= surf.x1);
  });
}

test('scene matrix: two characters, both hands, two release frames, two collider shapes, floor and table', () => {
  const rows = SCENES.map((s) => { const f = loadFilm(`examples/films/${s.id}.json`, 'assets'); const b = dropBake(f, f.data.physics[0]!.id); return [s.character, s.contact, s.collider, s.onto, b.releaseFrame]; });
  for (let k = 0; k < 5; k++) assert.notEqual(rows[0]![k], rows[1]![k], `column ${k} must differ`);
  assert.notEqual(loadFilm('examples/films/m3-drop.json', 'assets').data.props.find((p) => p.id === 'plant-1')!.asset, loadFilm('examples/films/m3-drop-table.json', 'assets').data.props.find((p) => p.id === 'lantern-1')!.asset);
});

test('the declared hull is what Rapier collides with: the bounding box lands on different points', () => {
  const hull = loadFilm('examples/films/m3-drop-table.json', 'assets');
  const box = loadVariant('m3-drop-table', (d) => delete d.physics[0].body.collider);
  const bh = dropBake(hull, 'drop-lantern'), bb = dropBake(box, 'drop-lantern');
  const px = bh.init.pivot[0];
  const prop = hull.data.props.find((p) => p.id === 'lantern-1')!, a = hull.assets.get(prop.asset)!;
  // đáy hull: điểm art (24,170) và (66,170) → ±21·0,86 = ±18,06 px quanh pivot; đáy hộp: (0,170),(90,170) → ±38,7 px
  const xs = (b: DropBake) => b.firstContactPoints.filter((p) => p.impulse > 0).map((p) => p.x - px).sort((u, v) => u - v);
  const hullBase = [24, 66].map((x) => (x - a.pivot[0]) * prop.scale), boxBase = [0, a.width].map((x) => (x - a.pivot[0]) * prop.scale);
  xs(bh).forEach((x, k) => assert.ok(Math.abs(x - hullBase[k]!) < 0.05, `hull contact ${x} vs ${hullBase[k]}`));
  xs(bb).forEach((x, k) => assert.ok(Math.abs(x - boxBase[k]!) < 0.05, `box contact ${x} vs ${boxBase[k]}`));
  assert.equal(xs(bh).length, 2);
  assert.equal(xs(bb).length, 2);
});

test('box collider stays the default: an explicit {type:"box"} bakes exactly like the old films', () => {
  const base = dropBake(loadFilm('examples/films/m3-drop.json', 'assets'), 'drop-plant');
  const explicit = dropBake(loadVariant('m3-drop', (d) => (d.physics[0].body.collider = { type: 'box' })), 'drop-plant');
  assert.deepEqual(explicit.poses, base.poses);
  assert.deepEqual(explicit.firstContact, base.firstContact);
});

test('PHYSICS_COLLIDER: hull point outside the art frame, or a degenerate hull, is rejected with a clear code', () => {
  assert.throws(() => loadVariant('m3-drop-table', (d) => d.physics[0].body.collider.points.push([95, 10])), code('PHYSICS_COLLIDER'));
  assert.throws(() => loadVariant('m3-drop-table', (d) => (d.physics[0].body.collider.points = [[10, 10], [20, 20], [30, 30]])), code('PHYSICS_COLLIDER'));
  assert.throws(() => loadVariant('m3-drop-table', (d) => (d.physics[0].body.collider.points = [[10, 10], [20, 20]])), code('FILM_SCHEMA'));
});

// ─── Hậu kiểm Codex @181a08a: hull Rapier không dựng được; cận báo hụt quanh khối tâm ───────────────────────────────
import { RAPIER } from './rapier.ts';

test('thin hull Rapier cannot build (area 1.125 px²): PHYSICS_COLLIDER with the collider path, and the world is freed', () => {
  // theo dõi vòng đời World: mọi world đã tạo thân phải được free kể cả khi dựng collider thất bại
  const proto = RAPIER.World.prototype as any;
  const made = new Set<object>(), freed = new Set<object>();
  const create = proto.createRigidBody, free = proto.free;
  proto.createRigidBody = function (this: object, ...a: unknown[]) { made.add(this); return create.apply(this, a); };
  proto.free = function (this: object, ...a: unknown[]) { freed.add(this); return free.apply(this, a); };
  try {
    assert.throws(
      () => loadVariant('m3-drop-table', (d) => (d.physics[0].body.collider.points = [[0, 0], [90, 170], [45, 85.025]])),
      (e: Error) => /^PHYSICS_COLLIDER: film\.physics\[0\]\.body\.collider/.test(e.message) && /Rapier could not build/.test(e.message),
    );
    assert.ok(made.size >= 1 && [...made].every((w) => freed.has(w)), `worlds created ${made.size}, freed ${[...made].filter((w) => freed.has(w)).length}`);
  } finally {
    proto.createRigidBody = create;
    proto.free = free;
  }
  // engine vẫn dùng được sau lỗi; các ca đối chứng giữ nguyên
  assert.equal(dropBake(loadFilm('examples/films/m3-drop-table.json', 'assets'), 'drop-lantern').restFrame, 263);
  assert.throws(() => loadVariant('m3-drop-table', (d) => (d.physics[0].body.collider.points = [[10, 10], [20, 20], [30, 30]])), (e: Error) => /^PHYSICS_COLLIDER: film\.physics\[0\]\.body\.collider/.test(e.message));
  assert.throws(() => loadVariant('m3-drop-table', (d) => d.physics[0].body.collider.points.push([95, 10])), (e: Error) => /^PHYSICS_COLLIDER: film\.physics\[0\]\.body\.collider\.points\[10\]/.test(e.message));
});
