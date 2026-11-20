import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '../core/hash.ts';
import { loadArtPack } from './art-pack.ts';
import { checkSvg } from './svg.ts';
import { code, makePack, rectSvg } from './test-helpers.ts';

const base = () => makePack([{ id: 'table', w: 400, h: 200, anchors: { top: [200, 10] }, category: 'surface' }]);

test('valid pack loads and has stable manifest hash', () => {
  const p = base();
  const a = loadArtPack(p.dir);
  assert.equal(a.assets.get('table')?.width, 400);
  assert.equal(loadArtPack(p.dir).manifestSha256, a.manifestSha256);
});

test('manifest hash changes when an asset changes', () => {
  const p = base();
  const before = loadArtPack(p.dir).manifestSha256;
  p.manifest.assets[0]!.anchors = { top: [201, 10] };
  p.write();
  assert.notEqual(loadArtPack(p.dir).manifestSha256, before);
});

test('ART_SCHEMA: unknown field, bad id, bad category, missing manifest field', () => {
  for (const mutate of [
    (m: any) => (m.extra = 1),
    (m: any) => (m.assets[0].id = 'Bad Id'),
    (m: any) => (m.assets[0].category = 'person'),
    (m: any) => delete m.version,
    (m: any) => (m.assets[0].anchors = { 'Bad.x': [0, 0] }),
    (m: any) => (m.assets = []),
  ]) {
    const p = base();
    mutate(p.manifest);
    p.write();
    assert.throws(() => loadArtPack(p.dir), code('ART_SCHEMA'));
  }
});

test('ART_DUPLICATE_ID', () => {
  const p = makePack([{ id: 'a', w: 10, h: 10 }, { id: 'b', w: 10, h: 10 }]);
  p.manifest.assets[1]!.id = 'a';
  p.write();
  assert.throws(() => loadArtPack(p.dir), code('ART_DUPLICATE_ID'));
});

test('ART_PATH_UNSAFE: traversal, absolute, non-svg, symlink', () => {
  for (const file of ['../x.svg', '/etc/passwd.svg', 'a/../table.svg', 'table.png', 'x\\y.svg']) {
    const p = base();
    p.manifest.assets[0]!.file = file;
    p.write();
    assert.throws(() => loadArtPack(p.dir), code('ART_PATH_UNSAFE'), file);
  }
  const p = base();
  symlinkSync(join(p.dir, 'table.svg'), join(p.dir, 'link.svg'));
  p.manifest.assets[0]!.file = 'link.svg';
  p.write();
  assert.throws(() => loadArtPack(p.dir), code('ART_PATH_UNSAFE'));
});

test('ART_FILE_MISSING', () => {
  const p = base();
  p.manifest.assets[0]!.file = 'nope.svg';
  p.write();
  assert.throws(() => loadArtPack(p.dir), code('ART_FILE_MISSING'));
});

test('ART_HASH_MISMATCH when one byte of art changes', () => {
  const p = base();
  writeFileSync(join(p.dir, 'table.svg'), rectSvg(400, 200).replace('#c96', '#c97'));
  assert.throws(() => loadArtPack(p.dir), code('ART_HASH_MISMATCH'));
});

test('ART_SIZE_MISMATCH: viewBox differs from width/height or has offset', () => {
  for (const svg of [rectSvg(401, 200), rectSvg(400, 200).replace('viewBox="0 0', 'viewBox="5 0')]) {
    const p = base();
    writeFileSync(join(p.dir, 'table.svg'), svg);
    p.manifest.assets[0]!.sha256 = sha256Hex(svg);
    p.write();
    assert.throws(() => loadArtPack(p.dir), code('ART_SIZE_MISMATCH'));
  }
});

test('ART_ANCHOR_OUT_OF_BOUNDS: pivot and named anchor', () => {
  for (const mutate of [(a: any) => (a.pivot = [401, 0]), (a: any) => (a.anchors = { top: [10, -1] })]) {
    const p = base();
    mutate(p.manifest.assets[0]);
    p.write();
    assert.throws(() => loadArtPack(p.dir), code('ART_ANCHOR_OUT_OF_BOUNDS'));
  }
});

test('ART_SVG_UNSAFE: each forbidden construct is rejected', () => {
  const evil = [
    '<script>alert(1)</script>',
    '<foreignObject><div/></foreignObject>',
    '<image href="http://x/y.png"/>',
    '<rect onload="x()"/>',
    '<use href="http://x/y.svg#a"/>',
    '<use xlink:href="file:///etc/passwd"/>',
    '<rect style="fill:url(http://x/p)"/>',
    '<style>@import url(x)</style>',
    '<a href="#x"><rect/></a>',
    '<set attributeName="href" to="javascript:x"/>',
    '<![CDATA[ <script> ]]>',
    '<rect x="1" x="2"/>',
    '<rect x=1/>',
  ];
  for (const e of evil) {
    assert.throws(() => checkSvg(rectSvg(10, 10, e), 't'), code('ART_SVG_UNSAFE'), e);
  }
  assert.throws(() => checkSvg('<!DOCTYPE svg [<!ENTITY a "b">]>' + rectSvg(10, 10), 't'), code('ART_SVG_UNSAFE'));
  assert.throws(() => checkSvg('<g/>', 't'), code('ART_SVG_UNSAFE'));
});

test('safe SVG features are accepted', () => {
  const ok = rectSvg(
    10,
    10,
    '<!-- comment --><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>' +
      '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
      '<path d="M0 0L10 10" fill="url(#g)" filter="url(#f)"/><use href="#g"/>',
  );
  assert.deepEqual(checkSvg('<?xml version="1.0" encoding="UTF-8"?>\n' + ok, 't').viewBox, [0, 0, 10, 10]);
});
