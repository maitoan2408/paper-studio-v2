import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { code } from '../schema/test-helpers.ts';
import { buildPanel, SHEET_CLIP, splitVariants, viewCenter, bodyBox } from './build.ts';
import { cropRgba, encodePng } from './png.ts';
import { parseSheet, type SheetPanel } from './spec.ts';
import { sampleFrame } from '../scene/sample.ts';

const panel = (p: object): SheetPanel => parseSheet({ schemaVersion: 1, id: 't', title: 't', panels: [p] }).panels[0]!;

test('PNG: signature, IHDR size, and the pixels round-trip through zlib', () => {
  const rgba = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 1, 2, 3, 4]);
  const png = encodePng(2, 2, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 2);
  assert.equal(png.readUInt32BE(20), 2);
  const idat = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.deepEqual([...raw], [0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
  assert.throws(() => encodePng(3, 2, rgba));
});

test('crop: inside copies pixels, outside is filled with the background', () => {
  const src = Buffer.alloc(4 * 4 * 4, 7);
  const c = cropRgba(src, 4, 4, 3, 3, 2, 2, [1, 2, 3, 4]);
  assert.deepEqual([...c.subarray(0, 4)], [7, 7, 7, 7]);
  assert.deepEqual([...c.subarray(4, 8)], [1, 2, 3, 4]);
});

test('SHEET_SCHEMA: unknown fields, bad film paths and empty sheets are rejected', () => {
  assert.throws(() => parseSheet({ schemaVersion: 1, id: 't', title: 't', panels: [] }), code('SHEET_SCHEMA'));
  assert.throws(() => panel({ label: 'x', character: 'tam', source: { film: { film: '../etc/x.json', frame: 0 } } }), code('SHEET_SCHEMA'));
  assert.throws(() => panel({ label: 'x', character: 'tam', source: { pose: { pack: 'xuong-giay' } }, extra: 1 }), code('SHEET_SCHEMA'));
});

test('film panel: reskin demo-cast → xuong-giay keeps the motion; the sheet clip only drives the photographed character', () => {
  const p = panel({
    label: 'x', character: 'tam',
    source: { film: { film: 'examples/films/m2-handover.json', frame: 266, reskin: { 'demo-cast': 'xuong-giay' } } },
    variants: { 'hand.r': 'open' },
  });
  const b = buildPanel(p, new Map());
  assert.deepEqual(b.film.data.packs.map((x) => x.id), ['sample-m0', 'xuong-giay']);
  assert.ok(b.film.data.characters.every((c) => c.pack === 'xuong-giay'));
  const sheetItems = b.film.data.timeline.filter((t) => t.clip === SHEET_CLIP);
  assert.equal(sheetItems.length, 1);
  assert.equal(sheetItems[0]!.character, 'tam');
  assert.equal(sheetItems[0]!.durationFrames, b.film.data.output.durationFrames, 'variant spans the whole film (no switch frame)');
});

test('variants missing from a skin are reported, not silently swapped', () => {
  const b = buildPanel(panel({ label: 'x', character: 'lan', source: { pose: { pack: 'xuong-giay', scale: 1.1 } }, variants: { 'hand.r': 'point', head: 'side' } }), new Map());
  assert.deepEqual(b.variants, { head: 'side' });
  assert.deepEqual(b.missing, ['hand.r:point']);
  const rig = b.film.rigs.get('xuong-giay')!;
  assert.deepEqual(splitVariants(rig, 'lan', { torso: 'nope' }).missing, ['torso:nope']);
});

test('pose panel: absolute angles go through the validator (joint limits) and the view centres on the requested bone', () => {
  assert.throws(() => buildPanel(panel({ label: 'x', character: 'tam', source: { pose: { pack: 'xuong-giay', angles: { 'hand.r': 60 } } } }), new Map()), code('ACTION_LIMIT_EXCEEDED'));
  const b = buildPanel(panel({ label: 'x', character: 'tam', source: { pose: { pack: 'xuong-giay', angles: { 'hand.r': 45 } } } }), new Map());
  const sf = sampleFrame(b.film, 0);
  const hand = sf.sprites.find((s) => s.id === 'tam/hand.r')!;
  assert.deepEqual(viewCenter(b, sf, 'hand.r'), [hand.x, hand.y]);
  const box = bodyBox(b, sf);
  const [cx, cy] = viewCenter(b, sf, 'body');
  assert.ok(box.x0 < cx && cx < box.x1 && box.y0 < cy && cy < box.y1);
  assert.ok(box.y1 - box.y0 > 400, 'whole body including the hat fits the box');
});
