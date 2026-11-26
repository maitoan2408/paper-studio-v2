/**
 * Đạo cụ cầm/đặt/trao — hàm thuần theo frame, tính từ danh sách sự kiện grip/release của timeline.
 *
 * Quy tắc (đã chốt với chủ dự án):
 *  - Frame sự kiện = start + round(t·(duration−1)). Thứ tự: frame, rồi thứ tự timeline, rồi thứ tự trong clip.
 *  - Đạo cụ đi theo tay NẮM GẦN NHẤT (grip muộn nhất còn đang nắm). Khi trao đồ có vài frame cả hai cùng
 *    nắm: đồ đi theo NGƯỜI NHẬN (grip muộn hơn). Tay đó thả → đi theo người còn nắm kế tiếp.
 *  - Không còn ai nắm sau một release → đạo cụ nằm tại bind.place của mục timeline chứa release đó (ĐẶT CÓ KIỂM SOÁT),
 *    hoặc RƠI TỰ DO nếu film.physics có drop trỏ đúng mục timeline đó (src/physics/drop.ts). Không có cả hai →
 *    PROP_FLOATING. Drop trỏ vào lần buông mà người khác vẫn còn cầm (trao tay) → PHYSICS_NOT_FREE.
 *    Đạo cụ giữ góc xoay thế giới của nó (không xoay theo bàn tay); khi rơi, góc do mô phỏng quyết định.
 *  - NHẶT LẠI sau rơi tự do (M3 việc 6): grip trên đạo cụ đang ở đoạn rơi bắt đầu một lần cầm mới tại frame G. Pivot và góc
 *    thế giới lấy từ pose bake ở G−1 (`picked`), giữ nguyên trong tay và cả khi đặt/trao sau đó, tới lần rơi kế tiếp. Hợp lệ
 *    chỉ khi ở G−1 vật đang NẰM YÊN và còn được đỡ (src/physics/drop.ts checkPickups — cần bake nên kiểm sau phát lại sự
 *    kiện); thân Rapier của lần rơi đó rời thế giới từ frame G.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import { clipFor } from './timeline.ts';
import { dropPose } from '../physics/drop.ts';

export interface Holder {
  ci: number;
  contact: string;
  anchor: string;
  since: number;
}
export interface Segment {
  from: number;
  holders: Holder[];
  /** Chỗ nằm yên khi không ai cầm (đặt có kiểm soát / vị trí ban đầu). Với đoạn rơi: dùng restPivot/dropPose. */
  rest: V2;
  /** id drop (film.physics) nếu đoạn này là rơi tự do bắt đầu ở `from`. */
  drop?: string;
  /** Tay vừa buông khi bắt đầu rơi — để giữ lớp vẽ liên tục (sample.ts). */
  releasedBy?: Holder;
  /** Đạo cụ được nhặt lại sau lần rơi `drop` ở frame grip `frame`: pivot/góc nằm yên = pose bake ở frame − 1. Kế thừa qua
   *  các đoạn sau (cầm, trao, đặt) tới lần rơi kế tiếp — góc thế giới của đạo cụ trong suốt khoảng đó. */
  picked?: { drop: string; frame: number; item: number };
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
    let drop: string | undefined;
    // Nhặt lại vật đang ở đoạn rơi tự do: góc/pivot lấy từ bake ở e.frame − 1 (kiểm nằm yên: checkPickups sau khi bake).
    let picked = last.drop ? (e.kind === 'grip' ? { drop: last.drop, frame: e.frame, item: e.item } : undefined) : last.picked;
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
      const free = film.data.physics.find((d) => d.release === e.item);
      if (free && free.prop !== prop) fail('PHYSICS_CONFLICT', `${where} (${free.id})`, `drop is for "${free.prop}" but this release lets go of "${prop}"`);
      if (free && holders.length > 0) {
        fail('PHYSICS_NOT_FREE', `${where} (${free.id})`, `"${prop}" is still held by ${holders.map((h) => `${film.data.characters[h.ci]!.id}.${h.contact}`).join(', ')}; a handover release cannot start a fall`);
      }
      if (holders.length === 0 && free) {
        drop = free.id;
      } else if (holders.length === 0) {
        if (!e.place) fail('PROP_FLOATING', where, `"${prop}" released by its last holder but bind.place is not set`);
        const s = surfaces.get(e.place.surface);
        if (!s) fail('FILM_UNKNOWN_REF', `${where}.bind.place`, `surface "${e.place.surface}" does not exist`);
        if (e.place.x < s.x0 || e.place.x > s.x1) fail('FILM_NOT_ON_SURFACE', `${where}.bind.place`, `x=${e.place.x} outside "${s.id}"`);
        rest = [e.place.x, s.y];
      }
    }
    if (drop) picked = undefined;
    const seg: Segment = { from: e.frame, holders, rest, ...(drop ? { drop, releasedBy: last.holders[last.holders.length - 1]! } : {}), ...(picked ? { picked } : {}) };
    if (last.from === e.frame) list[list.length - 1] = seg;
    else list.push(seg);
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

