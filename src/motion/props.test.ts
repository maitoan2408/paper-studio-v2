import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { contactWorld } from './character.ts';
import { anchorOffset, propPivot, segmentAt } from './props.ts';

const packs = new Map(['sample-m0', 'demo-cast'].map((x) => [x, loadArtPack(`assets/${x}`)]));
const motion = loadPackMotion(packs.get('demo-cast')!);
const raw = (id: string) => JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));
const build = (data: unknown): Film =>
  validateFilm(data, packs, new Map([['demo-cast', motion.rig!]]), new Map([['demo-cast', motion.clips], ['sample-m0', new Map()]]));
const films = { handover: build(raw('m2-handover')), plant: build(raw('m2-plant')) };

const hand = (f: Film, fr: number) => (ci: number, contact: string) => contactWorld(f, ci, fr, contact);

for (const [name, f] of Object.entries(films)) {
  test(`${name}: a held prop's anchor sits exactly in the holding hand on every frame`, () => {
    let held = 0;
    for (let fr = 0; fr < f.data.output.durationFrames; fr++) {
      for (const p of f.data.props) {
        const s = segmentAt(f, p.id, fr);
        if (s.holders.length === 0) continue;
        held++;
        const owner = s.holders[s.holders.length - 1]!;
        const pivot = propPivot(f, p.id, fr, hand(f, fr));
        const off = anchorOffset(f, p.id, owner.anchor);
        const h = contactWorld(f, owner.ci, fr, owner.contact);
        assert.ok(Math.hypot(pivot[0] + off[0] - h[0], pivot[1] + off[1] - h[1]) < 1e-6, `${p.id} frame ${fr}`);
      }
    }
    assert.ok(held > 50, `prop held on only ${held} frames — test would be vacuous`);
  });

  // "Không nhảy" = đạo cụ không bao giờ tách khỏi thứ giữ nó. Khi đang cầm: trùng tay (test trên).
  // Ở frame đổi trạng thái (cầm/thả/trao): độ dời đạo cụ ≤ độ dời bàn tay liên quan + 0.5 px.
  // Khi nằm yên: pivot đúng trên một mặt đỡ.
  test(`${name}: no teleport at grip/release/handover frames; resting props sit on a surface`, () => {
    const surfaceYs = new Set(f.data.stage.surfaces.map((s) => s.y));
    let changes = 0;
    for (const p of f.data.props) {
      for (let fr = 1; fr < f.data.output.durationFrames; fr++) {
        const s = segmentAt(f, p.id, fr);
        const cur = propPivot(f, p.id, fr, hand(f, fr));
        if (s.holders.length === 0) assert.ok(surfaceYs.has(cur[1]), `${p.id} floats at frame ${fr} (y=${cur[1]})`);
        if (s.from !== fr) continue;
        changes++;
        const prevSeg = segmentAt(f, p.id, fr - 1);
        const prev = propPivot(f, p.id, fr - 1, hand(f, fr - 1));
        const hands = [...prevSeg.holders, ...s.holders].map((h) => {
          const a = contactWorld(f, h.ci, fr - 1, h.contact);
          const b = contactWorld(f, h.ci, fr, h.contact);
          return Math.hypot(b[0] - a[0], b[1] - a[1]);
        });
        const moved = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
        assert.ok(moved <= Math.max(0, ...hands) + 0.5, `${p.id} teleports ${moved.toFixed(2)} px at frame ${fr}`);
      }
    }
    assert.ok(changes >= 2, 'no grip/release in film — test would be vacuous');
  });

  test(`${name}: a held prop is drawn inside its holder, just before the gripping hand`, () => {
    for (let fr = 0; fr < f.data.output.durationFrames; fr += 7) {
      const ids = sampleFrame(f, fr).sprites.map((s) => s.id);
      for (const p of f.data.props) {
        const s = segmentAt(f, p.id, fr);
        if (s.holders.length === 0) continue;
        const o = s.holders[s.holders.length - 1]!;
        const c = f.data.characters[o.ci]!;
        const bone = f.rigs.get(c.pack)!.data.contacts[o.contact]!.bone;
        assert.equal(ids[ids.indexOf(`${c.id}/${bone}`) - 1], p.id, `frame ${fr}`);
      }
    }
  });
}

