/**
 * Bộ giải điểm tương tác (M2/E1) — tổng quát, không công thức riêng cho cảnh nào.
 *
 * Đặc tả `film.points[id]`: neo (anchor art thân nhân vật hoặc anchor đạo cụ, có trọng số) + ràng buộc
 * (các chuỗi tay phải chạm điểm, kèm chiều khuỷu; khoảng hở của đồ treo tại điểm so với mặt đỡ).
 * Điểm được giải TẠI FRAME TIẾP XÚC (sự kiện grip/release/contact sớm nhất của các mục timeline dùng điểm,
 * hoặc `frame` chỉ định), trên tư thế nhân vật ở chính frame đó (đã gồm đi bộ/quay), bỏ qua các kênh reach
 * nhắm vào chính điểm này. Khả thi = với mọi chuỗi tay: IK có nghiệm ở w = 1 đúng chiều khuỷu, mọi góc trong
 * giới hạn khớp; và khoảng hở đạt. Bắt đầu từ trung bình có trọng số của neo; không khả thi → tìm điểm khả thi
 * gần nhất trên các vòng tròn đồng tâm (thứ tự cố định → tất định). Không có → INTERACTION_INFEASIBLE.
 * Khả thi được kiểm tại frame tiếp xúc (lọc nhanh) rồi trên MỌI frame mà kênh reach nhắm vào điểm có trọng số > 0,
 * với đúng phép trộn FK↔IK mà validator thấy (trộn tuyến tính giữa hai tư thế trong giới hạn vẫn trong giới hạn).
 * Sau đó điểm cố định trong thế giới. Kết quả ghi nhớ theo film (hàm thuần).
 */
import { fail, StudioError } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import { forwardKinematics, contactPoint } from '../rig/pose.ts';
import { solveChain } from './ik.ts';
import { characterState, type CharacterState } from './character.ts';
import { anchorOffset, propBottom, propPivot } from './props.ts';
import { activeItems, clipFor, keyValue } from './timeline.ts';

const cache = new WeakMap<Film, Map<string, V2>>();
/** Bước tìm kiếm (px thế giới). Bán kính tối đa suy ra từ dữ liệu: tổng tầm với của các tay tham gia. */
const STEP = 2;

function spec(film: Film, id: string) {
  const s = film.data.points?.[id];
  if (!s) return fail('FILM_UNKNOWN_REF', `film.points.${id}`, 'interaction point is not defined');
  return s;
}

/** Frame tiếp xúc: `frame` chỉ định, hoặc sự kiện grip/release/contact sớm nhất của các mục dùng điểm này. */
export function contactFrame(film: Film, id: string): number {
  const s = spec(film, id);
  if (s.frame !== undefined) return s.frame;
  let best = Infinity;
  for (const it of film.data.timeline) {
    if (!Object.values(it.bind.points ?? {}).some((p) => 'use' in p && p.use === id)) continue;
    const c = film.data.characters.find((x) => x.id === it.character)!;
    for (const e of clipFor(film, c.pack, it.clip).events) best = Math.min(best, it.start + Math.round(e.t * (it.durationFrames - 1)));
  }
  if (best === Infinity) fail('INTERACTION_NO_CONTACT', `film.points.${id}`, 'no grip/release/contact event uses this point; set `frame`');
  return best;
}

export function solvedPoint(film: Film, id: string): V2 {
  let m = cache.get(film);
  if (!m) cache.set(film, (m = new Map()));
  const hit = m.get(id);
  if (hit) return hit;
  const p = solve(film, id);
  m.set(id, p);
  return p;
}

/** Lý do điểm P không khả thi cho điểm tương tác `id` (undefined = khả thi). Dùng để chẩn đoán/dàn cảnh. */
export function explainPoint(film: Film, id: string, P: V2): string | undefined {
  return context(film, id).why(P);
}

