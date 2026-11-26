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
 * Thời điểm: xét từng BƯỚC CON theo trạng thái đỡ của chính mô phỏng (DropPose.subSupportedBy — cùng tiêu chí "đỡ" với
 * supportedBy: điểm chịu xung lực, pháp tuyến hướng lên, vₙ ≤ g·h). Bước con k bị BỎ QUA chỉ khi vật được đỡ cả ở đầu lẫn
 * cuối bước (đầu bước 1 = cuối frame trước; frame khóa nằm yên: supported của frame; khoảng (R−1, R] luôn xét vì vật vừa
 * rời tay). Vì vậy giữ phần bay ngay trước lần chạm đầu (bước con chạm = đầu chưa đỡ, cuối đỡ), bỏ phần đã được đỡ liên
 * tục, và xét lại ngay khi vật nảy / lăn / trượt khỏi điểm tựa (đầu đỡ, cuối không). Nằm yên/trượt đã được đỡ liên tục
 * không xét (2,5D không có chiều sâu: vật đặt trước chân nhân vật vẫn chồng hình mà không "trúng").
 * Quét theo BƯỚC CON: đường đi của vật là các pose pivot sau từng bước con (DropPose.sub, mô phỏng thật — không nội suy
 * qua cú đáp/nảy); giữa hai bước con liên tiếp chia đều sao cho mỗi mẫu dịch ≤ SWEEP_STEP_PX (vật và mọi đỉnh vùng cơ thể,
 * vùng cơ thể nội suy tuyến tính giữa frame f−1 và f theo thời điểm bước con). Góc nội suy theo HIỆU NGẮN NHẤT (góc dàn
 * cảnh 360/−360 so với góc Rapier 0, hoặc qua biên ±180°, không tạo vòng quay giả). Trúng trong bước con k của frame f
 * ⇒ báo "frame f, substep k/SUBSTEPS". Khoảng (R−1, R] bắt đầu từ pose cầm tay ở R−1 (pivot init, góc dàn cảnh).
 * Đa giác collider = BAO LỒI của các điểm (src/core/hull.ts, như Rapier dựng) — không phụ thuộc thứ tự điểm nhập.
 * Tay lúc buông: lúc buông (pose cầm tay ở R−1, cơ thể ở R−1) các phần cơ thể người buông đang chồng vật là TIẾP XÚC
 * BAN ĐẦU (exemptAtRelease); mỗi phần chỉ còn là tiếp xúc ban đầu chừng nào còn chồng LIÊN TỤC.
 *  - CHẶN (PHYSICS_HITS_CHARACTER): nhân vật khác bị chồng; người buông bị chồng SAU graceEnd = mẫu đầu tiên vật không còn
 *    chồng phần nào của người buông (vật đã rời hẳn rồi quay lại).
 *  - CHỈ BÁO (releaserNewContacts, chưa chặn): trước graceEnd, một phần KHÁC của người buông (không thuộc tiếp xúc ban đầu
 *    còn kéo dài) bắt đầu chồng vật — vd. m3-drop: chậu rơi trước chân Tam đang bước, foot.l chồng ở f164 bước 3/8. Cảnh
 *    2,5D không có thông tin trước/sau (vật vẽ trong lượt của người buông, trước thân/chân), nên chặn hay không chờ quyết
 *    định của chủ dự án / Codex về chiều sâu lớp. Nhân vật khác không có miễn trừ.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import { characterState } from '../motion/character.ts';
import { propTimeline } from '../motion/props.ts';
import { forwardKinematics } from '../rig/pose.ts';
import { dropBake, SUBSTEPS, type DropPose } from './drop.ts';
import { convexHull } from '../core/hull.ts';

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
  const pts: V2[] = d.body.collider?.type === 'hull' ? convexHull(d.body.collider.points) : [[0, 0], [a.width, 0], [a.width, a.height], [0, a.height]];
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

