import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSha256 } from '../core/hash.ts';
import { loadFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { cameraAt, sampleFrame, spriteToScreen, type Sprite } from './sample.ts';

const film = () => loadFilm('examples/films/m0-static.json', 'assets');
const N = 48;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const by = (f: ReturnType<typeof sampleFrame>, id: string) => f.sprites.find((s) => s.id === id)!;

/** Bản film đã sửa dữ liệu (không đụng file): đổi camera / prop để kiểm dấu và parallax. */
function withData(f: Film, mutate: (d: any) => void): Film {
  const data = structuredClone(f.data);
  mutate(data);
  return { data, assets: f.assets };
}

test('pure: forward, reverse and shuffled sampling give identical frames', () => {
  const f = film();
  const forward = Array.from({ length: N }, (_, i) => canonicalSha256(sampleFrame(f, i)));
  const reverse = Array.from({ length: N }, (_, i) => N - 1 - i).map((i) => canonicalSha256(sampleFrame(f, i))).reverse();
  const order = Array.from({ length: N }, (_, i) => (i * 29) % N); // hoán vị cố định
  const shuffled: string[] = [];
  for (const i of order) shuffled[i] = canonicalSha256(sampleFrame(f, i));
  assert.deepEqual(reverse, forward);
  assert.deepEqual(shuffled, forward);
  assert.deepEqual(canonicalSha256(sampleFrame(film(), 17)), forward[17]); // film nạp lại → cùng kết quả
});

test('sampling does not mutate the film', () => {
  const f = film();
  const before = canonicalSha256(f.data);
  for (let i = 0; i < N; i++) sampleFrame(f, i);
  assert.equal(canonicalSha256(f.data), before);
});

test('SCENE_FRAME_RANGE for out-of-range or fractional frames', () => {
  for (const bad of [-1, N, 1.5, NaN]) assert.throws(() => sampleFrame(film(), bad), code('SCENE_FRAME_RANGE'));
});

test('camera interpolation follows keys and easing; holds after last key', () => {
  const f = film();
  assert.deepEqual(cameraAt(f, 0), { x: 0, y: 290, zoom: 1 });
  assert.deepEqual(cameraAt(f, 47), { x: 40, y: 290, zoom: 1.04 });
  const mid = cameraAt(f, 23.5); // inOutSine(0.5) = 0.5
  assert.ok(near(mid.x, 20) && near(mid.zoom, 1.02));
  assert.ok(cameraAt(f, 5).x < 40 * (5 / 47)); // inOutSine bắt đầu chậm hơn linear
  assert.deepEqual(cameraAt(f, 60), { x: 40, y: 290, zoom: 1.04 });
});

test('frame 0 reproduces authored composition at every depth (world y-up → screen y-down)', () => {
  const f0 = sampleFrame(film(), 0);
  // Camera (0,290) zoom 1: điểm thế giới (x,y) → màn hình (960 + x, 540 − (y − 290)).
  const lantern = by(f0, 'lantern-1'); // world (300, 246)
  assert.deepEqual([lantern.x, lantern.y], [1260, 584]);
  const sky = by(f0, 'sky'); // world (0, −260), depth 20
  assert.deepEqual([sky.x, sky.y], [960, 1090]);
  assert.equal(sky.scale, 1);
});

test('higher world y appears HIGHER on screen (smaller screen y)', () => {
  const f0 = sampleFrame(film(), 0);
  assert.ok(by(f0, 'lantern-1').y < by(f0, 'table-1').y); // đèn đặt trên mặt bàn
  const lifted = sampleFrame(withData(film(), (d) => (d.props[1].y += 10)), 0);
  assert.equal(by(lifted, 'lantern-1').y, by(f0, 'lantern-1').y - 10);
});

test('positive world rotation (CCW) → negative screen rot; the top of the art swings LEFT', () => {
  const s = by(sampleFrame(withData(film(), (d) => (d.props[1].rotation = 90)), 0), 'lantern-1');
  assert.equal(s.rot, -90);
  const top = spriteToScreen(s, [45, 0]); // đỉnh đèn, pivot ở đáy (45,170)
  assert.ok(near(top[0], s.x - 170) && near(top[1], s.y), `top=${top}`);
  const upright = by(sampleFrame(film(), 0), 'lantern-1');
  const top0 = spriteToScreen(upright, [45, 0]);
  assert.ok(near(top0[0], upright.x) && near(top0[1], upright.y - 170)); // không xoay: đỉnh ở TRÊN pivot
});

test('shadow offset converts y-up → y-down (dy < 0 in world = down on screen)', () => {
  const t = by(sampleFrame(film(), 0), 'table-1');
  assert.deepEqual(t.shadow, { dx: 9, dy: 7, blur: 10, opacity: 0.35 });
});

test('parallax: depth 0 tracks the camera fully, far layers move less', () => {
  const f = withData(film(), (d) => {
    d.props[0].depth = 0;
    d.camera.keys = [{ frame: 0, x: 0, y: 290, zoom: 1, ease: 'linear' }, { frame: 47, x: 470, y: 290, zoom: 1 }];
  });
  const shift = (id: string) => by(sampleFrame(f, 0), id).x - by(sampleFrame(f, 47), id).x;
  assert.ok(near(shift('table-1'), 470)); // depth 0
  assert.ok(near(shift('ground'), 235)); // depth 1 → p = 1/2
  assert.ok(near(shift('sky'), 470 / 21)); // depth 20
  assert.ok(shift('hills-near') > shift('hills-mid') && shift('hills-mid') > shift('hills-far'));
});

test('zoom affects near layers more than far ones', () => {
  const last = sampleFrame(film(), 47);
  assert.ok(by(last, 'ground').scale > by(last, 'hills-far').scale);
  assert.ok(by(last, 'hills-far').scale > by(last, 'sky').scale);
  assert.ok(near(by(last, 'ground').scale, 1.02));
});

test('draw order: far → near; layers before props at equal depth; file order breaks ties', () => {
  const ids = sampleFrame(film(), 0).sprites.map((s: Sprite) => s.id);
  assert.deepEqual(ids, ['sky', 'sun', 'hills-far', 'hills-mid', 'hills-near', 'ground', 'table-1', 'lantern-1', 'plant-1']);
});

test('continuity: no sprite jumps more than 4 px between consecutive frames', () => {
  const f = film();
  for (let i = 1; i < N; i++) {
    const a = sampleFrame(f, i - 1);
    const b = sampleFrame(f, i);
    a.sprites.forEach((s, k) => {
      const t = b.sprites[k]!;
      assert.ok(Math.hypot(t.x - s.x, t.y - s.y) < 4, `${s.id} frame ${i}`);
    });
  }
});
