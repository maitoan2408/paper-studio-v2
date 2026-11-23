/**
 * Thả tự do (M3 đợt 1) — một TRẠNG THÁI của đạo cụ trong vòng đời props.ts: nằm yên → cầm → THẢ → rơi (Rapier) → nằm yên.
 *
 * Quy ước frame: R = frame của sự kiện release (start + round(t·(dur−1)), như mọi sự kiện). Ở R−1 đạo cụ còn trong tay.
 * Trạng thái ban đầu (thế giới, y-lên, px): pivot(R−1); vận tốc = (pivot(R−1) − pivot(R−2))·fps (tay mang vật tới R−1);
 * góc = góc thế giới hiện tại của đạo cụ (đồ cầm tay không xoay theo tay); vận tốc góc 0. Frame R = sau đúng 1 frame mô phỏng.
 * Mô phỏng: Rapier 2D tất định, đơn vị mét (px / pxPerMeter của dữ liệu), mỗi frame SUBSTEPS bước dt = 1/(fps·SUBSTEPS),
 * SOLVER_ITERATIONS vòng giải, CCD bật. Chỉ dùng tọa độ thế giới — camera không tham gia. Bake một lần từ dữ liệu phim,
 * lấy mẫu frame k = tra bảng ⇒ tua thẳng = xem tuần tự.
 *
 * Bước con → frame phim: tư thế ở frame f là trạng thái SAU bước con thứ S của frame f; bước con k (1..S) của frame f kết
 * thúc tại thời điểm t = (f − 1) + k/S (đơn vị frame). Sự kiện xảy ra trong bước con k của frame f được gán cho frame f
 * (frame đầu tiên có tư thế vẽ ra ở sau sự kiện), thời điểm chính xác tới 1/S frame ghi ở `firstContact.time`.
 *
 * Tiếp xúc = Rapier thật sự đẩy cặp collider (vật, mặt đỡ `onto`) trong một bước con: một điểm tiếp xúc của cặp đó có xung
 * lực pháp tuyến > 0. Không dùng khoảng cách (Rapier tạo điểm tiếp xúc "dự đoán" từ ~8 px, và contactDist của manifold đo
 * TRƯỚC bước giải) và không dùng tư thế cuối frame (vật nảy có thể chạm rồi rời sàn trong cùng một frame). Ba khái niệm:
 *  - ĐÃ TỪNG CHẠM: từ bước con đầu tiên có tiếp xúc (landFrame / firstContact) — không đổi khi vật nảy lại lên không.
 *  - ĐANG ĐƯỢC ĐỠ (`supported`): ở bước con CUỐI của frame, pháp tuyến hướng lên (ny ≥ SUPPORT_MIN_NY) và có MỘT ĐIỂM vừa
 *    chịu xung lực > 0 mà sau bước KHÔNG tách khỏi mặt: vₙ tại chính điểm đó (có tính quay) ≤ g·h (dung sai, xem sepMax).
 *    Xung lực chỉ nói "đã va"; góc bị đập rồi bật đi (vₙ ≫ g·h) là va chạm, không phải đỡ — dù góc kia đang gần mặt với
 *    xung lực 0 (điểm dự đoán). Chạm cạnh bên khối = chạm, không đỡ.
 *  - NẰM YÊN: đang được đỡ, tốc độ ≤ REST_SPEED, quay ≤ REST_SPIN liên tục REST_FRAMES frame → khóa tư thế từ đó.
 *    Thân động KHÔNG được tự ngủ trong Rapier (ngủ = engine ép vận tốc về 0 ⇒ vật đang trượt bị "đóng băng" giả).
 * Hụt (PHYSICS_NO_LANDING): chỉ khi CHẮC CHẮN không thể lên mặt đỡ — frame không có tiếp xúc và ngay cả theo quỹ đạo đạn đạo
 * (chỉ trọng lực) điểm cao nhất vật còn với tới được: tâm + max(vy,0)²/2g + bán kính ngoại tiếp, vẫn thấp hơn mặt đỡ quá
 * LAND_GAP_PX. Vị trí tâm khi còn trên không KHÔNG đủ để kết luận (vật bay từ ngoài mép vào vẫn đáp được).
 * Chưa nằm yên trước hết phim → PHYSICS_NOT_AT_REST.
 * Va chạm đợt 1: chỉ mặt đỡ `onto` (khối tĩnh trên [x0, x1], dày SLAB_PX); bàn, đạo cụ khác, nhân vật: đợt sau.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { DropSpec, Film } from '../schema/film.ts';
import { contactWorld } from '../motion/character.ts';
import { propPivot, propTimeline } from '../motion/props.ts';
import { RAPIER, RAPIER_VERSION } from './rapier.ts';

export const SUBSTEPS = 8;
export const SOLVER_ITERATIONS = 4;
/** Nằm yên: ≤ 2 px/s (= 0.083 px/frame) và ≤ 2 °/s, liên tục 12 frame (0.5 s). */
export const REST_SPEED_PX = 2;
export const REST_SPIN_DEG = 2;
export const REST_FRAMES = 12;
/** Dung sai độ cao khi kết luận "hụt": điểm cao nhất với tới được phải thấp hơn mặt đỡ quá 1 px (Rapier cho lún ~0.4 px). */
export const LAND_GAP_PX = 1;
/** "Được đỡ": pháp tuyến tiếp xúc (từ mặt đỡ sang vật) nghiêng ≤ 60° so với phương thẳng đứng. */
export const SUPPORT_MIN_NY = 0.5;
/** Độ dày khối tĩnh làm mặt đỡ (px), mặt trên tại y của mặt đỡ. */
export const SLAB_PX = 50;

