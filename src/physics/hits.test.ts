/**
 * M3 việc 5 — vật đang rơi trúng nhân vật, phát hiện trong validator trước render (qua loadFilm: file → validate → bake →
 * checkFallingProps). Mỗi cặp chỉ khác MỘT yếu tố dàn cảnh. Hai nhân vật (Lan, Tam), hai collider (hộp chậu, hull đèn).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFilm, type Film } from '../schema/film.ts';
import { dropBake } from './drop.ts';
import { bodyParts, fallingHits, intersects, lerpAngle, propPolygon } from './hits.ts';

const tmp = mkdtempSync(join(tmpdir(), 'ps-hits-'));
const variant = (id: string, edit: (d: any) => void): { load: () => Film; data: any } => {
  const d = JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
  edit(d);
  const p = join(tmp, `${id}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(d));
  return { load: () => loadFilm(p, 'assets'), data: d };
};
const hitsError = (prop: string, who: string, bone: string, frame: number) => (e: Error) =>
  e.message.startsWith(`PHYSICS_HITS_CHARACTER: film.physics(`) && e.message.includes(`frame ${frame} — falling "${prop}" hits ${who} (${bone})`);
const report = (data: any, base: string) => fallingHits({ ...loadFilm(`examples/films/${base}.json`, 'assets'), data } as Film);

/** Lan đứng yên (bỏ lần đi của Lan trong m3-drop), quay trái, tại x — yếu tố duy nhất khác giữa cặp. */
const lanAt = (x: number) => (d: any) => { d.walks = d.walks.filter((w: any) => w.character !== 'lan'); d.characters.find((c: any) => c.id === 'lan').x = x; };

test('box prop × Lan: Lan at x −35 — the pot clips her hand BETWEEN frames 164 and 165 (substep sweep); at x −34 it grazes past', () => {
  const hit = variant('m3-drop', lanAt(-35));
  assert.throws(hit.load, hitsError('plant-1', 'lan', 'hand.l', 165));
  const r = report(hit.data, 'm3-drop')[0]!;
  assert.deepEqual([r.hit!.frame, r.hit!.substep, r.hit!.character, r.hit!.bone], [165, 3, 'lan', 'hand.l']);
  assert.ok(r.hit!.t > 0 && r.hit!.t < 1, `hit inside the interval (t ${r.hit!.t})`);
  // ở cả hai frame nguyên vật KHÔNG giao bàn tay — chỉ phép quét giữa hai frame mới thấy
  const f = { ...loadFilm('examples/films/m3-drop.json', 'assets'), data: hit.data } as Film;
  const b = dropBake(f, 'drop-plant');
  const lan = f.data.characters.findIndex((c) => c.id === 'lan');
  for (const fr of [164, 165]) {
    const q = b.poses[fr - b.releaseFrame]!;
    assert.equal(intersects(propPolygon(f, 'drop-plant', [q.x, q.y], q.angle), bodyParts(f, lan, fr).find((p) => p.bone === 'hand.l')!.poly), false, `frame ${fr}`);
  }
  const graze = variant('m3-drop', lanAt(-34));
  graze.load(); // hợp lệ
  const g = report(graze.data, 'm3-drop')[0]!;
  assert.equal(g.hit, null);
  assert.deepEqual([g.nearestByCharacter.lan!.frame, g.nearestByCharacter.lan!.bone], [165, 'hand.l']);
  // đường đi theo bước con thật (không nội suy thẳng qua cú đáp): sượt 0,64 px
  assert.ok(g.nearestByCharacter.lan!.distance > 0 && g.nearestByCharacter.lan!.distance < 1, `graze ${g.nearestByCharacter.lan!.distance}`);
});

test('hull prop × Tam: Tam at x 418 the falling lantern enters his torso at f241; at x 420 it passes clear', () => {
  const hit = variant('m3-drop-table', (d) => (d.characters.find((c: any) => c.id === 'tam').x = 418));
  assert.throws(hit.load, hitsError('lantern-1', 'tam', 'torso', 241));
  const r = report(hit.data, 'm3-drop-table')[0]!;
  assert.ok(r.hit!.frame > r.releaseFrame, 'enters during the fall, not at the release');
  const graze = variant('m3-drop-table', (d) => (d.characters.find((c: any) => c.id === 'tam').x = 420));
  graze.load();
  const g = report(graze.data, 'm3-drop-table')[0]!;
  assert.equal(g.hit, null);
  assert.ok(g.nearestByCharacter.tam!.distance > 0, `Tam graze ${JSON.stringify(g.nearestByCharacter.tam)}`);
  assert.equal(r.drop, 'drop-lantern');
  assert.equal(loadFilm('examples/films/m3-drop-table.json', 'assets').data.physics[0]!.body.collider?.type, 'hull');
});

test('releasing hand: the prop overlaps the releaser at R (hand, and the body it is carried in front of) — allowed until it has left their body', () => {
  const f = loadFilm('examples/films/m3-drop.json', 'assets'); // hợp lệ
  const b = dropBake(f, 'drop-plant');
  const tam = f.data.characters.findIndex((c) => c.id === 'tam');
  const atR = b.poses[0]!;
  const P = propPolygon(f, 'drop-plant', [atR.x, atR.y], atR.angle);
  assert.ok(bodyParts(f, tam, b.releaseFrame).filter((p) => intersects(P, p.poly)).length > 0, 'overlaps Tam at the release frame');
  const r = fallingHits(f)[0]!;
  assert.deepEqual([r.releaser, r.hit, r.graceEnd], ['tam', null, null]); // chậu rơi trước chân Tam tới lúc chạm sàn
  const t = fallingHits(loadFilm('examples/films/m3-drop-table.json', 'assets'))[0]!;
  assert.deepEqual([t.releaser, t.hit, t.graceEnd?.frame], ['lan', null, 242]); // đèn rời cánh tay Lan ở f242
});

