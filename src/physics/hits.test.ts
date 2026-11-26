/**
 * M3 việc 5 — vật đang rơi trúng nhân vật, phát hiện trong validator trước render (qua loadFilm: file → validate → bake →
 * checkFallingProps). Mỗi cặp chỉ khác MỘT yếu tố dàn cảnh. Hai nhân vật (Lan, Tam), hai collider (hộp chậu, hull đèn).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFilm, type Film } from '../schema/film.ts';
import { dropBake } from './drop.ts';
import { bodyParts, fallingHits, intersects, lerpAngle, propPolygon, releaserContactWarnings } from './hits.ts';

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

// ─── Hậu kiểm Codex @e442d59: khoảng còn bay theo bước con (characterHitFlightWindow) ─────────────────────────────────
/**
 * Fixture trong STATE: từ m3-drop, chậu restitution 0 rơi lên ledge (y 20); Lan đứng trên stand (y −254) tại x, đi từ
 * f121 trong 96 frame tới x − 155 — tay trái Lan đưa lên ngang đường rơi của chậu. Yếu tố duy nhất khác giữa ba ca: x.
 */
const ledgeLan = (x: number) => variant('m3-drop', (d) => {
  d.stage.surfaces.push({ id: 'ledge', x0: -1300, x1: 1300, y: 20 }, { id: 'stand', x0: -1300, x1: 1300, y: -254 });
  d.physics[0].onto = 'ledge';
  d.physics[0].body.restitution = 0;
  const lan = d.characters.find((c: any) => c.id === 'lan'); lan.on = 'stand'; lan.x = x;
  Object.assign(d.walks.find((w: any) => w.character === 'lan'), { start: 121, durationFrames: 96, toX: x - 155 });
});

test('flight window: the ledge holds the pot from f165 substep 2/8; Lan x 20 is hit in flight (f164 8/8), x 20.9 only overlaps after the pot is held (f165 8/8) and is valid, x 21 is valid', () => {
  assert.throws(ledgeLan(20).load, (e: Error) => hitsError('plant-1', 'lan', 'upper-arm.l', 164)(e) && /substep 8\/8/.test(e.message));
  const held = ledgeLan(20.9);
  held.load(); // bản e442d59: PHYSICS_HITS_CHARACTER f165 bước 8/8 (khung tay giao chậu khi ledge đã đỡ từ bước 2/8)
  const f = { ...loadFilm('examples/films/m3-drop.json', 'assets'), data: held.data } as Film;
  const q = dropBake(f, 'drop-plant').poses.find((p) => p.frame === 165)!;
  // điểm tựa sau từng bước con, theo đúng tiêu chí "đỡ" của mô phỏng: bước 1 còn bay, bước 2..8 được ledge đỡ
  assert.deepEqual(q.subSupportedBy, [[], ...Array(7).fill(['surface:ledge'])]);
  assert.equal(fallingHits(f)[0]!.hit, null);
  ledgeLan(21).load();
});

/**
 * Bay lại sau khi đã được đỡ: từ m3-collide, Lan đưa đèn tới meet.x −125 (đi tới −255 trong 100 frame) — đèn đáp lên NÓC
 * chậu ở f310, chậu đỡ nó (f311–f319 đủ 8/8 bước con; vài bước con hở khi đèn lắc ở f320, f322), tới f323 bước 5 lăn khỏi
 * mép phải chậu và rơi xuống sàn. Sau khi thả chậu, Tam đi tiếp từ
 * f212 trong 120 frame tới x; yếu tố duy nhất khác giữa cặp: x.
 */
const rollOff = (x: number) => variant('m3-collide', (d) => {
  d.timeline[7].bind.points.meet.x = -125;
  Object.assign(d.walks.find((w: any) => w.character === 'lan'), { toX: -255, durationFrames: 100 });
  d.walks.push({ character: 'tam', start: 212, durationFrames: 120, toX: x });
});

test('flight window: support does not end the check — the lantern rolls off the pot it rested on and is checked again from the first unsupported substep', () => {
  const hit = rollOff(100);
  assert.throws(hit.load, (e: Error) => hitsError('lantern-1', 'tam', 'upper-arm.r', 323)(e) && /substep 5\/8/.test(e.message));
  const f = { ...loadFilm('examples/films/m3-collide.json', 'assets'), data: hit.data } as Film;
  const poses = dropBake(f, 'drop-lantern').poses;
  const held = (fr: number) => poses.find((p) => p.frame === fr)!.subSupportedBy.map((s) => s.join('+') || '-');
  for (const fr of [311, 315, 319]) assert.deepEqual(held(fr), Array(8).fill('prop:plant-1'), `f${fr} on the pot`);
  // f323: chậu còn đỡ bước 1–4, bước 5 rời nóc chậu — khoảng 4→5 là khoảng bay đầu tiên và tay Tam bị chạm ngay trong đó
  assert.deepEqual(held(323), [...Array(4).fill('prop:plant-1'), '-', '-', '-', '-']);
  const r = fallingHits(f).find((x) => x.drop === 'drop-lantern')!;
  assert.deepEqual([r.hit!.frame, r.hit!.substep, r.hit!.character, r.hit!.bone], [323, 5, 'tam', 'upper-arm.r']);
  rollOff(200).load(); // Tam đã đi xa hơn: đèn lăn xuống sàn không chạm ai
});

test('npm run validate shows the releaser warnings (film, drop, releaser, bone, frame, substep) and still exits 0', () => {
  const r = spawnSync(process.execPath, ['src/cli/validate.ts'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const warn = r.stdout.split('\n').filter((l) => l.startsWith('WARN '));
  const expect = ['m3-collide-miss', 'm3-collide', 'm3-drop'].flatMap((film) => [['foot.l', 3, '163.375'], ['foot.r', 4, '163.500']].map(([bone, k, t]) =>
    `WARN PHYSICS_RELEASER_NEW_CONTACT: ${film} film.physics(drop-plant) — "plant-1" overlaps a new region of its releaser tam: ${bone} at frame 164 substep ${k}/8 (t ${t}), before leaving tam's body; not blocked — review the 2.5D layering in the video (draw order only explains the picture)`));
  assert.deepEqual(warn, expect);
  // mỗi cảnh báo nằm ngay sau dòng OK của phim đó
  for (const film of ['m3-collide-miss', 'm3-collide', 'm3-drop']) {
    const lines = r.stdout.split('\n');
    const at = lines.indexOf(`OK examples/films/${film}.json`);
    assert.ok(lines[at + 1]!.includes(`: ${film} film.physics(drop-plant)`) && lines[at + 2]!.includes(`: ${film} film.physics(drop-plant)`), film);
  }
});

test('the warnings reuse the report computed by the validator (no second sweep)', () => {
  const f = loadFilm('examples/films/m3-drop.json', 'assets');
  assert.equal(fallingHits(f), fallingHits(f));
  assert.deepEqual(releaserContactWarnings(f).map((w) => w.match(/: (\S+) at frame (\d+) substep (\d)\/8/)!.slice(1)), [['foot.l', '164', '3'], ['foot.r', '164', '4']]);
  assert.deepEqual(releaserContactWarnings(loadFilm('examples/films/m3-drop-table.json', 'assets')), []);
});