test('handover: while both hold, the prop follows the receiver (most recent grip)', () => {
  const f = films.handover;
  let both = 0;
  for (let fr = 0; fr < f.data.output.durationFrames; fr++) {
    const s = segmentAt(f, 'lantern-1', fr);
    if (s.holders.length < 2) continue;
    both++;
    assert.equal(f.data.characters[s.holders[1]!.ci]!.id, 'tam');
    const pivot = propPivot(f, 'lantern-1', fr, hand(f, fr));
    const off = anchorOffset(f, 'lantern-1', 'grip');
    const h = contactWorld(f, s.holders[1]!.ci, fr, s.holders[1]!.contact);
    assert.ok(Math.hypot(pivot[0] + off[0] - h[0], pivot[1] + off[1] - h[1]) < 1e-6);
  }
  assert.ok(both >= 3, `both hands held for only ${both} frames`);
});

test('the two films cover both hands, both characters and two different props', () => {
  const used = new Set<string>();
  for (const f of Object.values(films)) {
    for (const p of f.data.props) {
      for (let fr = 0; fr < f.data.output.durationFrames; fr++) {
        for (const h of segmentAt(f, p.id, fr).holders) used.add(`${f.data.characters[h.ci]!.id}:${h.contact}:${p.asset}`);
      }
    }
  }
  const s = [...used].join(' ');
  assert.match(s, /tam:grip\.l/);
  assert.match(s, /tam:grip\.r/);
  assert.match(s, /lan:grip\.l/);
  assert.match(s, /:lantern/);
  assert.match(s, /:plant/);
});

const mutate = (id: string, fn: (d: any) => void) => () => {
  const d = raw(id);
  fn(d);
  build(d);
};
const item = (d: any, clip: string, ch?: string) => d.timeline.find((t: any) => t.clip === clip && (!ch || t.character === ch));
const cases: [string, () => void][] = [
  ['PROP_FLOATING', mutate('m2-handover', (d) => delete item(d, 'place-low').bind.place)],
  ['FILM_NOT_ON_SURFACE', mutate('m2-handover', (d) => (item(d, 'place-low').bind.place.x = 5000))],
  ['HAND_BUSY', mutate('m2-plant', (d) => d.timeline.push({ ...item(d, 'pick-up'), start: 100, layer: 2, bind: { active: 'r', roles: { item: 'lantern-1' } } }))],
  ['ACTION_EVENT_ORDER', mutate('m2-plant', (d) => (d.timeline = d.timeline.filter((t: any) => t.clip !== 'pick-up' && t.clip !== 'carry')))],
  ['PROP_TARGET_HELD', mutate('m2-handover', (d) => (item(d, 'receive').clip = 'pick-up'))],
  // Người nhận dùng một điểm cố định lệch khỏi điểm giải của người đưa → hai tay không gặp nhau lúc cầm.
  ['PROP_DISCONTINUITY', mutate('m2-handover', (d) => (item(d, 'receive').bind.points.meet = { x: 20, y: 262 }))],
  // Đèn to hơn một chút so với tầm tay của tam → chạm sàn khi đang bê (trước khi chạm giới hạn khớp).
  ['PROP_BELOW_SURFACE', mutate('m2-handover', (d) => (d.props.find((p: any) => p.id === 'lantern-1').scale = 0.92))],
  ['ACTION_PRECONDITION', mutate('m2-handover', (d) => delete item(d, 'pick-up').bind.roles)],
  // Chậu cây đặt quá xa trên bàn: lúc chạm (w = 1) tay không với tới.
  ['IK_UNREACHABLE', mutate('m2-plant', (d) => (d.props.find((p: any) => p.id === 'plant-1').x = -450))],
];
for (const [c, run] of cases) {
  test(`${c} (props)`, () => assert.throws(run, code(c)));
}