/** Nội suy góc (độ) theo hiệu NGẮN NHẤT ∈ [−180, 180): 360→0 hay 179→−179 không thành một vòng quay giả. */
export function lerpAngle(a0: number, a1: number, u: number): number {
  const da = ((((a1 - a0) % 360) + 540) % 360) - 180;
  return a0 + da * u;
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
  /** Lần trúng đầu tiên (null nếu không): frame, bước con 1..SUBSTEPS, t ∈ (0, 1] trong frame. */
  hit: { frame: number; substep: number; t: number; character: string; bone: string } | null;
  /** Phần cơ thể người buông chồng vật lúc buông (tiếp xúc ban đầu, kéo dài khi còn chồng liên tục). */
  exemptAtRelease: string[];
  /** Tiếp xúc MỚI ở vùng khác của người buông trước graceEnd (lần đầu mỗi xương) — báo, chưa chặn (xem đầu file). */
  releaserNewContacts: { frame: number; substep: number; t: number; bone: string }[];
  /** Mẫu sượt gần nhất không trúng (khoảng cách px) trong các frame đang rơi, với mọi nhân vật trừ người buông lúc miễn. */
  nearest: { frame: number; t: number; character: string; bone: string; distance: number } | null;
  /** Như nearest nhưng theo từng nhân vật (khóa = id nhân vật). */
  nearestByCharacter: Record<string, { frame: number; t: number; bone: string; distance: number }>;
}

/** Báo cáo đã tính cho từng film (validator tính một lần; CLI validate đọc lại cảnh báo từ đây, không quét lại). */
const reports = new WeakMap<Film, readonly FallingHitReport[]>();

/** Quét mọi drop của film (thứ tự id), trả báo cáo — không ném lỗi (để test/chẩn đoán). Kết quả được nhớ theo film. */
export function fallingHits(film: Film): readonly FallingHitReport[] {
  let out = reports.get(film);
  if (!out) { out = scan(film); reports.set(film, out); }
  return out;
}

