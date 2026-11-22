import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { shuffledPick, stateSha } from './render.ts';
import { compareState, expectedState } from './state.ts';

const m0 = loadFilm('examples/films/m0-static.json', 'assets');
const frame = () => expectedState(sampleFrame(m0, 10));
const frame0 = () => expectedState(sampleFrame(m0, 0));

test('identical state passes; float noise below 1e-6 passes', () => {
  const e = frame();
  const d = structuredClone(e);
  d.sprites[0]!.rot += 1e-9;
  compareState(e, d);
});

const cases: [string, (d: ReturnType<typeof frame>) => void][] = [
  ['wrong frame', (d) => (d.frame = 11)],
  ['missing sprite', (d) => d.sprites.pop()],
  ['swapped order', (d) => d.sprites.reverse()],
  ['wrong texture', (d) => (d.sprites[2]!.sha256 = '0'.repeat(64))],
  ['moved 0.01 px', (d) => (d.sprites[3]!.x += 0.01)],
  ['y sign flipped', (d) => (d.sprites[6]!.y = 1080 - d.sprites[6]!.y)],
  ['scale', (d) => (d.sprites[4]!.scale *= 1.001)],
  ['flip', (d) => (d.sprites[1]!.scaleX = -d.sprites[1]!.scaleX)],
  ['squash', (d) => (d.sprites[1]!.scaleX *= 0.9)],
  ['paper squash (flip) not drawn', (d) => (d.sprites[1]!.paperX = 0.5)],
  ['shadow dropped', (d) => (d.sprites[6]!.shadow = null)],
  ['shadow blur', (d) => (d.sprites[6]!.shadow!.blurArt += 1)],
  ['shadow offset', (d) => (d.sprites[6]!.shadow!.dy = -d.sprites[6]!.shadow!.dy)],
];
for (const [name, mutate] of cases) {
  test(`RENDER_STATE_MISMATCH: ${name}`, () => {
    const e = frame();
    const d = structuredClone(e);
    mutate(d);
    assert.throws(() => compareState(e, d), code('RENDER_STATE_MISMATCH'));
  });
}

test('mid-flip character sprites carry paperX into the expected state; other sprites have paperX = 1', () => {
  const f = loadFilm('examples/films/m2-handover.json', 'assets');
  const e = expectedState(sampleFrame(f, 202)); // lan đang lật (M2/E4)
  const lan = e.sprites.filter((s) => s.id.startsWith('lan/'));
  assert.ok(lan.length > 0 && lan.every((s) => s.paperX > 0 && s.paperX < 1), 'lan sprites must be squashed on screen');
  assert.ok(e.sprites.filter((s) => !s.id.startsWith('lan/')).every((s) => s.paperX === 1));
  assert.ok(frame().sprites.every((s) => s.paperX === 1));
});

// ── Hash trạng thái đã vẽ: tương thích manifest cũ (trước khi có paperX) ────────────────────────────────────────
/** stateSha(m0-static frame 0) tính bằng code d772125 (trước paperX) — cũng chính là drawnStateSha256[0] trong
 *  manifest m0-static do d772125 render. Hằng số ghi lại, không suy từ hàm đang kiểm. */
const BASELINE_M0_F0 = 'a65bc4363b759ee7854466481bd0a36c300a114ef5df270c36f9df4bdac9b6a0';

test('state hash: paperX = 1 or absent hashes exactly like the pre-paperX format (old manifests stay auditable)', () => {
  const e = frame0();
  assert.ok(e.sprites.every((s) => s.paperX === 1));
  assert.equal(stateSha(e), BASELINE_M0_F0);
  const absent = structuredClone(e) as any;
  for (const s of absent.sprites) delete s.paperX;
  assert.equal(stateSha(absent), BASELINE_M0_F0);
});

test('state hash: a real on-screen squash (paperX ≠ 1) changes the hash', () => {
  const e = frame0();
  const d = structuredClone(e);
  d.sprites[1]!.paperX = 0.5;
  assert.notEqual(stateSha(d), stateSha(e));
  const d2 = structuredClone(e);
  d2.sprites[1]!.paperX = 0.25;
  assert.notEqual(stateSha(d2), stateSha(d));
});

test('a renderer that ignores paperX while a character flips → RENDER_STATE_MISMATCH', () => {
  const e = expectedState(sampleFrame(loadFilm('examples/films/m2-handover.json', 'assets'), 202));
  const d = structuredClone(e);
  for (const s of d.sprites) s.paperX = 1;
  assert.throws(() => compareState(e, d), code('RENDER_STATE_MISMATCH'));
});

test('shuffledPick: deterministic, includes first and last, not sorted, no duplicates', () => {
  const a = shuffledPick(48, 8, 'deadbeef');
  assert.deepEqual(a, shuffledPick(48, 8, 'deadbeef'));
  assert.notDeepEqual(a, shuffledPick(48, 8, '12345678'));
  assert.equal(a.length, 8);
  assert.equal(new Set(a).size, 8);
  assert.ok(a.includes(0) && a.includes(47));
  assert.notDeepEqual(a, [...a].sort((x, y) => x - y));
  assert.deepEqual(shuffledPick(3, 8, 'aa').sort(), [0, 1, 2]);
});
