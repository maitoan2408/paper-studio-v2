/**
 * Đạo cụ cầm/đặt/trao — hàm thuần theo frame, tính từ danh sách sự kiện grip/release của timeline.
 *
 * Quy tắc (đã chốt với chủ dự án):
 *  - Frame sự kiện = start + round(t·(duration−1)). Thứ tự: frame, rồi thứ tự timeline, rồi thứ tự trong clip.
 *  - Đạo cụ đi theo tay NẮM GẦN NHẤT (grip muộn nhất còn đang nắm). Khi trao đồ có vài frame cả hai cùng
 *    nắm: đồ đi theo NGƯỜI NHẬN (grip muộn hơn). Tay đó thả → đi theo người còn nắm kế tiếp.
 *  - Không còn ai nắm sau một release → đạo cụ nằm tại bind.place của mục timeline chứa release đó.
 *    Thiếu place → PROP_FLOATING. Đạo cụ giữ góc xoay thế giới của nó (không xoay theo bàn tay).
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import { clipFor } from './timeline.ts';

export interface Holder {
  ci: number;
  contact: string;
  anchor: string;
  since: number;
}
interface Segment {
  from: number;
  holders: Holder[];
  rest: V2;
}
interface PropEvent {
  frame: number;
  kind: 'grip' | 'release';
  ci: number;
  contact: string;
  prop?: string;
  anchor: string;
  item: number;
  order: number;
  place?: { surface: string; x: number };
}

const cache = new WeakMap<Film, Map<string, Segment[]>>();

function events(film: Film): PropEvent[] {
  const out: PropEvent[] = [];
  const chars = new Map(film.data.characters.map((c, i) => [c.id, i]));
  film.data.timeline.forEach((it, item) => {
    const ci = chars.get(it.character)!;
    const c = film.data.characters[ci]!;
    const clip = clipFor(film, c.pack, it.clip);
    const ev = clip.events.filter((e) => e.type === 'grip' || e.type === 'release');
    if (ev.length > 0 && (it.repeat ?? 1) !== 1) fail('ACTION_PRECONDITION', `film.timeline[${item}]`, 'grip/release clips cannot repeat');
    ev.forEach((e, order) => {
      const contact = it.bind.active ? e.contact.replace('.@active', `.${it.bind.active}`) : e.contact;
      const frame = it.start + Math.round(e.t * (it.durationFrames - 1));
      if (e.type === 'grip') {
        const prop = it.bind.roles?.[e.target];
        if (!prop) fail('ACTION_PRECONDITION', `film.timeline[${item}].bind.roles.${e.target}`, `grip needs a prop for role "${e.target}"`);
        out.push({ frame, kind: 'grip', ci, contact, prop, anchor: e.anchor, item, order });
      } else {
        out.push({ frame, kind: 'release', ci, contact, anchor: '', item, order, ...(it.bind.place ? { place: it.bind.place } : {}) });
      }
    });
  });
  return out.sort((a, b) => a.frame - b.frame || a.item - b.item || a.order - b.order);
}

/** Phát lại toàn bộ sự kiện một lần → các đoạn trạng thái của từng đạo cụ (ghi nhớ theo film). */
export function propTimeline(film: Film): Map<string, Segment[]> {
  const hit = cache.get(film);
  if (hit) return hit;
  const segs = new Map<string, Segment[]>();
  const holding = new Map<string, string>(); // `${ci}/${contact}` → prop
  for (const p of film.data.props) segs.set(p.id, [{ from: 0, holders: [], rest: [p.x, p.y] }]);
  const surfaces = new Map(film.data.stage.surfaces.map((s) => [s.id, s]));
  for (const e of events(film)) {
    const key = `${e.ci}/${e.contact}`;
    const where = `film.timeline[${e.item}] frame ${e.frame}`;
    const prop = e.kind === 'grip' ? e.prop! : holding.get(key);
    if (!prop) fail('ACTION_EVENT_ORDER', where, `release by ${film.data.characters[e.ci]!.id}.${e.contact} which holds nothing`);
    const list = segs.get(prop);
    if (!list) fail('FILM_UNKNOWN_REF', where, `prop "${prop}" does not exist`);
    const last = list[list.length - 1]!;
    let holders = last.holders;
    let rest = last.rest;
    if (e.kind === 'grip') {
      if (holding.has(key)) fail('HAND_BUSY', where, `${film.data.characters[e.ci]!.id}.${e.contact} already holds "${holding.get(key)}"`);
      if (holders.length >= 2) fail('HAND_BUSY', where, `prop "${prop}" already held by two hands`);
      const asset = film.assets.get(film.data.props.find((p) => p.id === prop)!.asset)!;
      if (!asset.anchors[e.anchor]) fail('ACTION_PRECONDITION', where, `prop "${prop}" (${asset.id}) lacks anchor "${e.anchor}"`);
      holding.set(key, prop);
      holders = [...holders, { ci: e.ci, contact: e.contact, anchor: e.anchor, since: e.frame }];
    } else {
      holding.delete(key);
      holders = holders.filter((h) => !(h.ci === e.ci && h.contact === e.contact));
      if (holders.length === 0) {
        if (!e.place) fail('PROP_FLOATING', where, `"${prop}" released by its last holder but bind.place is not set`);
        const s = surfaces.get(e.place.surface);
        if (!s) fail('FILM_UNKNOWN_REF', `${where}.bind.place`, `surface "${e.place.surface}" does not exist`);
        if (e.place.x < s.x0 || e.place.x > s.x1) fail('FILM_NOT_ON_SURFACE', `${where}.bind.place`, `x=${e.place.x} outside "${s.id}"`);
        rest = [e.place.x, s.y];
      }
    }
    if (last.from === e.frame) list[list.length - 1] = { from: e.frame, holders, rest };
    else list.push({ from: e.frame, holders, rest });
  }
  cache.set(film, segs);
  return segs;
}

