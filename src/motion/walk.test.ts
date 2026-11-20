import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { characterState, contactWorld, legsOf } from './character.ts';

const packs = ['sample-m0', 'demo-cast'].map((id) => ({ id, version: '0.1.0', manifestSha256: loadArtPack(`assets/${id}`).manifestSha256 }));

/** Phim test: tam đi phải 200 px rồi quay lại trái 120 px (có lật); lan đi trái 420 px. ~9–10 frame/bước. */
function walkFilm(mutate: (f: any) => void = () => {}): Film {
  const f: any = {
    schemaVersion: 1, id: 'walk-test',
    output: { width: 1920, height: 1080, fps: 24, durationFrames: 260 },
    packs,
    stage: { layers: [], surfaces: [{ id: 'floor', y: 0, x0: -1200, x1: 1200 }] },
    props: [],
    characters: [
      { id: 'a', pack: 'demo-cast', rig: 'biped-demo', character: 'tam', x: -500, scale: 1, depth: 1, facing: 'right', on: 'floor' },
      { id: 'b', pack: 'demo-cast', rig: 'biped-demo', character: 'lan', x: 500, scale: 1.1, depth: 1, facing: 'right', on: 'floor' },
    ],
    camera: { keys: [{ frame: 0, x: 0, y: 400, zoom: 1 }] },
    timeline: [],
    walks: [
      { character: 'a', start: 10, durationFrames: 110, toX: -300 },
      { character: 'a', start: 130, durationFrames: 75, toX: -420 },
      { character: 'b', start: 20, durationFrames: 150, toX: 80 },
    ],
    physics: [],
  };
  mutate(f);
  const dir = mkdtempSync(join(tmpdir(), 'ps-walk-'));
  writeFileSync(join(dir, 'walk-test.json'), JSON.stringify(f));
  return loadFilm(join(dir, 'walk-test.json'), resolve('assets'));
}

const film = walkFilm();
const N = film.data.output.durationFrames;
const soles = (ci: number, fr: number) => {
  const c = film.data.characters[ci]!;
  const legs = legsOf(film.rigs.get(c.pack)!, film.packs.get(c.pack)!, c.character);
  const st = characterState(film, ci, fr);
  return { st, p: legs.map((l) => contactWorld(film, ci, fr, l.contact, st)) };
};
const turning = (ci: number, fr: number) => Math.abs(characterState(film, ci, fr).fx) < 1;

test('stance foot never slides (≤ 0.01 px) and standing feet stay locked — both characters', () => {
  for (const ci of [0, 1]) {
    let prev = soles(ci, 0);
    for (let fr = 1; fr < N; fr++) {
      const cur = soles(ci, fr);
      if (turning(ci, fr) || turning(ci, fr - 1)) {
        prev = cur;
        continue; // lật tờ giấy: cả người co theo fx (đã ghi là giới hạn); không bước trong lúc lật
      }
      const moved = cur.p.map((p, k) => Math.hypot(p[0] - prev.p[k]![0], p[1] - prev.p[k]![1]));
      assert.ok(Math.min(...moved) <= 0.01, `c${ci} frame ${fr}: both feet moved ${moved.map((m) => m.toFixed(3))}`);
      if (!cur.st.walk.step && !prev.st.walk.step) assert.ok(Math.max(...moved) <= 0.01, `c${ci} frame ${fr}: standing foot moved`);
      prev = cur;
    }
  }
});

test('soles touch the floor exactly when not lifted, never sink below it', () => {
  for (const ci of [0, 1]) {
    for (let fr = 0; fr < N; fr++) {
      const { st, p } = soles(ci, fr);
      p.forEach((s, k) => {
        const lifted = (st.walk.step?.lift[k] ?? 0) > 0;
        if (lifted) assert.ok(s[1] > -1e-6, `c${ci} f${fr} leg${k} below floor while lifted`);
        else assert.ok(Math.abs(s[1]) <= 1e-6, `c${ci} f${fr} leg${k} y=${s[1]}`);
      });
    }
  }
});

test('walks end exactly at toX; facing follows the direction of travel', () => {
  assert.equal(characterState(film, 0, 120).root[0], -300);
  assert.equal(characterState(film, 0, 259).root[0], -420);
  assert.equal(characterState(film, 1, 259).root[0], 80);
  for (const ci of [0, 1]) {
    for (let fr = 1; fr < N; fr++) {
      const a = characterState(film, ci, fr - 1);
      const b = characterState(film, ci, fr);
      const dx = b.root[0] - a.root[0];
      if (Math.abs(dx) > 1e-9) assert.equal(Math.sign(b.fx), Math.sign(dx), `c${ci} frame ${fr}: moves ${dx} but faces ${b.fx}`);
    }
  }
  assert.equal(characterState(film, 0, 125).fx, 1); // sau lần đi sang phải
  assert.equal(characterState(film, 0, 259).fx, -1); // sau khi quay lại trái
  assert.equal(characterState(film, 1, 15).fx, 1); // lan ban đầu nhìn phải
  assert.equal(characterState(film, 1, 259).fx, -1);
});

test('turning flips facing through 0 monotonically while the root stays put', () => {
  // tam: lần đi thứ 2 (start 130) đổi hướng → 8 frame lật.
  const fx = Array.from({ length: 10 }, (_, k) => characterState(film, 0, 129 + k).fx);
  assert.equal(fx[0], 1);
  for (let k = 1; k < fx.length; k++) assert.ok(fx[k]! <= fx[k - 1]! + 1e-12, `fx not monotonic at ${129 + k}`);
  assert.equal(fx[8], -1);
  for (let k = 0; k < 9; k++) assert.equal(characterState(film, 0, 129 + k).root[0], -300);
});

test('root moves smoothly (< 12 px/frame) for both characters', () => {
  for (const ci of [0, 1]) {
    for (let fr = 1; fr < N; fr++) {
      const d = Math.abs(characterState(film, ci, fr).root[0] - characterState(film, ci, fr - 1).root[0]);
      assert.ok(d < 12, `c${ci} frame ${fr}: ${d}`);
    }
  }
});

const cases: [string, (f: any) => void][] = [
  ['WALK_TOO_SHORT', (f) => (f.walks[2].durationFrames = 10)],
  ['FILM_NOT_ON_SURFACE', (f) => (f.walks[0].toX = 1500)],
  ['FILM_TIMELINE_OVERLAP', (f) => (f.walks[1].start = 100)],
  ['ACTION_SPEED_EXCEEDED', (f) => (f.walks[0].durationFrames = 60)],
  ['FILM_FRAME_RANGE', (f) => (f.walks[2].durationFrames = 250)],
  ['FILM_UNKNOWN_REF', (f) => (f.walks[0].character = 'z')],
  ['FILM_SCHEMA', (f) => (f.walks[1].toX = -300)],
];
for (const [c, mutate] of cases) {
  test(`${c} (walk): ${mutate.toString().slice(6, 70)}`, () => {
    assert.throws(() => walkFilm(mutate), code(c));
  });
}
