import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStoryboard } from './storyboard.ts';
import { code } from './test-helpers.ts';

const sb = () => ({
  schemaVersion: 1,
  id: 'sb-1',
  revision: 1,
  parentSha256: null as string | null,
  title: 'Chào buổi sáng',
  cast: [{ role: 'mai', pack: 'pack-a', character: 'stout' }, { role: 'nam', pack: 'pack-a', character: 'lanky' }],
  scenes: [{ id: 's1', setting: 'room', durationSec: 6, beats: [{ atSec: 0.5, role: 'mai', action: 'wave', hand: 'left', line: 'Chào cậu' }] }],
});

test('valid storyboard passes (revision 1 and revision 2 with parent)', () => {
  validateStoryboard(sb());
  validateStoryboard({ ...sb(), revision: 2, parentSha256: 'a'.repeat(64) });
});

const cases: [string, (s: any) => void][] = [
  ['STORYBOARD_SCHEMA', (s) => (s.scenes[0].beats[0].hand = 'both')],
  ['STORYBOARD_SCHEMA', (s) => (s.scenes[0].beats[0].atSec = 6)],
  ['STORYBOARD_SCHEMA', (s) => (s.cast[1].role = 'mai')],
  ['STORYBOARD_REVISION', (s) => (s.revision = 2)],
  ['STORYBOARD_REVISION', (s) => (s.parentSha256 = 'b'.repeat(64))],
  ['STORYBOARD_UNKNOWN_ROLE', (s) => (s.scenes[0].beats[0].role = 'lan')],
];
for (const [c, mutate] of cases) {
  test(`${c}: ${mutate.toString().slice(6, 80)}`, () => {
    const s = sb();
    mutate(s);
    assert.throws(() => validateStoryboard(s), code(c));
  });
}
