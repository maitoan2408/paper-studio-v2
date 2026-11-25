/**
 * M3 việc 5 — phát hiện TRƯỚC RENDER đạo cụ đang rơi trúng nhân vật. Chỉ phát hiện: quỹ đạo bake (drop.ts) vẫn là nguồn
 * chuyển động; nhân vật không có trong thế giới Rapier.
 *
 * Hệ tọa độ: thế giới (px, y-lên) — cùng hệ với quỹ đạo bake và characterState, không qua camera.
 *  - Vùng cơ thể: mỗi phần cơ thể (xương) = KHUNG ART của sprite, đặt đúng như renderer vẽ (src/scene/sample.ts puppet):
 *    tâm P = root + (fx·pos.x·s, pos.y·s); điểm art q (quanh pivot) → x·sign·squash·s, y·s; xoay góc thế giới sign·angle;
 *    co ngang |fx| (paperX) quanh P. Kết quả: hình bình hành lồi.
 *  - Đạo cụ: đúng collider của drop (hộp = khung art; hull = điểm art khai báo) đặt theo pose bake (pivot, góc).
 *  - Trúng: hai đa giác lồi giao nhau (định lý trục tách, có diện tích chung > 0; chạm cạnh không tính).
 * Thời điểm: chỉ xét lúc vật ĐANG RƠI — frame có state falling/airborne (gồm nảy lên lại); nằm yên/trượt trên mặt không
 * xét (cảnh 2,5D không có chiều sâu: vật đặt trước chân nhân vật vẫn chồng hình mà không "trúng"). Đi nhanh giữa hai
 * frame: nội suy tuyến tính pose vật (pivot, góc) và mọi đỉnh vùng cơ thể giữa f−1 và f, số mẫu n = ⌈dịch chuyển lớn nhất
 * / SWEEP_STEP_PX⌉ ⇒ không bỏ sót vật thể dày hơn SWEEP_STEP_PX. Trúng trong (f−1, f] ⇒ báo frame f (như quy ước bước con).
 * Khoảng (R−1, R]: từ pose cầm tay ở R−1 (pivot init, góc dàn cảnh) tới pose bake ở R.
 * Tay lúc buông: ở R vật còn chồng lên người buông (tay, và thân — đồ cầm trước người trong 2,5D). Người buông được miễn
 * cho tới mẫu ĐẦU TIÊN vật tách hẳn khỏi MỌI phần cơ thể của họ (graceEnd); sau đó quay lại trúng họ vẫn bị bắt. Nhân
 * vật khác không có miễn trừ.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import { characterState } from '../motion/character.ts';
import { propTimeline } from '../motion/props.ts';
import { forwardKinematics } from '../rig/pose.ts';
import { dropBake } from './drop.ts';

/** Bước nội suy tối đa giữa hai mẫu (px thế giới). */
export const SWEEP_STEP_PX = 2;

export interface BodyPart { character: string; ci: number; bone: string; poly: V2[] }

/** Các phần cơ thể của nhân vật ci ở frame (đa giác thế giới, theo đúng hình học sprite của renderer). */
export function bodyParts(film: Film, ci: number, frame: number): BodyPart[] {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const pack = film.packs.get(c.pack)!;
  const st = characterState(film, ci, frame);
  const parts = forwardKinematics(rig, pack, c.character, { angle: (b) => st.angles.get(b)!, variant: (b) => st.variants.get(b) ?? 'default' });
  const sign = st.fx >= 0 ? 1 : -1, paper = Math.abs(st.fx), s = c.scale;
  return parts.map((part) => {
    const P: V2 = [st.root[0] + st.fx * part.pos[0] * s, st.root[1] + part.pos[1] * s];
    const sq = st.squash.get(part.bone) ?? 1;
    const a = part.asset;
    const poly = ([[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]] as V2[]).map((corner) => {
      const q = artToLocal(corner, a.pivot);
      const r = rotate([sign * sq * s * q[0], s * q[1]], sign * part.angle);
      return [P[0] + paper * r[0], P[1] + r[1]] as V2;
    });
    return { character: c.id, ci, bone: part.bone, poly };
  });
}

/** Đa giác collider của đạo cụ (thế giới) với pivot và góc cho trước. */
export function propPolygon(film: Film, dropId: string, pivot: V2, angle: number): V2[] {
  const d = film.data.physics.find((x) => x.id === dropId)!;
  const prop = film.data.props.find((p) => p.id === d.prop)!;
  const a = film.assets.get(prop.asset)!;
  const pts: V2[] = d.body.collider?.type === 'hull' ? d.body.collider.points : [[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]];
  return pts.map((p) => {
    const l = artToLocal(p, a.pivot);
    const r = rotate([l[0] * prop.scale, l[1] * prop.scale], angle);
    return [pivot[0] + r[0], pivot[1] + r[1]] as V2;
  });
}

const axes = (poly: V2[]): V2[] => poly.map((p, i) => { const q = poly[(i + 1) % poly.length]!; return [-(q[1] - p[1]), q[0] - p[0]] as V2; });
const project = (poly: V2[], ax: V2) => { let lo = Infinity, hi = -Infinity; for (const p of poly) { const v = p[0] * ax[0] + p[1] * ax[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi] as const; };

/** Hai đa giác lồi có phần chung diện tích > 0 (SAT; chạm cạnh = không giao). */
export function intersects(a: V2[], b: V2[]): boolean {
  for (const ax of [...axes(a), ...axes(b)]) {
    if (ax[0] === 0 && ax[1] === 0) continue;
    const [a0, a1] = project(a, ax), [b0, b1] = project(b, ax);
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

const segDist = (p: V2, a: V2, b: V2) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** Khoảng cách giữa hai đa giác lồi không giao (0 nếu giao). */
export function polyDistance(a: V2[], b: V2[]): number {
  if (intersects(a, b)) return 0;
  let d = Infinity;
  for (const [P, Q] of [[a, b], [b, a]] as const) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i]!, Q[(i + 1) % Q.length]!));
  return d;
}

