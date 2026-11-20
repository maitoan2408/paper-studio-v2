import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EASING_NAMES, ease } from './easing.ts';

for (const name of EASING_NAMES) {
  test(`easing ${name}: endpoints, range, monotonic, clamped`, () => {
    assert.equal(ease(name, 0), 0);
    assert.ok(Math.abs(ease(name, 1) - 1) < 1e-12);
    let prev = 0;
    for (let i = 0; i <= 1000; i++) {
      const v = ease(name, i / 1000);
      assert.ok(v >= 0 && v <= 1 + 1e-12, `${name}(${i / 1000})=${v}`);
      assert.ok(v >= prev - 1e-12, `${name} not monotonic at ${i / 1000}`);
      prev = v;
    }
    assert.equal(ease(name, -0.5), 0);
    assert.ok(Math.abs(ease(name, 1.5) - 1) < 1e-12);
  });
}