/** Pivot khi không ai cầm: chỗ nằm yên, hoặc vị trí mô phỏng nếu đang/đã rơi tự do. */
export function restPivot(film: Film, propId: string, frame: number): V2 {
  const s = segmentAt(film, propId, frame);
  if (!s.drop) return s.rest;
  const p = dropPose(film, s.drop, frame);
  return [p.x, p.y];
}

/** Góc thế giới của đạo cụ ở frame (độ, ngược chiều kim đồng hồ): góc dàn cảnh, góc mô phỏng khi rơi, hoặc góc nằm yên
 *  lúc được nhặt lại (giữ nguyên trong tay và sau khi đặt/trao, tới lần rơi kế tiếp). */
export function propAngle(film: Film, propId: string, frame: number): number {
  const s = segmentAt(film, propId, frame);
  if (s.drop) return dropPose(film, s.drop, frame).angle;
  if (s.picked) return dropPose(film, s.picked.drop, s.picked.frame - 1).angle;
  return film.data.props.find((x) => x.id === propId)!.rotation;
}

/** Vector pivot → anchor của đạo cụ trong thế giới (y-lên), theo scale và GÓC THẾ GIỚI của đạo cụ ở frame (propAngle). */
export function anchorOffset(film: Film, propId: string, anchor: string, frame: number): V2 {
  const p = film.data.props.find((x) => x.id === propId)!;
  const a = film.assets.get(p.asset)!;
  const v = artToLocal(a.anchors[anchor]!, a.pivot);
  return rotate([v[0] * p.scale, v[1] * p.scale], propAngle(film, propId, frame));
}

/** Đỉnh khung art của đạo cụ quanh pivot (thế giới, y-lên) theo scale và góc ở frame — đáy/bề ngang cho các kiểm tra mặt đỡ. */
function frameCorners(film: Film, propId: string, frame: number): V2[] {
  const p = film.data.props.find((x) => x.id === propId)!;
  const a = film.assets.get(p.asset)!;
  const ang = propAngle(film, propId, frame);
  return ([[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]] as V2[]).map((c) => {
    const l = artToLocal(c, a.pivot);
    return rotate([l[0] * p.scale, l[1] * p.scale], ang);
  });
}

/**
 * Pivot thế giới của đạo cụ ở frame. `hand(ci, contact)` cho vị trí contact thế giới của nhân vật
 * (truyền từ character.ts để tránh import vòng). Đạo cụ đang được cầm → bám tay nắm gần nhất.
 */
export function propPivot(film: Film, propId: string, frame: number, hand: (ci: number, contact: string) => V2): V2 {
  const s = segmentAt(film, propId, frame);
  if (s.drop) return restPivot(film, propId, frame);
  if (s.holders.length === 0) return s.rest;
  const owner = s.holders[s.holders.length - 1]!;
  const h = hand(owner.ci, owner.contact);
  const off = anchorOffset(film, propId, owner.anchor, frame);
  return [h[0] - off[0], h[1] - off[1]];
}

export const ALIGN_TOLERANCE_PX = 0.5;

/** Đồ đang cầm không được xuyên xuống dưới mặt đỡ của người cầm. Đáy = điểm thấp nhất của khung art theo góc thế giới
 *  (góc 0, pivot ở cạnh đáy: đúng pivot — như trước; vật nhặt lại khi đang nằm nghiêng: góc thấp nhất của khung đã xoay). */