export interface DropPose {
  frame: number;
  /** Pivot thế giới (px, y-lên) — cùng điểm mà props.ts dùng cho đạo cụ. */
  x: number;
  y: number;
  /** Góc thế giới (độ, ngược chiều kim đồng hồ). */
  angle: number;
  /** Vận tốc pivot (px/s) và vận tốc góc (độ/s) — để test và bảng bàn giao. */
  vx: number;
  vy: number;
  spin: number;
  /** Trong frame này (bước con bất kỳ) mặt đỡ có đẩy vật — sự kiện tiếp xúc. */
  touching: boolean;
  /** Ở bước con cuối của frame mặt đỡ đỡ vật từ bên dưới (xem đầu file). */
  supported: boolean;
  /** Vận tốc tách theo pháp tuyến (px/s, dương = rời mặt) ở bước con cuối, nhỏ nhất trên các điểm CHỊU XUNG LỰC > 0;
   *  null nếu bước con cuối không có điểm nào chịu xung lực. */
  separation: number | null;
  /** Mọi điểm manifold của cặp (vật, mặt đỡ) ở bước con cuối, kể cả điểm dự đoán xung lực 0 — bằng chứng cho test/bàn giao. */
  points: ContactPoint[];
  /** falling: chưa từng chạm · supported: đã chạm và đang được đỡ · airborne: đã chạm, đang không được đỡ (nảy/lật/trượt mép)
   *  · rest: đã khóa nằm yên. */
  state: 'falling' | 'supported' | 'airborne' | 'rest';
}

export interface ContactPoint {
  /** Vị trí thế giới (px, y-lên) sau bước của điểm vật chất trên vật. */
  x: number;
  y: number;
  /** Xung lực pháp tuyến của bước (đơn vị Rapier: kg·m/s); 0 = điểm dự đoán, không chịu lực. */
  impulse: number;
  /** vₙ sau bước (px/s), dương = tách khỏi mặt. */
  separation: number;
}

export interface FirstContact {
  frame: number;
  /** Bước con 1..SUBSTEPS trong frame `frame`. */
  substep: number;
  /** Thời điểm kết thúc bước con đó, đơn vị frame: frame − 1 + substep/SUBSTEPS. */
  time: number;
}

/** Kết quả mô phỏng chưa xét lỗi (để test/bàn giao xem diễn biến kể cả khi bake bị từ chối). */
export interface DropTrace {
  releaseFrame: number;
  init: { pivot: V2; velocity: V2; angle: number };
  poses: DropPose[];
  firstContact: FirstContact | null;
  /** Frame cuối cùng vật còn được đỡ (−1 nếu chưa bao giờ). */
  lastSupported: number;
  restFrame: number;
  /** Frame kết luận hụt chắc chắn (−1 nếu không). Mô phỏng dừng ở frame này. */
  missFrame: number;
}

