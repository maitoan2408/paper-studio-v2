import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { sampleFrame } from '../scene/sample.ts';
import { contactWorld } from './character.ts';
import { ALIGN_TOLERANCE_PX, anchorOffset, propPivot, segmentAt } from './props.ts';

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

// E2 — nhấc lên trước khi rời chỗ, đặt xuống từ phía trên. Kiểm trên đường đi thật của đạo cụ (không qua hàm kiểm):
// lan nhặt đèn bằng tay trái, tam nhặt chậu bằng tay phải (offset/clear đối xứng gương), tam đặt chậu lên bàn.
for (const [name, f] of Object.entries(films)) {
  test(`${name}: a picked-up prop rises off its spot before its centre leaves it, and lands on its new spot from above`, () => {
    const N = f.data.output.durationFrames;
    let checked = 0;
    for (const p of f.data.props) {
      const a = f.assets.get(p.asset)!;
      const over = (x: number, spot: readonly number[]) => x > spot[0]! - a.pivot[0] * p.scale && x < spot[0]! + (a.width - a.pivot[0]) * p.scale;
      for (let fr = 1; fr < N; fr++) {
        const prev = segmentAt(f, p.id, fr - 1);
        const cur = segmentAt(f, p.id, fr);
        if (prev.holders.length === 0 && cur.holders.length > 0) {
          // Nhặt: tới khi tâm rời chỗ cũ, đáy không thấp hơn chỗ cũ; và tâm PHẢI rời chỗ cũ trong lúc đang cầm.
          let left = false;
          for (let k = fr; k < N && segmentAt(f, p.id, k).holders.length > 0; k++) {
            const pv = propPivot(f, p.id, k, hand(f, k));
            if (!over(pv[0], prev.rest)) { left = true; break; }
            assert.ok(pv[1] >= prev.rest[1] - 0.5, `${p.id} frame ${k}: sinks ${(prev.rest[1] - pv[1]).toFixed(1)} px into its spot`);
            checked++;
          }
          assert.ok(left, `${p.id}: never carried off its spot`);
        }
        if (prev.holders.length > 0 && cur.holders.length === 0) {
          for (let k = fr - 1; k >= 0; k--) {
            const pv = propPivot(f, p.id, k, hand(f, k));
            if (!over(pv[0], cur.rest)) break;
            assert.ok(pv[1] >= cur.rest[1] - 0.5, `${p.id} frame ${k}: comes up through its new spot`);
            checked++;
          }
        }
      }
    }
    assert.ok(checked > 10, `only ${checked} frames checked — test would be vacuous`);
  });
}

/** Phim với clip đã sửa (đột biến dữ liệu chuyển động, không sửa phim). */
function buildWithClip(id: string, clipId: string, mutate: (c: any) => void, mutateFilm: (d: any) => void = () => {}): Film {
  const clips = new Map(motion.clips);
  const c = structuredClone(clips.get(clipId)!) as any;
  mutate(c);
  clips.set(clipId, c);
  const d = raw(id);
  mutateFilm(d);
  return validateFilm(d, packs, new Map([['demo-cast', motion.rig!]]), new Map([['demo-cast', clips], ['sample-m0', new Map()]]));
}

test('PROP_THROUGH_SURFACE: without the lift/clear path the prop is dragged down through its spot — both characters', () => {
  // Bỏ chặng nhấc + kéo (đích có offset/clear): tay đi thẳng từ chỗ nằm xuống cạnh thân như trước E2.
  const flat = (c: any) => {
    for (const ch of c.channels) if (ch.prop === 'reach' && 'role' in ch.target) { delete ch.target.offset; delete ch.target.clear; }
  };
  assert.throws(() => buildWithClip('m2-handover', 'pick-up', flat), code('PROP_THROUGH_SURFACE'));
  assert.throws(() => buildWithClip('m2-plant', 'pick-up', flat), code('PROP_THROUGH_SURFACE'));
  // Đặt lên bàn mà không đưa lên phía trên chỗ đặt trước: chậu đi lên xuyên qua chỗ đặt.
  assert.throws(() => buildWithClip('m2-plant', 'place', flat), code('PROP_THROUGH_SURFACE'));
});

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

