/**
 * Đi bộ — hàm thuần theo frame (kế hoạch bước tính lại từ dữ liệu mỗi lần, không tích lũy).
 *
 * Một lần đi `{character, start, durationFrames, toX}`:
 *  1. Nếu hướng đi ngược hướng đang nhìn: LẬT trong gait.turnFrames frame đầu — facing fx đi từ hướng cũ
 *     qua 0 tới hướng mới theo cos (như lật tờ giấy); chân không bước. Xem flipFx: khoảnh khắc nghiêng hẳn
 *     (fx = 0, hình bề ngang 0) luôn nằm đúng GIỮA hai frame, không bao giờ được lấy mẫu.
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
import { restPivot, segmentAt } from './props.ts';

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

/** Vị trí x của nhân vật chỉ theo các lần đi (nội suy tuyến tính) — đủ để biết hướng tương đối, không đệ quy qua lần quay. */
function walkOnlyX(film: Film, ci: number, frame: number): number {
  const c = film.data.characters[ci]!;
  let x = c.x;
  for (const w of film.data.walks.filter((v) => v.character === c.id).sort((a, b) => a.start - b.start)) {
    if (frame >= w.start + w.durationFrames) x = w.toX;
    else if (frame >= w.start) return x + (w.toX - x) * ((frame - w.start) / w.durationFrames);
  }
  return x;
}

/** Hướng của một lần quay: tuyệt đối, hoặc về phía nhân vật/đạo cụ ở frame bắt đầu (giữ hướng cũ nếu trùng x). */
function faceSign(film: Film, ci: number, face: NonNullable<Film['data']['turns']>[number]['face'], x: number, frame: number, current: 1 | -1): 1 | -1 {
  if (face === 'left') return -1;
  if (face === 'right') return 1;
  let tx: number;
  if ('character' in face) {
    const oi = film.data.characters.findIndex((c) => c.id === face.character);
    if (oi < 0 || oi === ci) fail('FILM_UNKNOWN_REF', `film.turns(${film.data.characters[ci]!.id}@${frame}).face`, `character "${face.character}" is not another character`);
    tx = walkOnlyX(film, oi, frame);
  } else {
    if (!film.data.props.some((p) => p.id === face.prop)) fail('FILM_UNKNOWN_REF', `film.turns(${film.data.characters[ci]!.id}@${frame}).face`, `prop "${face.prop}" does not exist`);
    const seg = segmentAt(film, face.prop, frame);
    const holder = seg.holders[seg.holders.length - 1];
    if (holder && holder.ci === ci) fail('ACTION_PRECONDITION', `film.turns(${film.data.characters[ci]!.id}@${frame}).face`, `cannot turn to face "${face.prop}" while holding it`);
    tx = holder ? walkOnlyX(film, holder.ci, frame) : restPivot(film, face.prop, frame)[0];
  }
  return tx === x ? current : tx > x ? 1 : -1;
}

/**
 * Chuỗi locomotion của nhân vật: các lần đi (`film.walks`) và quay tại chỗ (`film.turns`) theo thời gian.
 * Quay: không đổi x; lật như tờ giấy trong durationFrames (mặc định gait.turnFrames) nếu đổi hướng, không thì giữ nguyên.
 */
export function walkSegments(film: Film, ci: number, legLength: number): WalkSegment[] {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const gait = rig.data.gait;
  const walks = film.data.walks.filter((w) => w.character === c.id);
  const turns = (film.data.turns ?? []).filter((t) => t.character === c.id);
  if ((walks.length > 0 || turns.some((t) => t.durationFrames === undefined)) && !gait) {
    fail('ACTION_PRECONDITION', `film.walks/turns(${c.id})`, `rig ${rig.data.id} has no gait`);
  }
  const events = [
    ...walks.map((w) => ({ start: w.start, walk: w, turn: undefined })),
    ...turns.map((t) => ({ start: t.start, walk: undefined, turn: t })),
  ].sort((a, b) => a.start - b.start);
  let x = c.x;
  let sign: 1 | -1 = c.facing === 'right' ? 1 : -1;
  return events.map(({ walk: w, turn: t }) => {
    if (t) {
      const dir = faceSign(film, ci, t.face, x, t.start, sign);
      const dur = t.durationFrames ?? gait!.turnFrames;
      const seg: WalkSegment = { start: t.start, end: t.start + dur, fromX: x, toX: x, fromSign: sign, dir, turnFrames: dir !== sign ? dur : 0, steps: 0 };
      sign = dir;
      return seg;
    }
    const D = Math.abs(w!.toX - x);
    if (D === 0) fail('FILM_SCHEMA', `film.walks(${c.id}@${w!.start})`, 'toX equals the current position');
    const dir: 1 | -1 = w!.toX > x ? 1 : -1;
    const turnFrames = dir !== sign ? gait!.turnFrames : 0;
    const steps = Math.max(2, 2 * Math.ceil(D / (gait!.strideRatio * legLength * c.scale)));
    if (w!.durationFrames - turnFrames < steps * 2) {
      fail('WALK_TOO_SHORT', `film.walks(${c.id}@${w!.start})`, `${w!.durationFrames} frames for ${turnFrames} turn + ${steps} steps (structural floor ${turnFrames + steps * 2}: ≥ 2 frames/step)`);
    }
    const seg: WalkSegment = { start: w!.start, end: w!.start + w!.durationFrames, fromX: x, toX: w!.toX, fromSign: sign, dir, turnFrames, steps };
    x = w!.toX;
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
    if (k < s.turnFrames) return { rootX: s.fromX, fx: flipFx(s.fromSign, k, s.turnFrames), stepPhase: 0 };
    if (s.steps === 0) return { rootX: s.fromX, fx: s.dir, stepPhase: 0 }; // quay tại chỗ đã xong / không cần lật
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

/**
 * Hệ số hướng nhìn ở frame thứ k (0-based) của một lần lật dài T frame — dùng chung cho `turns` và `walks` đổi chiều.
 * fx = from·cos(π·inOutSine(u)), u = w((k+1)/T): co như tờ giấy, êm ở hai đầu; frame cuối (k = T−1) u = 1 → ±1.
 *
 * Điểm đổi mặt u = ½ (fx = 0) là lúc tờ giấy nghiêng hẳn: hình bề ngang 0 — vẽ ra là MẤT nhân vật, nên không bao giờ
 * được lấy mẫu. T lẻ: (k+1)/T không bao giờ bằng ½ — điểm đó nằm đúng giữa hai frame; w(x) = x. T chẵn: mẫu
 * k+1 = T/2 rơi đúng vào ½, nên thời gian được dời mượt nửa frame ở giữa:
 *   w(x) = x + (½/T)·sin²(πx)   (w(0) = 0, w(1) = 1, đơn điệu vì π/(2T) < 1; dời 0 ở hai đầu, ½ frame ở giữa).
 * Đổi mặt khi đó nằm giữa hai frame (cách ½/T và ≈ ½/T), mẫu gần nhất cách điểm nghiêng hẳn ≥ nửa frame như T lẻ,
 * và bước thời gian đổi mượt (không có bước dài đột ngột làm đồ cầm tay giật). Không hằng số: chỉ suy từ T.
 */
export function flipFx(from: number, k: number, T: number): number {
  const x = (k + 1) / T;
  const u = T % 2 === 0 ? x + (0.5 / T) * Math.sin(Math.PI * x) ** 2 : x;
  return from * Math.cos(Math.PI * ease('inOutSine', u));
}