export interface DropBake {
  id: string;
  prop: string;
  engine: string;
  releaseFrame: number;
  /** Frame của lần tiếp xúc đầu tiên với mặt đỡ (= firstContact.frame). */
  landFrame: number;
  firstContact: FirstContact;
  restFrame: number;
  init: { pivot: V2; velocity: V2; angle: number };
  poses: DropPose[];
}

const cache = new WeakMap<Film, Map<string, DropBake>>();

function spec(film: Film, id: string): DropSpec {
  const d = film.data.physics.find((x) => x.id === id);
  if (!d) return fail('FILM_UNKNOWN_REF', `drop ${id}`, 'no such drop');
  return d;
}

export function dropBake(film: Film, id: string): DropBake {
  let m = cache.get(film);
  if (!m) cache.set(film, (m = new Map()));
  const hit = m.get(id);
  if (hit) return hit;
  const b = bake(film, spec(film, id));
  m.set(id, b);
  return b;
}

/** Tư thế đạo cụ ở frame ≥ frame thả (hàm thuần: tra bảng bake). */
export function dropPose(film: Film, id: string, frame: number): DropPose {
  const b = dropBake(film, id);
  const p = b.poses[frame - b.releaseFrame];
  if (!p) return fail('PHYSICS_FRAME', `drop ${id}`, `frame ${frame} outside [${b.releaseFrame}, ${b.releaseFrame + b.poses.length - 1}]`);
  return p;
}

