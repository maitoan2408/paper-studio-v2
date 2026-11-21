import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { StudioError, parseWith } from './errors.ts';
import { canonicalJson, canonicalSha256, sha256Hex } from './hash.ts';

test('StudioError formats CODE: path — detail', () => {
  const e = new StudioError('X_CODE', 'a.b', 'bad');
  assert.equal(e.message, 'X_CODE: a.b — bad');
});

test('sha256Hex matches known vector', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('canonical hash is independent of key order and whitespace', () => {
  const a = { b: 1, a: { y: [1, 2], x: 'z' } };
  const b = JSON.parse('{ "a": { "x": "z", "y": [1, 2] }, "b": 1 }');
  assert.equal(canonicalJson(a), '{"a":{"x":"z","y":[1,2]},"b":1}');
  assert.equal(canonicalSha256(a), canonicalSha256(b));
});

test('canonical hash changes when array order changes', () => {
  assert.notEqual(canonicalSha256([1, 2]), canonicalSha256([2, 1]));
});

test('canonicalJson rejects non-canonical values', () => {
  for (const bad of [NaN, Infinity, -0, undefined, new Date(0), { a: () => 1 }]) {
    assert.throws(() => canonicalJson(bad), (e: unknown) => e instanceof StudioError && e.code === 'HASH_NON_CANONICAL');
  }
});

test('parseWith maps first zod issue to coded error with path', () => {
  const s = z.object({ a: z.object({ b: z.number() }) }).strict();
  assert.throws(
    () => parseWith(s, { a: { b: 'x' } }, 'T_SCHEMA', 'root'),
    (e: unknown) => e instanceof StudioError && e.code === 'T_SCHEMA' && e.path === 'root.a.b',
  );
});