// ── Đồng cầm khi trao: MỌI tay trong danh sách đang cầm phải ở đúng anchor của tay đó trên đạo cụ ─────────────
/** Sai số (px thế giới) của từng tay đang cầm ở mỗi frame có ≥ 2 tay cùng cầm; đạo cụ theo tay nắm gần nhất. */
function coHold(f: Film, propId: string): { fr: number; who: string; d: number }[] {
  const out: { fr: number; who: string; d: number }[] = [];
  for (let fr = 0; fr < f.data.output.durationFrames; fr++) {
    const s = segmentAt(f, propId, fr);
    if (s.holders.length < 2) continue;
    const pivot = propPivot(f, propId, fr, hand(f, fr));
    for (const h of s.holders) {
      const off = anchorOffset(f, propId, h.anchor);
      const p = contactWorld(f, h.ci, fr, h.contact);
      out.push({ fr, who: `${f.data.characters[h.ci]!.id}.${h.contact}`, d: Math.hypot(p[0] - pivot[0] - off[0], p[1] - pivot[1] - off[1]) });
    }
  }
  return out;
}
const giveAt = (t: number) => (c: any) => (c.events.find((e: any) => e.type === 'release').t = t);

test('PROP_DISCONTINUITY: a co-holding hand that drifts off its anchor before its release (fixture: give.release.t = 0.60)', () => {
  // Timing cũ đặt NGAY trong fixture (không phụ thuộc dữ liệu pack): Tam (receive) rời điểm gặp từ t = 0.56 kéo đèn
  // theo, Lan (give) đến t = 0.60 mới thả → tay Lan còn trong danh sách đang cầm nhưng đã lệch khỏi quai.
  assert.throws(
    () => buildWithClip('m2-handover', 'give', giveAt(0.6)),
    (e: any) => {
      assert.equal(e.code, 'PROP_DISCONTINUITY', e.message);
      assert.match(e.message, /lantern-1/);
      assert.match(e.message, /frame 27[0-2]\b/);
      assert.match(e.message, /lan\.grip\.l/);
      assert.match(e.message, /\d+\.\d+ px/);
      return true;
    },
  );
});

test('handover data: both hands stay on their anchors for the whole co-hold; the receiver keeps holding after the release', () => {
  const f = films.handover;
  const rows = coHold(f, 'lantern-1');
  assert.ok(new Set(rows.map((r) => r.fr)).size >= 3, 'co-hold too short — test would be vacuous');
  for (const r of rows) assert.ok(r.d <= ALIGN_TOLERANCE_PX, `frame ${r.fr} ${r.who}: ${r.d.toFixed(3)} px`);
  const last = Math.max(...rows.map((r) => r.fr));
  const after = segmentAt(f, 'lantern-1', last + 1).holders;
  assert.deepEqual(after.map((h) => `${f.data.characters[h.ci]!.id}.${h.contact}`), ['tam.grip.l'], 'Tam keeps the lantern after Lan lets go');
});

for (const dur of [95, 98]) {
  test(`handover with give/receive lasting ${dur} frames: co-hold stays on both anchors (frame rounding)`, () => {
    const f = buildWithClip('m2-handover', 'give', () => {}, (d) => {
      for (const t of d.timeline) if (t.clip === 'give' || t.clip === 'receive') t.durationFrames = dur;
      // carry của người nhận nối ngay sau receive, giữ nguyên frame kết thúc (không khe hở, không chồng).
      const recv = d.timeline.find((t: any) => t.clip === 'receive');
      const carry = d.timeline.find((t: any) => t.clip === 'carry' && t.character === recv.character);
      const end = carry.start + carry.durationFrames;
      carry.start = recv.start + dur;
      carry.durationFrames = end - carry.start;
    });
    const rows = coHold(f, 'lantern-1');
    assert.ok(new Set(rows.map((r) => r.fr)).size >= 3, `co-hold too short at ${dur}`);
    for (const r of rows) assert.ok(r.d <= ALIGN_TOLERANCE_PX, `dur ${dur} frame ${r.fr} ${r.who}: ${r.d.toFixed(3)} px`);
  });
}

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
  // Chậu cây quá xa người nhặt: lúc chạm (w = 1) tay không với tới. Dời tương đối (người lùi xa chậu 150 px theo
  // phía đang đứng) để test không gắn tọa độ của một bố cục cụ thể.
  ['IK_UNREACHABLE', mutate('m2-plant', (d) => {
    const tam = d.characters.find((c: any) => c.id === 'tam');
    const plant = d.props.find((p: any) => p.id === 'plant-1');
    tam.x += Math.sign(tam.x - plant.x) * 150;
  })],
];
for (const [c, run] of cases) {
  test(`${c} (props)`, () => assert.throws(run, code(c)));
}
