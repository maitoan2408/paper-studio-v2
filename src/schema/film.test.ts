import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadArtPack } from './art-pack.ts';
import { loadFilm, validateFilm } from './film.ts';
import { code, makePack } from './test-helpers.ts';
import { castFixture } from './cast-fixture.ts';

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
    walks: [] as unknown[],
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
  ['FILM_FEATURE_NOT_ENABLED', (f) => f.physics.push({})],
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

test('film with two characters, two layers and both hands validates', () => {
  const f = castFixture().validate();
  assert.equal(f.data.characters.length, 2);
  assert.equal(f.rigs.get('test-pack')?.data.id, 'biped-test');
});

test('clips on different layers may overlap; same layer may not', () => {
  const cf = castFixture();
  cf.validate(); // breath (layer 0) chồng wave (layer 1) là hợp lệ
  cf.film.timeline.push({ character: 'c1', clip: 'wave', start: 30, durationFrames: 20, bind: { active: 'r' }, layer: 1 });
  assert.throws(() => cf.validate(), code('FILM_TIMELINE_OVERLAP'));
});

const castCases: [string, (f: any) => void][] = [
  ['FILM_UNKNOWN_REF', (f) => (f.characters[0].pack = 'pack-z')],
  ['FILM_UNKNOWN_REF', (f) => (f.characters[0].rig = 'quadruped')],
  ['FILM_UNKNOWN_REF', (f) => (f.characters[1].character = 'ghost')],
  ['FILM_UNKNOWN_REF', (f) => (f.characters[1].on = 'roof')],
  ['FILM_UNKNOWN_REF', (f) => (f.timeline[0].character = 'c9')],
  ['FILM_UNKNOWN_REF', (f) => (f.timeline[0].clip = 'dance')],
  ['FILM_NOT_ON_SURFACE', (f) => (f.characters[0].x = -1000)],
  ['FILM_SCHEMA', (f) => (f.characters[0].scale = 0)],
  ['FILM_SCHEMA', (f) => (f.timeline[0].repeat = 0)],
  ['FILM_FRAME_RANGE', (f) => (f.timeline[3].durationFrames = 70)],
  ['FILM_FRAME_RANGE', (f) => (f.timeline[2].blendIn = 65)],
  ['FILM_TIMELINE_OVERLAP', (f) => (f.timeline[3].layer = 0)],
  ['ACTION_PRECONDITION', (f) => (f.timeline[2].bind = {})],
];
for (const [c, mutate] of castCases) {
  test(`${c} (cast): ${mutate.toString().slice(6, 80)}`, () => {
    const cf = castFixture();
    mutate(cf.film);
    assert.throws(() => cf.validate(), code(c));
  });
}

test('ACTION_PRECONDITION: clip needs a prop role with a grip anchor', () => {
  const grab = { schemaVersion: 1, id: 'grab', rig: 'biped-test', channels: [], events: [], requires: { props: [{ role: 'item', anchors: ['grip'] }] } };
  const cf = castFixture({ grab });
  cf.film.timeline = [{ character: 'c1', clip: 'grab', start: 0, durationFrames: 10, bind: {} }];
  assert.throws(() => cf.validate(), code('ACTION_PRECONDITION'));
  cf.film.props = [{ id: 'cup', asset: 'sky', x: 0, y: 0, scale: 1, rotation: 0, depth: 1 }];
  cf.film.timeline[0].bind = { roles: { item: 'cup' } };
  assert.throws(() => cf.validate(), (e: any) => code('ACTION_PRECONDITION')(e) && /lacks anchor "grip"/.test(e.message));
});

test('ACTION_LIMIT_EXCEEDED: sampled pose leaves the joint range', () => {
  const big = { ...(castFixture().film.timeline[2]), clip: 'bend' };
  const bend = { schemaVersion: 1, id: 'bend', rig: 'biped-test', events: [], requires: {},
    channels: [{ bone: 'forearm.l', prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1, v: 30 }] }] };
  const cf = castFixture({ bend });
  cf.film.timeline = [{ ...big, bind: {} }];
  // forearm.l: rest −10, giới hạn [−150, 0] → −10 + 30 = 20 vượt max.
  assert.throws(() => cf.validate(), code('ACTION_LIMIT_EXCEEDED'));
});

/** Clip quay một xương đi rồi về với tốc độ đều `deg`/frame (9 frame: 4 bước đi, 4 bước về). */
const spin = (bone: string, deg: number) => ({
  schemaVersion: 1, id: 'spin', rig: 'biped-test', events: [], requires: {},
  channels: [{ bone, prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 0.5, v: deg * 4, ease: 'linear' }, { t: 1, v: 0 }] }],
});
for (const [bone, deg, ok] of [['hand.l', 14, true], ['upper-arm.l', 11.9, true], ['upper-arm.l', 12.5, false]] as const) {
  test(`ACTION_SPEED_EXCEEDED: ${bone} at ${deg}°/frame → ${ok ? 'ok' : 'fail'} (per-bone limit from rig.json)`, () => {
    const cf = castFixture({ spin: spin(bone, deg) });
    cf.film.timeline = [{ character: 'c1', clip: 'spin', start: 0, durationFrames: 9, bind: {} }];
    if (ok) cf.validate();
    else assert.throws(() => cf.validate(), code('ACTION_SPEED_EXCEEDED'));
  });
}

test('per-bone limits differ: hand may turn 20°/frame where the upper arm may not', () => {
  // Clip 3 frame 0 → v → 0: tốc độ v°/frame. Bàn tay ngưỡng 22.5, cánh tay 12 (rig fixture).
  const quick = (bone: string, v: number) => ({ schemaVersion: 1, id: 'spin', rig: 'biped-test', events: [], requires: {},
    channels: [{ bone, prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 0.5, v, ease: 'linear' }, { t: 1, v: 0 }] }] });
  for (const [bone, v, ok] of [['hand.l', 20, true], ['upper-arm.l', 20, false], ['hand.l', 25, false]] as const) {
    const cf = castFixture({ spin: quick(bone, v) });
    cf.film.timeline = [{ character: 'c1', clip: 'spin', start: 0, durationFrames: 3, bind: {} }];
    if (ok) cf.validate();
    else assert.throws(() => cf.validate(), code('ACTION_SPEED_EXCEEDED'));
  }
});

test('ACTION_SPEED_EXCEEDED: a clip that ends away from rest pops back → caught', () => {
  const end = { schemaVersion: 1, id: 'spin', rig: 'biped-test', events: [], requires: {},
    channels: [{ bone: 'upper-arm.l', prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'linear' }, { t: 1, v: 30 }] }] };
  const cf = castFixture({ spin: end });
  cf.film.timeline = [{ character: 'c1', clip: 'spin', start: 0, durationFrames: 10, bind: {} }];
  assert.throws(() => cf.validate(), (e: any) => code('ACTION_SPEED_EXCEEDED')(e) && /frame 10/.test(e.message));
});