export function simulateDrop(film: Film, d: DropSpec): DropTrace {
  const where = `film.physics(${d.id})`;
  const { fps, durationFrames: N } = film.data.output;
  const seg = propTimeline(film).get(d.prop)!.find((s) => s.drop === d.id);
  if (!seg) return fail('PHYSICS_NO_RELEASE', where, `"${d.prop}" is never let go by timeline[${d.release}]`);
  const R = seg.from;
  const held = (fr: number): V2 => propPivot(film, d.prop, fr, (ci, c) => contactWorld(film, ci, fr, c));
  const list = propTimeline(film).get(d.prop)!;
  const heldAt = (fr: number) => fr >= 0 && list.filter((s) => s.from <= fr).at(-1)!.holders.length > 0;
  if (!heldAt(R - 1) || !heldAt(R - 2)) fail('PHYSICS_RELEASE_TOO_EARLY', where, `release at frame ${R} needs the prop held at frames ${R - 2} and ${R - 1} (hand velocity)`);
  const p1 = held(R - 1);
  const p2 = held(R - 2);
  const v0: V2 = [(p1[0] - p2[0]) * fps, (p1[1] - p2[1]) * fps];
  const prop = film.data.props.find((x) => x.id === d.prop)!;
  const asset = film.assets.get(prop.asset)!;
  const angle0 = prop.rotation;
  const ppm = d.world.pxPerMeter;
  const g = d.world.gravity * ppm; // px/s²
  const surface = film.data.stage.surfaces.find((s) => s.id === d.onto)!;
  // Khối = khung art × scale; tâm khối tính từ pivot trong khung local (y-lên).
  const hw = (asset.width * prop.scale) / 2, hh = (asset.height * prop.scale) / 2;
  const radius = Math.hypot(hw, hh);
  const cLocal = artToLocal([asset.width / 2, asset.height / 2], asset.pivot);
  const c0: V2 = [cLocal[0] * prop.scale, cLocal[1] * prop.scale];
  const centerOf = (pivot: V2, angle: number): V2 => { const r = rotate(c0, angle); return [pivot[0] + r[0], pivot[1] + r[1]]; };
  const pivotOf = (center: V2, angle: number): V2 => { const r = rotate(c0, angle); return [center[0] - r[0], center[1] - r[1]]; };

  const world = new RAPIER.World({ x: 0, y: -d.world.gravity });
  world.timestep = 1 / (fps * SUBSTEPS);
  world.numSolverIterations = SOLVER_ITERATIONS;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((surface.x0 + surface.x1) / 2 / ppm, (surface.y - SLAB_PX) / ppm));
  const support = world.createCollider(RAPIER.ColliderDesc.cuboid((surface.x1 - surface.x0) / 2 / ppm, SLAB_PX / ppm).setFriction(d.body.friction).setRestitution(d.body.restitution), floor);
  const c = centerOf(p1, angle0);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(c[0] / ppm, c[1] / ppm)
      .setRotation((angle0 * Math.PI) / 180)
      .setLinvel(v0[0] / ppm, v0[1] / ppm)
      .setAngvel(0)
      .setCcdEnabled(true)
      // Không cho Rapier tự ngủ: khi ngủ, Rapier ĐẶT VẬN TỐC VỀ 0 cho vật chậm (kể cả vật đang trượt đều trên mặt không
      // ma sát) — nằm yên chỉ do tiêu chí của file này quyết định (REST_*), không do ngưỡng ngủ nội bộ của engine.
      .setCanSleep(false),
  );
  const shape = world.createCollider(RAPIER.ColliderDesc.cuboid(hw / ppm, hh / ppm).setDensity(d.body.density).setFriction(d.body.friction).setRestitution(d.body.restitution), body);
  /**
   * Dung sai vₙ của "đỡ" = g·h (h = bước con). Không phải ngưỡng vật lý của cú nảy mà là độ phân giải của mô phỏng: một
   * điểm rời mặt với vₙ ≤ g·h chỉ dưới trọng lực sẽ cao lên tối đa vₙ²/2g ≤ g·h²/2 (≈ 0,05 px ở 9,81 m/s², 400 px/m,
   * 192 bước/s) và trở lại mặt sau ≤ 2 bước con — nhỏ hơn độ lún cho phép của Rapier (~0,4 px), tức không phân biệt được
   * với tiếp xúc liên tục (vận tốc đẩy ra khi bộ giải sửa lún cũng nằm trong mức này). Cú bật thật có vₙ ≫ g·h
   * (đo được 91,7–644,8 px/s). Ước lượng bỏ qua gia tốc do quay của chính điểm đó.
   */
  const sepMax = g / (fps * SUBSTEPS);
  /**
   * Tiếp xúc của đúng cặp (vật, mặt đỡ) ở bước vừa chạy, từng ĐIỂM MANIFOLD i (Rapier 0.21):
   *  - contactImpulse(i): xung lực pháp tuyến bộ giải đặt lên đúng điểm i trong bước này;
   *  - localContactPoint1/2(i): điểm i trên collider 1/2, trong khung local của collider (= khung thân, collider không lệch).
   *    Lấy phía THÂN ĐỘNG, biến đổi bằng tư thế SAU bước ⇒ vị trí hiện tại của chính điểm vật chất đã chịu lực;
   *  - normal(): pháp tuyến thế giới của manifold, từ collider 1 sang 2 (flipped ⇒ collider 1 là mặt đỡ).
   * Không dùng solverContactPoint: Rapier chỉ tạo điểm solver cho điểm trong khoảng dự đoán, đặt ở giữa hai bề mặt và
   * không cho biết nó ứng với điểm manifold nào — ghép theo chỉ số là sai khi có điểm bị bỏ.
   * Mỗi điểm: vₙ = (v_tâm + ω × (p − tâm)) · n sau bước giải (tính quay; góc làm trục lật có vₙ ≈ 0).
   * Mặt đỡ ĐỠ vật ⇔ pháp tuyến hướng lên và CÓ một điểm vừa chịu xung lực > 0 mà không tách (vₙ ≤ sepMax).
   */
  const contact = (): { pushed: boolean; supports: boolean; sep: number | null; points: ContactPoint[] } => {
    let pushed = false, supports = false, sep: number | null = null;
    const points: ContactPoint[] = [];
    world.contactPair(shape, support, (m, flipped) => {
      const n = m.normal(), s = flipped ? 1 : -1, nx = s * n.x, ny = s * n.y;
      const c = body.translation(), v = body.linvel(), w = body.angvel(), r = body.rotation();
      const cr = Math.cos(r), sr = Math.sin(r);
      for (let i = 0; i < m.numContacts(); i++) {
        const lb = (flipped ? m.localContactPoint2(i) : m.localContactPoint1(i))!;
        const px = c.x + cr * lb.x - sr * lb.y, py = c.y + sr * lb.x + cr * lb.y;
        const vn = ((v.x - w * (py - c.y)) * nx + (v.y + w * (px - c.x)) * ny) * ppm;
        const impulse = m.contactImpulse(i);
        points.push({ x: px * ppm, y: py * ppm, impulse, separation: vn });
        if (!(impulse > 0)) continue;
        pushed = true;
        sep = sep === null ? vn : Math.min(sep, vn);
        if (ny >= SUPPORT_MIN_NY && vn <= sepMax) supports = true;
      }
    });
    return { pushed, supports, sep, points };
  };

  const poses: DropPose[] = [];
  let firstContact: FirstContact | null = null;
  let restFrame = -1, missFrame = -1, lastSupported = -1, calm = 0;
  try {
    for (let fr = R; fr < N; fr++) {
      if (restFrame >= 0) {
        poses.push({ ...poses[poses.length - 1]!, frame: fr, vx: 0, vy: 0, spin: 0 });
        continue;
      }
      let touching = false, supported = false, separation: number | null = null, points: ContactPoint[] = [];
      for (let k = 1; k <= SUBSTEPS; k++) {
        world.step();
        const ct = contact();
        if (ct.pushed) {
          touching = true;
          if (!firstContact) firstContact = { frame: fr, substep: k, time: fr - 1 + k / SUBSTEPS };
        }
        if (k === SUBSTEPS) {
          supported = ct.supports;
          separation = ct.sep;
          points = ct.points;
        }
      }
      const t = body.translation(), lv = body.linvel();
      const angle = (body.rotation() * 180) / Math.PI;
      const center: V2 = [t.x * ppm, t.y * ppm];
      const pv = pivotOf(center, angle);
      const w = body.angvel();
      // vận tốc của pivot = v_tâm + ω × (pivot − tâm)
      const rx = pv[0] - center[0], ry = pv[1] - center[1];
      const vx = lv.x * ppm - w * ry, vy = lv.y * ppm + w * rx;
      const spin = (w * 180) / Math.PI;
      if (supported) lastSupported = fr;
      const calmNow = supported && Math.hypot(lv.x * ppm, lv.y * ppm) <= REST_SPEED_PX && Math.abs(spin) <= REST_SPIN_DEG;
      calm = calmNow ? calm + 1 : 0;
      const state: DropPose['state'] = calm >= REST_FRAMES ? 'rest' : !firstContact ? 'falling' : supported ? 'supported' : 'airborne';
      poses.push({ frame: fr, x: pv[0], y: pv[1], angle, vx, vy, spin, touching, supported, separation, points, state });
      if (state === 'rest') restFrame = fr;
      // Hụt chắc chắn: không chạm trong frame, và theo đạn đạo điểm cao nhất với tới được vẫn dưới mặt đỡ.
      const reach = center[1] + Math.max(lv.y * ppm, 0) ** 2 / (2 * g) + radius;
      if (!touching && reach < surface.y - LAND_GAP_PX) {
        missFrame = fr;
        break;
      }
    }
  } finally {
    world.free();
  }
  return { releaseFrame: R, init: { pivot: p1, velocity: v0, angle: angle0 }, poses, firstContact, lastSupported, restFrame, missFrame };
}