function scan(film: Film): FallingHitReport[] {
  const out: FallingHitReport[] = [];
  for (const d of [...film.data.physics].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const b = dropBake(film, d.id);
    const seg = propTimeline(film).get(d.prop)!.find((s) => s.drop === d.id)!;
    const rci = seg.releasedBy!.ci;
    const releaser = film.data.characters[rci]!.id;
    const prop = film.data.props.find((p) => p.id === d.prop)!;
    const rep: FallingHitReport = { drop: d.id, prop: d.prop, releaser, releaseFrame: b.releaseFrame, graceEnd: null, hit: null, nearest: null, nearestByCharacter: {}, exemptAtRelease: [], releaserNewContacts: [] };
    const pose = (fr: number) => b.poses[fr - b.releaseFrame];
    /** Vật được đỡ sau bước con k của frame q (k = 1..số bước; frame khóa nằm yên không có bước con: supported của frame). */
    const heldAfter = (q: DropPose, k: number) => (q.subSupportedBy.length ? q.subSupportedBy[k - 1]!.length > 0 : q.supported);
    let exempt: Set<string> | null = null; // tiếp xúc ban đầu của người buông còn kéo dài
    let grace = true; // chưa rời hẳn người buông
    for (const q of b.poses) {
      const f = q.frame;
      const before = f === b.releaseFrame ? null : pose(f - 1)!;
      const prev = before ?? { x: b.init.pivot[0], y: b.init.pivot[1], angle: b.init.angle }; // góc trong tay ở R−1
      // đường đi trong frame: pose đầu khoảng + pose sau từng bước con (frame khóa nghỉ không có sub ⇒ chỉ pose frame)
      const path: [number, number, number][] = [[prev.x, prev.y, prev.angle], ...(q.sub.length ? q.sub : [[q.x, q.y, q.angle] as [number, number, number]])];
      const steps = path.length - 1;
      // held[k] = được đỡ ở đầu/cuối khoảng thứ k (held[0] = cuối frame trước; lúc buông: còn trong tay ⇒ chưa được đỡ).
      const held = [before ? heldAfter(before, before.subSupportedBy.length || 1) : false];
      for (let k = 1; k <= steps; k++) held.push(heldAfter(q, k));
      const flying = (k: number) => !(held[k - 1] && held[k]); // đã được đỡ liên tục suốt bước con k ⇒ không xét
      if (![...Array(steps).keys()].some((i) => flying(i + 1))) continue;
      const bodies0 = film.data.characters.flatMap((_, ci) => bodyParts(film, ci, f - 1));
      const bodies1 = film.data.characters.flatMap((_, ci) => bodyParts(film, ci, f));
      if (!exempt) {
        const A0 = propPolygon(film, d.id, [prev.x, prev.y], prev.angle);
        exempt = new Set(bodies0.filter((p) => p.ci === rci && intersects(A0, p.poly)).map((p) => p.bone));
        rep.exemptAtRelease = [...exempt].sort();
        if (exempt.size === 0) { grace = false; rep.graceEnd = { frame: f, t: 0 }; }
      }
      for (let k = 1; k <= steps; k++) {
        if (!flying(k)) continue;
        const [x0, y0, a0] = path[k - 1]!, [x1, y1, a1] = path[k]!;
        const t0 = (k - 1) / steps, t1 = k / steps;
        const P0 = propPolygon(film, d.id, [x0, y0], a0), P1 = propPolygon(film, d.id, [x1, y1], lerpAngle(a0, a1, 1));
        const B0 = bodies1.map((p, i) => lerp(bodies0[i]!.poly, p.poly, t0)), B1 = bodies1.map((p, i) => lerp(bodies0[i]!.poly, p.poly, t1));
        let n = Math.max(1, Math.ceil(maxDisp(P0, P1) / SWEEP_STEP_PX));
        for (let i = 0; i < bodies1.length; i++) n = Math.max(n, Math.ceil(maxDisp(B0[i]!, B1[i]!) / SWEEP_STEP_PX));
        for (let m = 1; m <= n; m++) {
          const u = m / n, t = t0 + (t1 - t0) * u;
          const A = propPolygon(film, d.id, [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u], lerpAngle(a0, a1, u));
          const parts = bodies1.map((p, i) => ({ ...p, poly: lerp(B0[i]!, B1[i]!, u) }));
          const sub = Math.round(steps === SUBSTEPS ? k : Math.ceil(t * SUBSTEPS));
          const hits = parts.map((p) => intersects(A, p.poly));
          if (grace && !parts.some((p, i) => p.ci === rci && hits[i])) {
            grace = false; // vật đã rời hẳn người buông
            exempt.clear();
            rep.graceEnd = { frame: f, t };
          }
          parts.forEach((p, i) => {
            const hit = hits[i]!;
            if (p.ci === rci && grace) {
              if (exempt!.has(p.bone)) { if (!hit) exempt!.delete(p.bone); return; } // tiếp xúc ban đầu kéo dài / vừa tách
              if (hit && !rep.releaserNewContacts.some((c) => c.bone === p.bone)) rep.releaserNewContacts.push({ frame: f, substep: sub, t, bone: p.bone });
              return;
            }
            if (hit) {
              if (!rep.hit) rep.hit = { frame: f, substep: sub, t, character: p.character, bone: p.bone };
            } else {
              const dist = polyDistance(A, p.poly);
              if (!rep.nearest || dist < rep.nearest.distance) rep.nearest = { frame: f, t, character: p.character, bone: p.bone, distance: dist };
              const nc = rep.nearestByCharacter[p.character];
              if (!nc || dist < nc.distance) rep.nearestByCharacter[p.character] = { frame: f, t, bone: p.bone, distance: dist };
            }
          });
          if (rep.hit) break;
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
  fail('PHYSICS_HITS_CHARACTER', `film.physics(${r.drop}) frame ${h.frame}`, `falling "${r.prop}" hits ${h.character} (${h.bone}) at frame ${h.frame} substep ${h.substep}/${SUBSTEPS} (t ${(h.frame - 1 + h.t).toFixed(3)})${h.character === r.releaser ? ` — it had left ${r.releaser}'s body at frame ${r.graceEnd?.frame} and came back` : ''}`);
}

/**
 * Cảnh báo (không chặn) cho người dựng phim: tiếp xúc MỚI của vật với một vùng khác của người buông trước khi vật rời hẳn
 * người đó (releaserNewContacts). Mỗi dòng nêu phim, drop/đạo cụ, người buông, xương, frame và bước con; thứ tự: drop theo
 * id, rồi theo thời gian. Dùng báo cáo validator đã tính cho film (fallingHits nhớ theo film).
 */
export function releaserContactWarnings(film: Film): string[] {
  return fallingHits(film).flatMap((r) => r.releaserNewContacts.map((c) =>
    `PHYSICS_RELEASER_NEW_CONTACT: ${film.data.id} film.physics(${r.drop}) — "${r.prop}" overlaps a new region of its releaser ${r.releaser}: ${c.bone} at frame ${c.frame} substep ${c.substep}/${SUBSTEPS} (t ${(c.frame - 1 + c.t).toFixed(3)}), before leaving ${r.releaser}'s body; not blocked — review the 2.5D layering in the video (draw order only explains the picture)`));
}