const lerp = (a: V2[], b: V2[], t: number): V2[] => a.map((p, i) => [p[0] + (b[i]![0] - p[0]) * t, p[1] + (b[i]![1] - p[1]) * t] as V2);
const maxDisp = (a: V2[], b: V2[]) => a.reduce((m, p, i) => Math.max(m, Math.hypot(b[i]![0] - p[0], b[i]![1] - p[1])), 0);

export interface FallingHitReport {
  drop: string;
  prop: string;
  releaser: string;
  releaseFrame: number;
  /** Mẫu đầu tiên vật tách hẳn khỏi người buông (frame, phần frame đã đi trong (f−1, f]), null nếu không tách khi đang rơi. */
  graceEnd: { frame: number; t: number } | null;
  /** Lần trúng đầu tiên (null nếu không). */
  hit: { frame: number; t: number; character: string; bone: string } | null;
  /** Mẫu sượt gần nhất không trúng (khoảng cách px) trong các frame đang rơi, với mọi nhân vật trừ người buông lúc miễn. */
  nearest: { frame: number; t: number; character: string; bone: string; distance: number } | null;
  /** Như nearest nhưng theo từng nhân vật (khóa = id nhân vật). */
  nearestByCharacter: Record<string, { frame: number; t: number; bone: string; distance: number }>;
}

/** Quét mọi drop của film (thứ tự id), trả báo cáo — không ném lỗi (để test/chẩn đoán). */
export function fallingHits(film: Film): FallingHitReport[] {
  const out: FallingHitReport[] = [];
  for (const d of [...film.data.physics].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const b = dropBake(film, d.id);
    const seg = propTimeline(film).get(d.prop)!.find((s) => s.drop === d.id)!;
    const rci = seg.releasedBy!.ci;
    const releaser = film.data.characters[rci]!.id;
    const prop = film.data.props.find((p) => p.id === d.prop)!;
    const rep: FallingHitReport = { drop: d.id, prop: d.prop, releaser, releaseFrame: b.releaseFrame, graceEnd: null, hit: null, nearest: null, nearestByCharacter: {} };
    let grace = true;
    for (const q of b.poses) {
      if (q.state !== 'falling' && q.state !== 'airborne') continue;
      const f = q.frame;
      const prev = f === b.releaseFrame ? { x: b.init.pivot[0], y: b.init.pivot[1], angle: prop.rotation } : b.poses[f - 1 - b.releaseFrame]!;
      const A0 = propPolygon(film, d.id, [prev.x, prev.y], prev.angle), A1 = propPolygon(film, d.id, [q.x, q.y], q.angle);
      const bodies0 = film.data.characters.flatMap((_, ci) => bodyParts(film, ci, f - 1));
      const bodies1 = film.data.characters.flatMap((_, ci) => bodyParts(film, ci, f));
      let n = Math.max(1, Math.ceil(maxDisp(A0, A1) / SWEEP_STEP_PX));
      for (let i = 0; i < bodies1.length; i++) n = Math.max(n, Math.ceil(maxDisp(bodies0[i]!.poly, bodies1[i]!.poly) / SWEEP_STEP_PX));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        // pose vật nội suy (pivot + góc) rồi dựng đa giác — giữ đúng hình dạng khi xoay
        const angle = prev.angle + (q.angle - prev.angle) * t;
        const A = propPolygon(film, d.id, [prev.x + (q.x - prev.x) * t, prev.y + (q.y - prev.y) * t], angle);
        const parts = bodies1.map((p, i) => ({ ...p, poly: lerp(bodies0[i]!.poly, p.poly, t) }));
        if (grace && !parts.some((p) => p.ci === rci && intersects(A, p.poly))) {
          grace = false;
          rep.graceEnd = { frame: f, t };
        }
        for (const p of parts) {
          if (grace && p.ci === rci) continue;
          if (intersects(A, p.poly)) {
            if (!rep.hit) rep.hit = { frame: f, t, character: p.character, bone: p.bone };
          } else {
            const dist = polyDistance(A, p.poly);
            if (!rep.nearest || dist < rep.nearest.distance) rep.nearest = { frame: f, t, character: p.character, bone: p.bone, distance: dist };
            const nc = rep.nearestByCharacter[p.character];
            if (!nc || dist < nc.distance) rep.nearestByCharacter[p.character] = { frame: f, t, bone: p.bone, distance: dist };
          }
        }
        if (rep.hit) break;
      }
      if (rep.hit) break;
    }
    out.push(rep);
  }
  return out;
}

/** Validator (trước render): vật đang rơi trúng nhân vật ⇒ PHYSICS_HITS_CHARACTER (lần trúng sớm nhất của mọi drop). */
export function checkFallingProps(film: Film): void {
  const hits = fallingHits(film).filter((r) => r.hit).sort((a, b) => a.hit!.frame - 1 + a.hit!.t - (b.hit!.frame - 1 + b.hit!.t) || (a.drop < b.drop ? -1 : 1));
  const r = hits[0];
  if (!r) return;
  const h = r.hit!;
  fail('PHYSICS_HITS_CHARACTER', `film.physics(${r.drop}) frame ${h.frame}`, `falling "${r.prop}" hits ${h.character} (${h.bone}) between frames ${h.frame - 1} and ${h.frame} (at ${(h.frame - 1 + h.t).toFixed(3)})${h.character === r.releaser ? ` — it had left ${r.releaser}'s body at frame ${r.graceEnd?.frame} and came back` : ''}`);
}
