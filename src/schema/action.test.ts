import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAction } from './action.ts';
import { validateRig } from './rig.ts';
import { rigFixture } from './rig-fixture.ts';
import { code } from './test-helpers.ts';

const rig = () => {
  const f = rigFixture();
  return validateRig(f.rig, f.pack);
};

/** Hai clip khác kiểu: vẫy tay (xoay + đổi bàn tay) và nhặt-thả (grip/release). */
const wave = () => ({
  schemaVersion: 1,
  id: 'wave',
  rig: 'biped-test',
  channels: [
    { bone: 'upper-arm.@active', prop: 'rotation', mode: 'offset',
      keys: [{ t: 0, v: 0, ease: 'inOutSine' }, { t: 0.3, v: 120, ease: 'inOutSine' }, { t: 1, v: 0 }] },
    { bone: 'hand.@active', prop: 'variant', mode: 'absolute', keys: [{ t: 0, v: 'default' }, { t: 0.5, v: 'fist', ease: 'step' }] },
  ],
  events: [],
  requires: { hands: ['hand.@active'] },
});
const pickPlace = () => ({
  schemaVersion: 1,
  id: 'pick-place',
  rig: 'biped-test',
  channels: [{ bone: 'pelvis', prop: 'rootY', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'inOutCubic' }, { t: 0.5, v: -20, ease: 'inOutCubic' }, { t: 1, v: 0 }] }],
  events: [
    { t: 0.6, type: 'release', contact: 'grip.@active', release: { from: 'fist', to: 'default', maxDegPerFrame: 22.5 } },
    { t: 0.3, type: 'grip', contact: 'grip.@active', target: 'item' },
  ],
  requires: { hands: ['hand.@active'], props: [{ role: 'item', anchors: ['grip'] }], contacts: ['grip.@active'] },
});

test('two different clips validate for both hands (@active → l and r)', () => {
  const r = rig();
  assert.equal(validateAction(wave(), r).id, 'wave');
  assert.equal(validateAction(pickPlace(), r).events.length, 2);
});

test('hand-specific clip (explicit .r) also validates', () => {
  const w = wave();
  w.channels[0]!.bone = 'upper-arm.r';
  validateAction(w, rig());
});

const cases: [string, () => unknown][] = [
  ['ACTION_SCHEMA', () => ({ ...wave(), extra: 1 })],
  ['ACTION_SCHEMA', () => { const w: any = wave(); w.channels[0].keys[1].ease = 'bouncy'; return w; }],
  ['ACTION_SCHEMA', () => { const w: any = wave(); delete w.channels[0].keys[0].ease; return w; }],
  ['ACTION_SCHEMA', () => { const w: any = wave(); w.channels[0].keys[1].t = 1.2; return w; }],
  ['ACTION_SCHEMA', () => { const w: any = wave(); w.channels[1].keys[1].ease = 'linear'; return w; }],
  ['ACTION_SCHEMA', () => { const w: any = wave(); w.channels[0].prop = 'scale'; return w; }],
  ['ACTION_RIG_MISMATCH', () => ({ ...wave(), rig: 'quadruped' })],
  ['ACTION_KEYS_UNSORTED', () => { const w: any = wave(); w.channels[0].keys[1].t = 0; return w; }],
  ['ACTION_KEYS_UNSORTED', () => { const w: any = wave(); w.channels[0].keys[0].t = 0.1; return w; }],
  ['ACTION_UNKNOWN_BONE', () => { const w: any = wave(); w.channels[0].bone = 'tail'; return w; }],
  ['ACTION_UNKNOWN_BONE', () => { const w: any = wave(); w.channels[0].bone = 'torso.@active'; return w; }],
  ['ACTION_UNKNOWN_BONE', () => { const p: any = pickPlace(); p.channels[0].bone = 'torso'; return p; }],
  ['ACTION_UNKNOWN_BONE', () => { const p: any = pickPlace(); p.events[0].contact = 'sole.@active'; p.events[1].contact = 'sole.@active'; return p; }],
  ['ACTION_UNKNOWN_BONE', () => { const p: any = pickPlace(); p.requires.contacts = ['pinch.@active']; return p; }],
  ['ACTION_UNKNOWN_VARIANT', () => { const w: any = wave(); w.channels[1].keys[1].v = 'point'; return w; }],
  ['ACTION_UNKNOWN_VARIANT', () => { const p: any = pickPlace(); p.events[0].release.to = 'open'; return p; }],
  ['ACTION_EVENT_ORDER', () => { const p: any = pickPlace(); p.events[0].t = 0.1; return p; }],
  ['ACTION_EVENT_ORDER', () => { const p: any = pickPlace(); p.events.push({ ...p.events[1], t: 0.4 }); return p; }],
];

for (const [c, make] of cases) {
  test(`${c}: ${make.toString().slice(6, 90)}`, () => {
    assert.throws(() => validateAction(make(), rig()), code(c));
  });
}