export function checkHeldAboveSurface(film: Film, frame: number, hand: (ci: number, contact: string) => V2): void {
  for (const p of film.data.props) {
    const s = segmentAt(film, p.id, frame);
    if (s.holders.length === 0) continue;
    const owner = s.holders[s.holders.length - 1]!;
    const surface = film.data.stage.surfaces.find((x) => x.id === film.data.characters[owner.ci]!.on)!;
    const y = propPivot(film, p.id, frame, hand)[1] + Math.min(...frameCorners(film, p.id, frame).map((c) => c[1]));
    if (y < surface.y - ALIGN_TOLERANCE_PX) {
      fail('PROP_BELOW_SURFACE', `prop ${p.id} frame ${frame}`, `held ${(surface.y - y).toFixed(1)} px below "${surface.id}"; raise the hand (carry pose)`);
    }
  }
}

/**
 * Nhấc lên trước khi rời chỗ, đặt xuống từ phía trên (không "lún" qua mặt đỡ). Trong một lần cầm:
 *  - từ frame nắm cho tới khi TÂM (pivot x) của đạo cụ lần đầu ra khỏi bề ngang chỗ nó vừa nằm, đáy không được thấp hơn chỗ đó;
 *  - từ lần cuối tâm đi vào bề ngang chỗ sẽ đặt cho tới frame thả, đáy không được thấp hơn chỗ đặt.
 * Bề ngang = khung art × scale quanh pivot, theo góc thế giới khi cầm (góc 0: bbox art). Chỗ nhặt sau rơi tự do = pivot bake
 * ở frame trước grip. Mặt đỡ chưa có chiều sâu (2.5D): ở giữa hai đoạn đó, đồ có thể đi phía trước mặt
 * bàn (thấp hơn mặt bàn). Va chạm đầy đủ theo hình khối thuộc M3 (vật lý thống nhất).
 */
export function checkLiftClearance(film: Film, hand: (ci: number, contact: string, frame: number) => V2): void {
  const N = film.data.output.durationFrames;
  for (const [propId, list] of propTimeline(film)) {
    // Các lần cầm: từ một đoạn đang nằm yên tới đoạn nằm yên kế tiếp (có thể qua nhiều người cầm, vd. trao tay).
    for (let k = 0; k < list.length; k++) {
      if (list[k]!.holders.length === 0 || (k > 0 && list[k - 1]!.holders.length > 0)) continue;
      const from = list[k]!.from;
      const xs = frameCorners(film, propId, from).map((c) => c[0]);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const inside = (x: number, spot: V2) => x > spot[0] + lo && x < spot[0] + hi;
      const origin = k > 0 && list[k - 1]!.drop ? restPivot(film, propId, from - 1) : list[k]!.rest;
      const endIdx = list.findIndex((x, j) => j > k && x.holders.length === 0);
      const to = endIdx < 0 ? N : list[endIdx]!.from;
      const at = (fr: number) => propPivot(film, propId, fr, (ci, c) => hand(ci, c, fr));
      const bad = (fr: number, spot: V2, what: string) =>
        fail('PROP_THROUGH_SURFACE', `prop ${propId} frame ${fr}`, `bottom ${(spot[1] - at(fr)[1]).toFixed(1)} px below the spot ${what} while still over it; lift it clear first`);
      for (let fr = from; fr < to; fr++) {
        const pv = at(fr);
        if (!inside(pv[0], origin)) break;
        if (pv[1] < origin[1] - ALIGN_TOLERANCE_PX) bad(fr, origin, 'where it was picked up');
      }
      if (endIdx >= 0 && !list[endIdx]!.drop) {
        const dest = list[endIdx]!.rest;
        for (let fr = to - 1; fr >= from; fr--) {
          const pv = at(fr);
          if (!inside(pv[0], dest)) break;
          if (pv[1] < dest[1] - ALIGN_TOLERANCE_PX) bad(fr, dest, 'where it is placed');
        }
      }
    }
  }
}