function solve(film: Film, id: string): V2 {
  const { start, why, maxRadius, f } = context(film, id);
  const reason = why(start);
  if (!reason) return start;
  for (let r = STEP; r <= maxRadius; r += STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / STEP));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const P: V2 = [start[0] + r * Math.cos(a), start[1] + r * Math.sin(a)];
      if (!why(P)) return P;
    }
  }
  return fail('INTERACTION_INFEASIBLE', `film.points.${id} frame ${f}`, `no feasible point within ${maxRadius.toFixed(0)} px of the anchors' mean (${reason}); move the characters closer`);
}

function context(film: Film, id: string) {
  const s = spec(film, id);
  const f = contactFrame(film, id);
  const ignore = new Set([id]);
  const ciOf = (cid: string) => {
    const i = film.data.characters.findIndex((c) => c.id === cid);
    if (i < 0) fail('FILM_UNKNOWN_REF', `film.points.${id}`, `character "${cid}" does not exist`);
    return i;
  };
  const states = new Map<string, CharacterState>();
  const stateAt = (ci: number, fr: number) => {
    const key = `${ci}:${fr}`;
    let st = states.get(key);
    if (!st) states.set(key, (st = characterState(film, ci, fr, ignore)));
    return st;
  };
  const stateOf = (ci: number) => stateAt(ci, f);
  /** Các frame (và trọng số) mà nhân vật dùng điểm này qua kênh reach. */
  const windowOf = (ci: number, contact: string): [number, number][] => {
    const out: [number, number][] = [];
    for (let fr = 0; fr < film.data.output.durationFrames; fr++) {
      let w = 0;
      for (const a of activeItems(film, ci, fr)) {
        for (const ch of a.clip.channels) {
          if (ch.prop !== 'reach' || !('point' in ch.target)) continue;
          const b = a.item.bind.points?.[ch.target.point];
          const ct = a.side ? ch.contact.replace('.@active', `.${a.side}`) : ch.contact;
          if (b && 'use' in b && b.use === id && ct === contact) w = Math.max(w, a.w * keyValue(ch.keys, a.t));
        }
      }
      if (w > 0) out.push([fr, w]);
    }
    return out;
  };
  const windows = new Map<string, [number, number][]>();
  const partsOf = (ci: number) => {
    const c = film.data.characters[ci]!;
    const st = stateOf(ci);
    return forwardKinematics(film.rigs.get(c.pack)!, film.packs.get(c.pack)!, c.character, { angle: (b) => st.angles.get(b)!, variant: (b) => st.variants.get(b) ?? 'default' });
  };
  const toWorld = (ci: number, local: V2): V2 => {
    const st = stateOf(ci);
    return [st.root[0] + st.fx * st.scale * local[0], st.root[1] + st.scale * local[1]];
  };
  const hand = (ci: number, contact: string) => {
    const c = film.data.characters[ci]!;
    return toWorld(ci, contactPoint(film.rigs.get(c.pack)!, partsOf(ci), contact));
  };

  // 1. Điểm xuất phát: trung bình có trọng số của neo.
  let sx = 0, sy = 0, sw = 0;
  for (const a of s.anchors) {
    const w = a.weight ?? 1;
    let pt: V2;
    if ('character' in a) {
      const ci = ciOf(a.character);
      const part = partsOf(ci).find((p) => p.bone === a.bone);
      const an = part?.asset.anchors[a.anchor];
      if (!part || !an) fail('RIG_ANCHOR_MISSING', `film.points.${id}`, `${a.character}: bone "${a.bone}" has no anchor "${a.anchor}"`);
      const v = rotate(artToLocal(an, part.asset.pivot), part.angle);
      pt = toWorld(ci, [part.pos[0] + v[0], part.pos[1] + v[1]]);
    } else {
      if (!film.data.props.some((p) => p.id === a.prop)) fail('FILM_UNKNOWN_REF', `film.points.${id}`, `prop "${a.prop}" does not exist`);
      const pv = propPivot(film, a.prop, f, hand);
      const off = anchorOffset(film, a.prop, a.anchor, f);
      pt = [pv[0] + off[0], pv[1] + off[1]];
    }
    sx += w * pt[0];
    sy += w * pt[1];
    sw += w;
  }
  const start: V2 = [sx / sw, sy / sw];

  // 2. Khả thi?
  /** Một người, một frame, một trọng số: IK (đúng chiều khuỷu) có nghiệm và mọi góc trộn trong giới hạn? */
  const check = (P: V2, r: (typeof s.reach)[number], fr: number, w: number): string | undefined => {
    const ci = ciOf(r.character);
    const c = film.data.characters[ci]!;
    const rig = film.rigs.get(c.pack)!;
    const st = stateAt(ci, fr);
    const chain = Object.entries(rig.data.ik ?? {}).find(([, k]) => k.contact === r.contact)?.[0];
    if (!chain) return `${r.character}: no IK chain ends at "${r.contact}"`;
    if (Math.abs(st.fx) < 1) return `${r.character} is turning at frame ${fr}`;
    const local: V2 = [(P[0] - st.root[0]) / (st.fx * st.scale), (P[1] - st.root[1]) / st.scale];
    let ang: Map<string, number>;
    try {
      ang = solveChain(rig, film.packs.get(c.pack)!, c.character, { angle: (b) => st.angles.get(b)!, variant: (b) => st.variants.get(b) ?? 'default' }, chain, local, w, r.bend === 'flip');
    } catch (e) {
      if (e instanceof StudioError) return `${r.character}.${chain} frame ${fr}: ${e.detail}`;
      throw e;
    }
    for (const [b, v] of ang) {
      const lim = rig.order.find((x) => x.id === b)!.limits;
      if (v < lim.min - 1e-9 || v > lim.max + 1e-9) return `${r.character}.${b} = ${v.toFixed(1)}° outside [${lim.min}, ${lim.max}] at frame ${fr}`;
    }
    return undefined;
  };
  const why = (P: V2): string | undefined => {
    for (const r of s.reach) {
      const bad = check(P, r, f, 1);
      if (bad) return bad;
    }
    for (const r of s.reach) {
      const key = `${r.character}/${r.contact}`;
      let win = windows.get(key);
      if (!win) windows.set(key, (win = windowOf(ciOf(r.character), r.contact)));
      for (const [fr, w] of win) {
        const bad = check(P, r, fr, w);
        if (bad) return bad;
      }
    }
    for (const cl of s.clearance ?? []) {
      const holder = film.data.characters[ciOf(s.reach[0]!.character)]!;
      const surface = film.data.stage.surfaces.find((x) => x.id === holder.on)!;
      const bottom = P[1] - anchorOffset(film, cl.prop, cl.anchor, f)[1] + propBottom(film, cl.prop, f); // đáy khung đã xoay
      if (bottom < surface.y) return `${cl.prop} would hang ${(surface.y - bottom).toFixed(1)} px below "${surface.id}"`;
    }
    return undefined;
  };
  // Bán kính tìm kiếm = tổng tầm với (px thế giới) của các tay tham gia — từ art + tỷ lệ, không hằng số.
  let maxRadius = 0;
  for (const r of s.reach) {
    const ci = ciOf(r.character);
    const c = film.data.characters[ci]!;
    const rig = film.rigs.get(c.pack)!;
    const chain = Object.values(rig.data.ik ?? {}).find((k) => k.contact === r.contact);
    if (!chain) continue;
    const parts = partsOf(ci);
    const up = parts.find((p) => p.bone === chain.upper)!.pos;
    const hand = contactPoint(rig, parts, r.contact);
    maxRadius += Math.hypot(hand[0] - up[0], hand[1] - up[1]) * c.scale;
  }
  return { start, why, maxRadius, f };
}
