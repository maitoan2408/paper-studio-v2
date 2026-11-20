import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { shuffledPick } from './render.ts';
import { compareState, expectedState } from './state.ts';

const frame = () => expectedState(sampleFrame(loadFilm('examples/films/m0-static.json', 'assets'), 10));

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
  ['flip', (d) => (d.sprites[1]!.flipX = true)],
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