/**
 * Kiểm sau khi film đã dựng: tại frame grip, contact tay trùng anchor đạo cụ (trước khi nắm);
 * tại frame thả về chỗ đặt, contact tay trùng anchor ở vị trí đặt; ở MỌI frame có nhiều tay cùng cầm, từng tay
 * trùng anchor của chính nó trên đạo cụ (đạo cụ theo tay nắm gần nhất; tay đã thả tự do từ chính frame thả).
 * Lệch > ALIGN_TOLERANCE_PX → PROP_DISCONTINUITY.
 */
export function checkProps(film: Film, hand: (ci: number, contact: string, frame: number) => V2): void {
  const N = film.data.output.durationFrames;
  for (const [propId, list] of propTimeline(film)) {
    // Đồng cầm: đoạn [from, from kế tiếp) có ≥ 2 tay; frame thả bắt đầu đoạn mới nên tay vừa thả không bị kiểm.
    list.forEach((seg, k) => {
      if (seg.holders.length < 2) return;
      const owner = seg.holders[seg.holders.length - 1]!;
      const end = k + 1 < list.length ? list[k + 1]!.from : N;
      for (let fr = seg.from; fr < end; fr++) {
        const o = hand(owner.ci, owner.contact, fr);
        const oOff = anchorOffset(film, propId, owner.anchor, fr);
        const pivot: V2 = [o[0] - oOff[0], o[1] - oOff[1]];
        for (const h of seg.holders) {
          if (h === owner) continue;
          const off = anchorOffset(film, propId, h.anchor, fr);
          const got = hand(h.ci, h.contact, fr);
          const d = Math.hypot(got[0] - pivot[0] - off[0], got[1] - pivot[1] - off[1]);
          if (d > ALIGN_TOLERANCE_PX) {
            fail('PROP_DISCONTINUITY', `prop ${propId} frame ${fr}`, `${film.data.characters[h.ci]!.id}.${h.contact} still holds anchor "${h.anchor}" but is ${d.toFixed(2)} px away from it (prop follows ${film.data.characters[owner.ci]!.id}.${owner.contact}); release earlier or keep the hands together`);
          }
        }
      }
    });
    for (let k = 1; k < list.length; k++) {
      const prev = list[k - 1]!;
      const cur = list[k]!;
      const f = cur.from;
      const at = (ci: number, contact: string) => hand(ci, contact, f);
      // Nắm mới: so tay người nắm với anchor đạo cụ theo trạng thái ngay trước sự kiện (đang nằm yên / theo người cầm
      // trước / pose bake ở f − 1 nếu nhặt lại sau rơi tự do — pivot và GÓC của chính frame đó).
      for (const h of cur.holders.filter((x) => x.since === f)) {
        const pivot = prev.holders.length === 0 ? restPivot(film, propId, f - 1) : (() => {
          const o = prev.holders[prev.holders.length - 1]!;
          const p = at(o.ci, o.contact);
          const off = anchorOffset(film, propId, o.anchor, f - 1);
          return [p[0] - off[0], p[1] - off[1]] as V2;
        })();
        const off = anchorOffset(film, propId, h.anchor, f - 1);
        const want: V2 = [pivot[0] + off[0], pivot[1] + off[1]];
        const got = at(h.ci, h.contact);
        const d = Math.hypot(got[0] - want[0], got[1] - want[1]);
        if (d > ALIGN_TOLERANCE_PX) fail('PROP_DISCONTINUITY', `prop ${propId} frame ${f}`, `${film.data.characters[h.ci]!.id}.${h.contact} grips ${d.toFixed(2)} px away from anchor "${h.anchor}"`);
      }
      // Thả về chỗ đặt: tay người thả cuối phải ở đúng anchor tại vị trí đặt.
      if (cur.holders.length === 0 && prev.holders.length > 0 && !cur.drop) {
        const o = prev.holders[prev.holders.length - 1]!;
        const off = anchorOffset(film, propId, o.anchor, f);
        const got = at(o.ci, o.contact);
        const d = Math.hypot(got[0] - (cur.rest[0] + off[0]), got[1] - (cur.rest[1] + off[1]));
        if (d > ALIGN_TOLERANCE_PX) fail('PROP_DISCONTINUITY', `prop ${propId} frame ${f}`, `released ${d.toFixed(2)} px away from its place`);
      }
    }
  }
}
