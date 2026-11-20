import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleOf, artToLocal, length, rotate } from './space.ts';

test('art y-down → local y-up: a point ABOVE the pivot in the SVG has POSITIVE local y', () => {
  // SVG 100x200, pivot ở đáy giữa (50,200); điểm (50,0) nằm trên đỉnh hình.
  assert.deepEqual(artToLocal([50, 0], [50, 200]), [0, 200]);
  // Điểm bên phải pivot vẫn có x dương (trục x không đổi chiều).
  assert.deepEqual(artToLocal([80, 200], [50, 200]), [30, 0]);
  // Điểm dưới pivot trong SVG → y local âm.
  assert.deepEqual(artToLocal([50, 210], [50, 200]), [0, -10]);
});

test('positive angle rotates counter-clockwise (+x → +y, i.e. pointing up)', () => {
  assert.deepEqual(rotate([1, 0], 90), [0, 1]);
  assert.deepEqual(rotate([1, 0], -90), [0, -1]);
  assert.deepEqual(rotate([0, 1], 90), [-1, 0]);
  assert.deepEqual(rotate([1, 0], 180), [-1, 0]);
});

test('angleOf is the inverse of rotate and matches CCW convention', () => {
  assert.equal(angleOf([0, 1]), 90);
  assert.equal(angleOf([0, -1]), -90);
  assert.equal(angleOf([-1, 0]), 180);
  for (const deg of [-170, -45, 0, 30, 135]) assert.ok(Math.abs(angleOf(rotate([1, 0], deg)) - deg) < 1e-6, String(deg));
});

test('an arm hanging down in the SVG, rotated +90°, points to the +x side', () => {
  // Cánh tay vẽ thẳng xuống: pivot vai (10,0), khuỷu (10,100) trong SVG.
  const elbow = artToLocal([10, 100], [10, 0]);
  assert.deepEqual(elbow, [0, -100]);
  assert.equal(angleOf(elbow), -90);
  assert.deepEqual(rotate(elbow, 90), [100, 0]);
  assert.equal(length(elbow), 100);
});

test('no negative zero leaks out', () => {
  const [x, y] = rotate([0, 0], 37);
  assert.ok(!Object.is(x, -0) && !Object.is(y, -0));
});