function bake(film: Film, d: DropSpec): DropBake {
  const where = `film.physics(${d.id})`;
  const N = film.data.output.durationFrames;
  const tr = simulateDrop(film, d);
  const fc = tr.firstContact;
  const history = fc ? `first touched "${d.onto}" at frame ${fc.frame} (substep ${fc.substep}/${SUBSTEPS}), last supported at frame ${tr.lastSupported}` : `never touched "${d.onto}"`;
  if (tr.missFrame >= 0) {
    const s = film.data.stage.surfaces.find((x) => x.id === d.onto)!;
    const p = tr.poses[tr.poses.length - 1]!;
    fail('PHYSICS_NO_LANDING', `${where} frame ${tr.missFrame}`, `"${d.prop}" ${history}; it is now below "${d.onto}" (y=${s.y}, x∈[${s.x0}, ${s.x1}]) and cannot reach it any more (pivot ${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  }
  if (tr.restFrame < 0 || !fc) {
    const last = tr.poses[tr.poses.length - 1];
    fail('PHYSICS_NOT_AT_REST', where, `"${d.prop}" ${history} but is not at rest at the last frame ${N - 1}${last ? ` (speed ${Math.hypot(last.vx, last.vy).toFixed(1)} px/s, ${last.state})` : ''}; lengthen the film or release earlier`);
  }
  return { id: d.id, prop: d.prop, engine: `rapier2d-deterministic-compat@${RAPIER_VERSION}`, releaseFrame: tr.releaseFrame, landFrame: fc.frame, firstContact: fc, restFrame: tr.restFrame, init: tr.init, poses: tr.poses };
}