test('comes back: the lantern leaves Lan at f308, bounces off the pot and hits her own foot at f311 (walk.toX −350); −375 stays clear', () => {
  const back = variant('m3-collide', (d) => (d.walks.find((w: any) => w.character === 'lan').toX = -350));
  assert.throws(back.load, (e: Error) => hitsError('lantern-1', 'lan', 'foot.l', 311)(e) && /it had left lan's body at frame 308 and came back/.test(e.message));
  const ok = fallingHits(loadFilm('examples/films/m3-collide.json', 'assets')).find((x) => x.drop === 'drop-lantern')!;
  assert.deepEqual([ok.graceEnd?.frame, ok.hit], [308, null]);
});

test('all example films pass the check (no green film is rejected)', () => {
  for (const id of ['m3-drop', 'm3-drop-table', 'm3-collide', 'm3-collide-miss']) {
    for (const r of fallingHits(loadFilm(`examples/films/${id}.json`, 'assets'))) assert.equal(r.hit, null, `${id} ${r.drop}`);
  }
});

// ─── Hậu kiểm Codex @dfd1fd3: khoảng bay trong frame đáp; bao lồi hull; góc qua một vòng ─────────────────────────────
test('flight inside the landing frame: restitution 0, Lan at x −35 — the pot clips her hand at f165 substep 3/8 before touching the floor (6/8)', () => {
  const v = variant('m3-drop', (d) => { lanAt(-35)(d); d.physics[0].body.restitution = 0; });
  assert.throws(v.load, (e: Error) => hitsError('plant-1', 'lan', 'hand.l', 165)(e) && /substep 3\/8/.test(e.message));
});

test('hull hit test uses the convex hull, not the input point order (permuted lantern hull, Tam on a low stand at x 166)', () => {
  const stand = (perm: boolean) => variant('m3-drop-table', (d) => {
    d.stage.surfaces.push({ id: 'test-stand', x0: -1300, x1: 1300, y: -80 });
    const tam = d.characters.find((c: any) => c.id === 'tam'); tam.on = 'test-stand'; tam.x = 166;
    if (perm) { const p = d.physics[0].body.collider.points; d.physics[0].body.collider.points = [0, 3, 6, 9, 2, 5, 8, 1, 4, 7].map((i) => p[i]); }
  });
  stand(false).load();
  stand(true).load(); // cùng bao lồi ⇒ cùng kết quả (bản cũ: trúng torso f242)
  const a = report(stand(false).data, 'm3-drop-table')[0]!, b = report(stand(true).data, 'm3-drop-table')[0]!;
  assert.deepEqual(b.hit, a.hit);
  assert.equal(b.nearestByCharacter.tam!.distance, a.nearestByCharacter.tam!.distance);
});

test('angles: 360 / −360 at release and wrap-around across ±180° do not create a fake spin', () => {
  for (const rot of [360, -360]) {
    const v = variant('m3-drop-table', (d) => (d.props.find((p: any) => p.id === 'lantern-1').rotation = rot));
    v.load(); // bản cũ: trúng upper-arm.l f237
    const r = report(v.data, 'm3-drop-table')[0]!;
    const base = fallingHits(loadFilm('examples/films/m3-drop-table.json', 'assets'))[0]!;
    assert.deepEqual([r.hit, r.graceEnd?.frame], [base.hit, base.graceEnd?.frame], `rotation ${rot}`);
  }
});

test('angle interpolation takes the shortest way: equal angles 0/±360 and the ±180° boundary', () => {
  assert.equal(lerpAngle(360, 0, 0.5), 360); // góc dàn cảnh 360 và góc Rapier 0: cùng một hướng, không quay
  assert.equal(lerpAngle(-360, 0, 0.5), -360);
  assert.equal(((lerpAngle(179, -179, 0.5) % 360) + 360) % 360, 180); // qua biên ±180°: 2°, không phải 358°
  assert.equal(lerpAngle(-170, 170, 0.5), -180);
  assert.equal(lerpAngle(10, 30, 0.5), 20);
});

test('releaser contacts: an ongoing release contact is allowed; a NEW contact on another region is reported (not yet blocked); after leaving, a return is blocked', () => {
  // m3-drop: lúc buông chậu chồng tay/cánh tay/thân/hông/đùi của Tam (2,5D: đồ cầm trước người) — tiếp diễn hợp lệ.
  const r = fallingHits(loadFilm('examples/films/m3-drop.json', 'assets'))[0]!;
  assert.deepEqual(r.exemptAtRelease, ['forearm.r', 'hand.r', 'pelvis', 'shin.r', 'thigh.l', 'thigh.r', 'torso', 'upper-arm.r']);
  // chậu rơi ngang chân Tam đang bước: hai bàn chân (không chồng lúc buông) bắt đầu chồng — tiếp xúc MỚI, báo theo bước con
  assert.deepEqual(r.releaserNewContacts.map((c) => [c.bone, c.frame, c.substep]), [['foot.l', 164, 3], ['foot.r', 164, 4]]);
  assert.deepEqual([r.hit, r.graceEnd], [null, null]); // chưa chặn: chờ quyết định chiều sâu 2,5D
  // đèn rời hẳn Lan (f308) rồi quay lại trúng bàn chân: CHẶN
  const back = variant('m3-collide', (d) => (d.walks.find((w: any) => w.character === 'lan').toX = -350));
  assert.throws(back.load, (e: Error) => hitsError('lantern-1', 'lan', 'foot.l', 311)(e) && /substep 8\/8/.test(e.message) && /it had left lan's body at frame 308 and came back/.test(e.message));
});
