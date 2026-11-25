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
import { bodyParts, fallingHits, intersects, propPolygon } from './hits.ts';

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

test('box prop × Lan: Lan at x −35 — the pot clips her hand BETWEEN frames 164 and 165 (sweep); at x −34 it grazes past', () => {
  const hit = variant('m3-drop', lanAt(-35));
  assert.throws(hit.load, hitsError('plant-1', 'lan', 'hand.l', 165));
  const r = report(hit.data, 'm3-drop')[0]!;
  assert.deepEqual([r.hit!.frame, r.hit!.character, r.hit!.bone], [165, 'lan', 'hand.l']);
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
  assert.ok(g.nearestByCharacter.lan!.distance > 0 && g.nearestByCharacter.lan!.distance < 0.5, `graze ${g.nearestByCharacter.lan!.distance}`);
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
