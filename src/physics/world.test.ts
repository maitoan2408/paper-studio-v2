/**
 * M3 việc 3 — hai đạo cụ trong CÙNG thế giới Rapier theo thời gian phim (qua loadFilm: đọc file, validate, bake).
 *   m3-collide       Tam thả chậu (A, hộp) f160 → nằm yên; Lan thả đèn (B, hull) f303 phía trên góc chậu → B va A.
 *   m3-collide-miss  Y hệt, chỉ dời chỗ Lan đứng và điểm thả của B sang trái 55 px → B rơi lệch, không chạm A.
 * Bằng chứng "chính va chạm làm A chuyển động lại": (1) hai phim trùng từng pose của A tới trước frame va; (2) ở đúng frame
 * va, A nhận xung lực từ B (pushes) và bị đánh thức (wakes) — mặt sàn tĩnh không bao giờ đánh thức; (3) trong phim lệch
 * A giữ nguyên pose khóa tới hết phim; (4) A dịch chuyển rõ rồi nằm yên lại.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalSha256 } from '../core/hash.ts';
import { loadFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { dropBake, simulateWorld, REST_FRAMES, REST_SPEED_PX, REST_SPIN_DEG, SUBSTEPS, type DropBake, type DropPose } from './drop.ts';

const tmp = mkdtempSync(join(tmpdir(), 'ps-world-'));
const raw = (id: string) => JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
const loadData = (d: unknown): Film => {
  const p = join(tmp, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(d));
  return loadFilm(p, 'assets');
};
const hit = loadFilm('examples/films/m3-collide.json', 'assets');
const miss = loadFilm('examples/films/m3-collide-miss.json', 'assets');
const A = (f: Film) => dropBake(f, 'drop-plant');
const B = (f: Film) => dropBake(f, 'drop-lantern');
const at = (b: DropBake, fr: number): DropPose => b.poses[fr - b.releaseFrame]!;
const pushBy = (q: DropPose, by: string) => q.pushes.find((p) => p.by === by)?.impulse ?? 0;

test('control pair: the two films differ only in where B is released (Lan stand point and meet x)', () => {
  const diff: string[] = [];
  const walk = (x: any, y: any, path: string) => {
    if (typeof x !== 'object' || x === null) { if (x !== y) diff.push(path); return; }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y?.[k], `${path}.${k}`);
  };
  walk(raw('m3-collide'), raw('m3-collide-miss'), '');
  assert.deepEqual(diff.sort(), ['.id', '.timeline.7.bind.points.meet.x', '.walks.1.toX'].sort());
  // cùng thế giới: hai drop, chung gravity/pxPerMeter, A hộp lên sàn, B hull lên sàn
  for (const f of [hit, miss]) assert.deepEqual(f.data.physics.map((d) => [d.id, d.prop, d.onto, d.body.collider?.type ?? 'box']), [['drop-plant', 'plant-1', 'floor', 'box'], ['drop-lantern', 'lantern-1', 'floor', 'hull']]);
});

test('A is at rest before B is released, in both films, with identical poses', () => {
  for (const f of [hit, miss]) {
    const a = A(f);
    assert.ok(a.poses.some((q) => q.state === 'rest' && q.frame < B(f).releaseFrame), 'A reaches rest before B is let go');
  }
  const firstRest = A(miss).restFrame; // phim lệch: khóa một lần, giữ tới hết phim
  assert.equal(A(miss).wakes.length, 0);
  assert.ok(firstRest < B(hit).releaseFrame);
  const vB = B(hit).releaseFrame;
  for (let fr = A(hit).releaseFrame; fr < vB; fr++) assert.deepEqual(at(A(hit), fr), at(A(miss), fr), `frame ${fr}`);
  // frame khóa: trạng thái thật (vận tốc dưới ngưỡng); từ frame sau: pose khóa, vận tốc đúng 0
  assert.equal(at(A(hit), firstRest).state, 'rest');
  for (let fr = firstRest + 1; fr < vB; fr++) {
    const q = at(A(hit), fr);
    assert.ok(q.state === 'rest' && q.vx === 0 && q.vy === 0 && q.spin === 0, `frame ${fr}: ${q.state}`);
  }
});

test('B hits A: first contact of the pair, A woken by the impulse from B, then A moves clearly and rests again', () => {
  const a = A(hit), b = B(hit);
  const ev = a.contacts.find((c) => c.other === 'prop:lantern-1')!;
  const evB = b.contacts.find((c) => c.other === 'prop:plant-1')!;
  assert.ok(ev && evB, 'contact event recorded on both sides');
  assert.deepEqual([ev.frame, ev.substep], [evB.frame, evB.substep], 'same instant seen from A and from B');
  assert.deepEqual([ev.frame, ev.substep, ev.time], [309, 6, 309 - 1 + 6 / SUBSTEPS]);
  assert.ok(b.contacts.indexOf(evB) === 0, 'B touches A before it touches the floor');
  // A: khóa nằm yên tới f308, ở f309 B đẩy (xung lực > 0) và A vượt ngưỡng nằm yên ⇒ đánh thức
  const before = at(a, ev.frame - 1), after = at(a, ev.frame);
  assert.equal(before.state, 'rest');
  assert.equal(pushBy(before, 'prop:lantern-1'), 0);
  assert.ok(pushBy(after, 'prop:lantern-1') > 0, 'impulse from B on A at the contact frame');
  assert.deepEqual(a.wakes, [{ frame: ev.frame, by: 'prop:lantern-1' }]);
  assert.ok(Math.hypot(after.vx, after.vy) > REST_SPEED_PX || Math.abs(after.spin) > REST_SPIN_DEG);
  assert.notEqual(after.state, 'rest');
  // chỉ xung lực từ đạo cụ mới đánh thức: trong cả quãng khóa, sàn đẩy A mỗi frame mà A không thức dậy
  for (let fr = a.poses.find((q) => q.state === 'rest')!.frame; fr < ev.frame; fr++) assert.ok(pushBy(at(a, fr), 'surface:floor') > 0 && at(a, fr).state === 'rest');
  // A dịch chuyển rõ (> 20 px) rồi nằm yên lại trên sàn; B đổi vận tốc tại đúng frame va
  const restPose = before, finalPose = at(a, a.restFrame);
  assert.ok(finalPose.x - restPose.x > 20, `A moved ${(finalPose.x - restPose.x).toFixed(2)} px`);
  assert.ok(a.restFrame > ev.frame && a.restFrame < hit.data.output.durationFrames - 1);
  assert.ok(Math.abs(finalPose.y) <= 0.5 && Math.abs(finalPose.angle) < 0.5, 'A upright on the floor again');
  for (let fr = a.restFrame - REST_FRAMES + 1; fr <= a.restFrame; fr++) assert.ok(at(a, fr).supported);
  const bBefore = at(b, ev.frame - 1), bAfter = at(b, ev.frame);
  assert.ok(Math.abs(bBefore.vx) < 1e-6 && Math.abs(bBefore.spin) < 1e-6 && bBefore.state === 'falling', `B in free fall before the hit (vx ${bBefore.vx}, spin ${bBefore.spin})`);
  assert.ok(Math.abs(bAfter.vx) > 100 && Math.abs(bAfter.spin) > 10, `B deflected: vx ${bAfter.vx.toFixed(1)}, spin ${bAfter.spin.toFixed(1)}`);
  assert.ok(B(hit).restFrame > ev.frame);
});

test('control: B falls clear of A — no contact between them, A keeps its locked pose to the end', () => {
  const a = A(miss), b = B(miss);
  assert.ok(!a.contacts.some((c) => c.other.startsWith('prop:')) && !b.contacts.some((c) => c.other.startsWith('prop:')));
  const lock = at(a, a.restFrame);
  for (const q of a.poses.filter((q) => q.frame > a.restFrame)) {
    assert.deepEqual([q.x, q.y, q.angle, q.vx, q.vy, q.spin, q.state], [lock.x, lock.y, lock.angle, 0, 0, 0, 'rest'], `frame ${q.frame}`);
    assert.equal(pushBy(q, 'prop:lantern-1'), 0);
  }
  assert.ok(b.restFrame > 0 && b.firstContact.frame > b.releaseFrame);
});

test('no early exclusion: B meets the ballistic miss test BEFORE hitting A, stays in the world, and still wakes A', () => {
  // Cùng phim va, chỉ đổi đích của B sang một kệ cao y=330 ngoài khung: B thỏa điều kiện hụt từ f307 (trước cú va f309).
  const d = raw('m3-collide');
  d.stage.surfaces.push({ id: 'shelf', y: 330, x0: -1250, x1: -1100 });
  d.physics[1].onto = 'shelf';
  assert.throws(() => loadData(d), (e: Error) => /PHYSICS_NO_LANDING: film\.physics\(drop-lantern\) frame 310/.test(e.message));
  const w = simulateWorld({ ...hit, data: d } as Film);
  const a = w.get('drop-plant')!, b = w.get('drop-lantern')!;
  const hitFrame = b.contacts.find((c) => c.other === 'prop:plant-1')!.frame;
  assert.equal(hitFrame, 309);
  assert.ok(b.missCandidates.filter((f) => f < hitFrame).length >= 1, `candidates ${b.missCandidates}`);
  assert.equal(b.missFrame, b.missCandidates.find((f) => f > hitFrame), 'verdict only after the last push from another prop');
  // quy tắc cũ (dừng ở ứng viên đầu) sẽ loại B ở f307 và A không bao giờ bị đánh thức; nay A vẫn bị B đánh thức ở f309
  assert.deepEqual(a.wakes, [{ frame: 309, by: 'prop:lantern-1' }]);
});

test('determinism: swapping the declaration order of the two props and drops gives the same poses/events by id', () => {
  const d = raw('m3-collide');
  d.props = [...d.props].reverse();
  d.physics = [...d.physics].reverse();
  const sw = loadData(d);
  for (const id of ['drop-plant', 'drop-lantern']) {
    const x = dropBake(hit, id), y = dropBake(sw, id);
    assert.deepEqual(y.poses, x.poses, id);
    assert.deepEqual([y.contacts, y.wakes, y.firstContact, y.restFrame], [x.contacts, x.wakes, x.firstContact, x.restFrame], id);
  }
});

test('determinism: seeking straight to frames gives the same SceneFrame as playing sequentially (fresh films)', () => {
  const picks = [383, 309, 0, 310, 303, 160, 200, 326, 308, 343];
  const seek = loadFilm('examples/films/m3-collide.json', 'assets');
  const direct = new Map(picks.map((fr) => [fr, canonicalSha256(sampleFrame(seek, fr))]));
  const seq = loadFilm('examples/films/m3-collide.json', 'assets');
  for (let fr = 0; fr < seq.data.output.durationFrames; fr++) {
    const h = canonicalSha256(sampleFrame(seq, fr));
    if (direct.has(fr)) assert.equal(h, direct.get(fr), `frame ${fr}`);
  }
});

test('one shared world: all drops share gravity and pxPerMeter, otherwise PHYSICS_CONFLICT', () => {
  const d = raw('m3-collide');
  d.physics[1].world.pxPerMeter = 300;
  assert.throws(() => loadData(d), code('PHYSICS_CONFLICT'));
});

// ─── Hậu kiểm Codex @a438f61 (1): hướng nhìn phụ thuộc pose đạo cụ đã thả, đọc theo lịch mô phỏng ─────────────────
import { characterState } from '../motion/character.ts';
import { restPivot } from '../motion/props.ts';

test('turn to face a dropped prop reads its simulated pose at that frame (no bake recursion, no initial-position fallback)', () => {
  const withTurn = (face: unknown, reverse = false) => {
    const d = raw('m3-collide');
    d.turns = [{ character: 'lan', start: 250, face }];
    if (reverse) { d.props = [...d.props].reverse(); d.physics = [...d.physics].reverse(); }
    return loadData(d);
  };
  const f = withTurn({ prop: 'plant-1' });
  const lan = f.data.characters.findIndex((c) => c.id === 'lan');
  // ở f250: chậu đã nằm yên trên sàn bên PHẢI Lan; vị trí ban đầu của chậu (trên bàn, x −480) ở bên TRÁI Lan
  const plantAt250 = restPivot(f, 'plant-1', 250)[0], lanX = characterState(f, lan, 250).root[0];
  assert.ok(f.data.props.find((p) => p.id === 'plant-1')!.x < lanX && plantAt250 > lanX, `initial ${f.data.props.find((p) => p.id === 'plant-1')!.x}, simulated ${plantAt250.toFixed(2)}, Lan ${lanX.toFixed(2)}`);
  assert.equal(plantAt250, at(A(f), 250).x);
  assert.ok(characterState(f, lan, 260).fx > 0, 'Lan faces right, towards the simulated plant');
  // đối chứng face:"right" ⇒ cùng toàn bộ SceneFrame và cùng bake
  const right = withTurn('right');
  for (let fr = 0; fr < f.data.output.durationFrames; fr++) assert.equal(canonicalSha256(sampleFrame(f, fr)), canonicalSha256(sampleFrame(right, fr)), `frame ${fr}`);
  assert.deepEqual(B(f).poses, B(right).poses);
  // tua thẳng (phim mới, bắt đầu từ frame sau lượt quay) và đảo thứ tự khai báo
  const seek = withTurn({ prop: 'plant-1' });
  assert.equal(canonicalSha256(sampleFrame(seek, 330)), canonicalSha256(sampleFrame(f, 330)));
  const sw = withTurn({ prop: 'plant-1' }, true);
  for (const id of ['drop-plant', 'drop-lantern']) assert.deepEqual(dropBake(sw, id).poses, dropBake(f, id).poses, id);
});

test('turns facing a dropped prop AFTER the same character releases (f310 during the hit, f360 after) — no false cycle', () => {
  for (const start of [310, 360]) {
    const d = raw('m3-collide');
    d.turns = [{ character: 'lan', start, face: { prop: 'plant-1' } }];
    const f = loadData(d);
    const lan = f.data.characters.findIndex((c) => c.id === 'lan');
    const px = restPivot(f, 'plant-1', start)[0], lx = characterState(f, lan, start).root[0];
    assert.equal(px, at(A(f), start).x, `plant pose at f${start} from the shared world`);
    assert.ok(px > lx && characterState(f, lan, start + 20).fx > 0, `f${start}: plant ${px.toFixed(2)} right of Lan ${lx.toFixed(2)}`);
    assert.deepEqual(B(f).poses, B(hit).poses, 'a later turn does not change the earlier release');
  }
});
