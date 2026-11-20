import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadArtPack } from './art-pack.ts';
import { loadFilm, validateFilm } from './film.ts';
import { code, makePack } from './test-helpers.ts';

function setup() {
  const p = makePack(
    [
      { id: 'sky', w: 2400, h: 1200, category: 'background' },
      { id: 'table', w: 400, h: 200, anchors: { top: [200, 10] }, category: 'surface' },
      { id: 'lamp', w: 60, h: 120, category: 'prop' },
    ],
    'pack-a',
  );
  const pack = loadArtPack(p.dir);
  const film = {
    schemaVersion: 1,
    id: 'f1',
    output: { width: 1920, height: 1080, fps: 24, durationFrames: 48 },
    packs: [{ id: 'pack-a', version: '0.1.0', manifestSha256: pack.manifestSha256 }],
    stage: {
      layers: [{ id: 'bg', asset: 'sky', x: 0, y: -60, scale: 1, rotation: 0, depth: 8, shadow: { dx: 4, dy: -6, blur: 8, opacity: 0.3 } }],
      surfaces: [{ id: 'floor', y: 0, x0: -2000, x1: 2000 }, { id: 'table-top', y: 190, x0: 100, x1: 500 }],
    },
    props: [
      { id: 't1', asset: 'table', x: 300, y: 0, scale: 1, rotation: 0, depth: 1, on: 'floor' },
      { id: 'l1', asset: 'lamp', x: 300, y: 190, scale: 1, rotation: 0, depth: 0.9, on: 'table-top' },
    ],
    characters: [] as unknown[],
    camera: { keys: [{ frame: 0, x: 0, y: 540, zoom: 1, ease: 'inOutSine' }, { frame: 47, x: 120, y: 540, zoom: 1.1 }] },
    timeline: [] as unknown[],
    physics: [] as unknown[],
  };
  return { p, pack, film, packs: new Map([['pack-a', pack]]) };
}

test('valid film passes and resolves assets', () => {
  const s = setup();
  const f = validateFilm(s.film, s.packs);
  assert.equal(f.assets.get('lamp')?.packId, 'pack-a');
});

test('loadFilm loads packs from assets root', () => {
  const s = setup();
  const root = mkdtempSync(join(tmpdir(), 'ps-assets-'));
  renameSync(s.p.dir, join(root, 'pack-a'));
  const file = join(root, 'film.json');
  writeFileSync(file, JSON.stringify(s.film));
  assert.equal(loadFilm(file, root).data.id, 'f1');
  writeFileSync(file, JSON.stringify({ ...s.film, packs: [{ ...s.film.packs[0], id: 'pack-b' }] }));
  assert.throws(() => loadFilm(file, root), code('FILM_PACK_NOT_FOUND'));
});

const cases: [string, (f: any, s: ReturnType<typeof setup>) => void][] = [
  ['FILM_SCHEMA', (f) => (f.extra = 1)],
  ['FILM_SCHEMA', (f) => (f.output.fps = 30)],
  ['FILM_SCHEMA', (f) => (f.output.width = 1280)],
  ['FILM_SCHEMA', (f) => (f.output.durationFrames = 0)],
  ['FILM_SCHEMA', (f) => (f.props[0].scale = 0)],
  ['FILM_SCHEMA', (f) => (f.stage.layers[0].shadow.opacity = 2)],
  ['FILM_SCHEMA', (f) => (f.stage.layers[0].depth = -1)],
  ['FILM_SCHEMA', (f) => (f.stage.surfaces[0].x1 = -3000)],
  ['FILM_SCHEMA', (f) => delete f.camera.keys[0].ease],
  ['FILM_DUP_ID', (f) => (f.props[1].id = 't1')],
  ['FILM_DUP_ID', (f) => (f.props[1].id = 'floor')],
  ['FILM_PACK_NOT_FOUND', (f) => (f.packs[0].id = 'pack-z')],
  ['FILM_PACK_NOT_FOUND', (f) => (f.packs[0].version = '0.2.0')],
  ['FILM_PACK_HASH', (f) => (f.packs[0].manifestSha256 = '0'.repeat(64))],
  ['FILM_UNKNOWN_REF', (f) => (f.props[0].asset = 'chair')],
  ['FILM_UNKNOWN_REF', (f) => (f.stage.layers[0].asset = 'moon')],
  ['FILM_UNKNOWN_REF', (f) => (f.props[1].on = 'shelf')],
  ['FILM_NOT_ON_SURFACE', (f) => (f.props[1].y = 191)],
  ['FILM_NOT_ON_SURFACE', (f) => (f.props[1].x = 600)],
  ['FILM_FRAME_RANGE', (f) => (f.camera.keys[0].frame = 1)],
  ['FILM_FRAME_RANGE', (f) => (f.camera.keys[1].frame = 48)],
  ['FILM_FRAME_RANGE', (f) => (f.camera.keys[1].frame = 0)],
  ['FILM_FRAME_RANGE', (f) => f.timeline.push({ character: 'c1', clip: 'wave', start: 40, durationFrames: 9, bind: {} })],
  ['FILM_TIMELINE_OVERLAP', (f) => f.timeline.push(
    { character: 'c1', clip: 'wave', start: 0, durationFrames: 20, bind: {} },
    { character: 'c1', clip: 'wave', start: 15, durationFrames: 20, bind: {}, blendIn: 4 },
  )],
  ['FILM_FEATURE_NOT_ENABLED', (f) => f.timeline.push(
    { character: 'c1', clip: 'wave', start: 0, durationFrames: 20, bind: {} },
    { character: 'c1', clip: 'wave', start: 15, durationFrames: 20, bind: {}, blendIn: 5 },
  )],
  ['FILM_FEATURE_NOT_ENABLED', (f) => f.physics.push({})],
  ['FILM_FEATURE_NOT_ENABLED', (f) => f.characters.push({ id: 'c1', pack: 'pack-a', rig: 'r', character: 'a', x: 0, depth: 0, facing: 'left', on: 'floor' })],
];

for (const [c, mutate] of cases) {
  test(`${c}: ${mutate.toString().slice(6, 100)}`, () => {
    const s = setup();
    mutate(s.film, s);
    assert.throws(() => validateFilm(s.film, s.packs), code(c));
  });
}

test('FILM_UNKNOWN_REF: asset id present in two packs is ambiguous', () => {
  const s = setup();
  const q = makePack([{ id: 'lamp', w: 10, h: 10 }], 'pack-b');
  const b = loadArtPack(q.dir);
  s.film.packs.push({ id: 'pack-b', version: '0.1.0', manifestSha256: b.manifestSha256 });
  assert.throws(() => validateFilm(s.film, new Map([...s.packs, ['pack-b', b]])), code('FILM_UNKNOWN_REF'));
});