export function segmentAt(film: Film, propId: string, frame: number): Segment {
  const list = propTimeline(film).get(propId);
  if (!list) return fail('FILM_UNKNOWN_REF', `prop ${propId}`, 'no such prop');
  let s = list[0]!;
  for (const x of list) if (x.from <= frame) s = x;
  return s;
}

/** Vector pivot → anchor của đạo cụ trong thế giới (y-lên), theo scale và góc của đạo cụ. */
export function anchorOffset(film: Film, propId: string, anchor: string): V2 {
  const p = film.data.props.find((x) => x.id === propId)!;
  const a = film.assets.get(p.asset)!;
  const v = artToLocal(a.anchors[anchor]!, a.pivot);
  return rotate([v[0] * p.scale, v[1] * p.scale], p.rotation);
}

/**
 * Pivot thế giới của đạo cụ ở frame. `hand(ci, contact)` cho vị trí contact thế giới của nhân vật
 * (truyền từ character.ts để tránh import vòng). Đạo cụ đang được cầm → bám tay nắm gần nhất.
 */
export function propPivot(film: Film, propId: string, frame: number, hand: (ci: number, contact: string) => V2): V2 {
  const s = segmentAt(film, propId, frame);
  if (s.holders.length === 0) return s.rest;
  const owner = s.holders[s.holders.length - 1]!;
  const h = hand(owner.ci, owner.contact);
  const off = anchorOffset(film, propId, owner.anchor);
  return [h[0] - off[0], h[1] - off[1]];
}

export const ALIGN_TOLERANCE_PX = 0.5;

/** Đồ đang cầm không được xuyên xuống dưới mặt đỡ của người cầm (pivot đạo cụ = đáy của nó). */
export function checkHeldAboveSurface(film: Film, frame: number, hand: (ci: number, contact: string) => V2): void {
  for (const p of film.data.props) {
    const s = segmentAt(film, p.id, frame);
    if (s.holders.length === 0) continue;
    const owner = s.holders[s.holders.length - 1]!;
    const surface = film.data.stage.surfaces.find((x) => x.id === film.data.characters[owner.ci]!.on)!;
    const y = propPivot(film, p.id, frame, hand)[1];
    if (y < surface.y - ALIGN_TOLERANCE_PX) {
      fail('PROP_BELOW_SURFACE', `prop ${p.id} frame ${frame}`, `held ${(surface.y - y).toFixed(1)} px below "${surface.id}"; raise the hand (carry pose)`);
    }
  }
}

/**
 * Kiểm sau khi film đã dựng: tại frame grip, contact tay trùng anchor đạo cụ (trước khi nắm);
 * tại frame thả về chỗ đặt, contact tay trùng anchor ở vị trí đặt. Lệch > 0.5 px → PROP_DISCONTINUITY.
 */
export function checkProps(film: Film, hand: (ci: number, contact: string, frame: number) => V2): void {
  for (const [propId, list] of propTimeline(film)) {
    for (let k = 1; k < list.length; k++) {
      const prev = list[k - 1]!;
      const cur = list[k]!;
      const f = cur.from;
      const at = (ci: number, contact: string) => hand(ci, contact, f);
      // Nắm mới: so tay người nắm với anchor đạo cụ theo trạng thái ngay trước sự kiện.
      for (const h of cur.holders.filter((x) => x.since === f)) {
        const pivot = prev.holders.length === 0 ? prev.rest : (() => {
          const o = prev.holders[prev.holders.length - 1]!;
          const p = at(o.ci, o.contact);
          const off = anchorOffset(film, propId, o.anchor);
          return [p[0] - off[0], p[1] - off[1]] as V2;
        })();
        const off = anchorOffset(film, propId, h.anchor);
        const want: V2 = [pivot[0] + off[0], pivot[1] + off[1]];
        const got = at(h.ci, h.contact);
        const d = Math.hypot(got[0] - want[0], got[1] - want[1]);
        if (d > ALIGN_TOLERANCE_PX) fail('PROP_DISCONTINUITY', `prop ${propId} frame ${f}`, `${film.data.characters[h.ci]!.id}.${h.contact} grips ${d.toFixed(2)} px away from anchor "${h.anchor}"`);
      }
      // Thả về chỗ đặt: tay người thả cuối phải ở đúng anchor tại vị trí đặt.
      if (cur.holders.length === 0 && prev.holders.length > 0) {
        const o = prev.holders[prev.holders.length - 1]!;
        const off = anchorOffset(film, propId, o.anchor);
        const got = at(o.ci, o.contact);
        const d = Math.hypot(got[0] - (cur.rest[0] + off[0]), got[1] - (cur.rest[1] + off[1]));
        if (d > ALIGN_TOLERANCE_PX) fail('PROP_DISCONTINUITY', `prop ${propId} frame ${f}`, `released ${d.toFixed(2)} px away from its place`);
      }
    }
  }
}
