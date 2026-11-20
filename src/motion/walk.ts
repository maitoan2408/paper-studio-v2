/**
 * Đi bộ — hàm thuần theo frame (kế hoạch bước tính lại từ dữ liệu mỗi lần, không tích lũy).
 *
 * Một lần đi `{character, start, durationFrames, toX}`:
 *  1. Nếu hướng đi ngược hướng đang nhìn: LẬT trong gait.turnFrames frame đầu — facing fx đi từ hướng cũ
 *     qua 0 tới hướng mới theo cos (như lật tờ giấy); chân không bước.
 *  2. Bước: n bước (chẵn, xen kẽ, chân phía trước theo hướng nhìn bước trước). Trong swingRatio đầu của
 *     mỗi bước, một bàn chân dời 2D/n theo inOutSine và nhấc liftRatio·L·sin²(πu); phần còn lại cả hai chân
 *     cùng trụ. Bàn chân trụ ĐỨNG YÊN (khóa sàn).
 *     n = max(2, 2·ceil(D / (strideRatio·L))) với L = chiều dài chân (hông→cổ chân, từ art).
 *  Gốc x đi mượt theo inOutSine trên toàn bộ phần bước (không khựng theo từng bước); tầm với chân được
 *  kiểm ở character.ts. Hướng nhìn sau lần đi = hướng đi, giữ tới lần đi kế tiếp.
 */
import { fail } from '../core/errors.ts';
import { ease } from './easing.ts';
import type { Film } from '../schema/film.ts';

export interface WalkSegment {
  start: number;
  end: number;
  fromX: number;
  toX: number;
  fromSign: 1 | -1;
  dir: 1 | -1;
  turnFrames: number;
  steps: number;
}

export interface WalkState {
  /** Gốc x thế giới (chưa cộng rootX của clip). */
  rootX: number;
  /** Hệ số hướng nhìn ∈ [−1, 1]: dấu = hướng, |fx| < 1 = đang lật. */
  fx: number;
  /** Độ dời đã đi của mỗi chân (px thế giới, dọc hướng đi) và độ nhấc (px art) — chỉ khi đang bước. */
  step?: { lead: 0 | 1; shift: [number, number]; lift: [number, number]; seg: WalkSegment };
  /** Tiến độ bước liên tục (số bước đã đi, có phần lẻ) — cho đung đưa tay. */
  stepPhase: number;
}

export function walkSegments(film: Film, ci: number, legLength: number): WalkSegment[] {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const gait = rig.data.gait;
  const walks = film.data.walks.filter((w) => w.character === c.id).sort((a, b) => a.start - b.start);
  if (walks.length > 0 && !gait) fail('ACTION_PRECONDITION', `film.walks(${c.id})`, `rig ${rig.data.id} has no gait`);
  let x = c.x;
  let sign: 1 | -1 = c.facing === 'right' ? 1 : -1;
  return walks.map((w) => {
    const D = Math.abs(w.toX - x);
    if (D === 0) fail('FILM_SCHEMA', `film.walks(${c.id}@${w.start})`, 'toX equals the current position');
    const dir: 1 | -1 = w.toX > x ? 1 : -1;
    const turnFrames = dir !== sign ? gait!.turnFrames : 0;
    const steps = Math.max(2, 2 * Math.ceil(D / (gait!.strideRatio * legLength * c.scale)));
    if (w.durationFrames - turnFrames < steps * 2) {
      fail('WALK_TOO_SHORT', `film.walks(${c.id}@${w.start})`, `${w.durationFrames} frames for ${turnFrames} turn + ${steps} steps (need ≥ ${turnFrames + steps * 2})`);
    }
    const seg: WalkSegment = { start: w.start, end: w.start + w.durationFrames, fromX: x, toX: w.toX, fromSign: sign, dir, turnFrames, steps };
    x = w.toX;
    sign = dir;
    return seg;
  });
}

export function walkState(film: Film, ci: number, frame: number, legLength: number, liftRatio: number, swingRatio: number): WalkState {
  const c = film.data.characters[ci]!;
  const segs = walkSegments(film, ci, legLength);
  let rootX = c.x;
  let fx: number = c.facing === 'right' ? 1 : -1;
  for (const s of segs) {
    if (frame < s.start) break;
    if (frame >= s.end) {
      rootX = s.toX;
      fx = s.dir;
      continue;
    }
    const k = frame - s.start;
    if (k < s.turnFrames) {
      const u = (k + 1) / s.turnFrames;
      return { rootX: s.fromX, fx: s.fromSign * Math.cos(Math.PI * u), stepPhase: 0 };
    }
    const D = Math.abs(s.toX - s.fromX);
    const stride = (2 * D) / s.steps;
    const tau = ((k - s.turnFrames) / (s.end - s.start - s.turnFrames - 1)) * s.steps; // ∈ [0, steps]; frame cuối = đủ bước
    const i = Math.min(Math.floor(tau), s.steps - 1);
    const u = Math.min(1, (tau - i) / swingRatio);
    const lead: 0 | 1 = 0;
    const done = [Math.ceil(i / 2), Math.floor(i / 2)]; // số bước đã xong của chân dẫn (bước chẵn) và chân sau (bước lẻ)
    const moving = i % 2 === 0 ? 0 : 1;
    const shift: [number, number] = [done[0]! * stride, done[1]! * stride];
    const lift: [number, number] = [0, 0];
    shift[moving] += ease('inOutSine', u) * stride;
    lift[moving] = liftRatio * legLength * Math.sin(Math.PI * u) ** 2; // sin²: nhấc/hạ êm (đạo hàm 0 ở hai đầu)
    shift[0] *= s.dir;
    shift[1] *= s.dir;
    const rx = s.fromX + s.dir * D * ease('inOutSine', tau / s.steps);
    return { rootX: rx, fx: s.dir, step: { lead, shift, lift, seg: s }, stepPhase: tau };
  }
  return { rootX, fx, stepPhase: 0 };
}
