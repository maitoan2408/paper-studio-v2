/**
 * Art mẫu M1a (Tam, pack xuong-giay): mọi dáng tay có cùng vị trí grip so với cổ tay (pivot), nên đổi dáng tay khi
 * đang cầm đồ không làm đồ nhảy. Lan chưa có art M1a (đợt sau) nên chưa kiểm ở đây.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { validateAction } from '../schema/action.ts';
import { propPivot } from '../motion/props.ts';
import { contactWorld } from '../motion/character.ts';

const PACK = 'assets/xuong-giay';
const pack = loadArtPack(PACK);
const motion = loadPackMotion(pack);
const rig = motion.rig!;
const tam = rig.data.characters.find((c) => c.id === 'tam')!;

test('Tam: every hand form keeps the grip at the same offset from the wrist pivot (both hands)', () => {
  for (const bone of ['hand.l', 'hand.r']) {
    const skin = tam.skin[bone]!;
    const ids = [skin.default, ...Object.values(skin.variants ?? {})];
    assert.ok(ids.length >= 4, `${bone}: expected 4 hand forms, found ${ids.length}`);
    const offs = ids.map((id) => {
      const a = pack.assets.get(id)!;
      return [a.anchors['grip']![0] - a.pivot[0], a.anchors['grip']![1] - a.pivot[1]];
    });
    for (const [k, o] of offs.entries()) assert.deepEqual(o, offs[0], `${bone} ${ids[k]}: grip − pivot = ${o} ≠ ${offs[0]}`);
  }
});

test('Tam: torso and pelvis exist in three directions with the joint anchors the rig needs', () => {
  for (const bone of ['torso', 'pelvis']) {
    const skin = tam.skin[bone]!;
    assert.deepEqual(Object.keys(skin.variants ?? {}).sort(), ['side', 'three-quarter']);
    const need = Object.keys(pack.assets.get(skin.default)!.anchors).sort();
    for (const id of Object.values(skin.variants!)) assert.deepEqual(Object.keys(pack.assets.get(id)!.anchors).sort(), need, id);
  }
});

/** m2-handover trên skin xuong-giay; tùy chọn: Tam đổi tay trái fist → open giữa lúc đang bê đèn (f340). */
function handover(switchHand: boolean): Film {
  const raw = JSON.parse(readFileSync('examples/films/m2-handover.json', 'utf8'));
  const sample = loadArtPack('assets/sample-m0');
  raw.packs = [sample, pack].map((p) => ({ id: p.id, version: p.version, manifestSha256: p.manifestSha256 }));
  for (const c of raw.characters) c.pack = 'xuong-giay';
  const clips = new Map(motion.clips);
  if (switchHand) {
    clips.set('hand-swap', validateAction({
      schemaVersion: 1, id: 'hand-swap', rig: rig.data.id, events: [], requires: {},
      channels: [{ bone: 'hand.l', prop: 'variant', mode: 'absolute', keys: [{ t: 0, v: 'default' }, { t: 0.5, v: 'open', ease: 'step' }] }],
    }, rig));
    raw.timeline.push({ character: 'tam', clip: 'hand-swap', start: 330, durationFrames: 21, bind: {}, layer: 2 });
  }
  return validateFilm(raw, new Map([['sample-m0', sample], ['xuong-giay', pack]]), new Map([['xuong-giay', rig]]), new Map([['xuong-giay', clips], ['sample-m0', new Map()]]));
}

test('Tam switching hand form while carrying the lantern: the lantern does not jump at the switch frame', () => {
  const plain = handover(false), swapped = handover(true);
  const hand = (f: Film, fr: number) => (ci: number, contact: string) => contactWorld(f, ci, fr, contact);
  for (let fr = 335; fr <= 345; fr++) {
    const a = propPivot(plain, 'lantern-1', fr, hand(plain, fr));
    const b = propPivot(swapped, 'lantern-1', fr, hand(swapped, fr));
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9, `frame ${fr}: lantern moved ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(2)} px when the hand form changed`);
  }
});
