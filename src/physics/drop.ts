/**
 * Thả tự do (M3 đợt 1) — một TRẠNG THÁI của đạo cụ trong vòng đời props.ts: nằm yên → cầm → THẢ → rơi (Rapier) → nằm yên.
 *
 * Quy ước frame: R = frame của sự kiện release (start + round(t·(dur−1)), như mọi sự kiện). Ở R−1 đạo cụ còn trong tay.
 * Trạng thái ban đầu (thế giới, y-lên, px): pivot(R−1); vận tốc = (pivot(R−1) − pivot(R−2))·fps (tay mang vật tới R−1);
 * góc = góc thế giới hiện tại của đạo cụ (đồ cầm tay không xoay theo tay); vận tốc góc 0. Frame R = sau đúng 1 frame mô phỏng.
 * Mô phỏng: Rapier 2D tất định, đơn vị mét (px / pxPerMeter của dữ liệu), mỗi frame SUBSTEPS bước dt = 1/(fps·SUBSTEPS),
 * SOLVER_ITERATIONS vòng giải, CCD bật. Chỉ dùng tọa độ thế giới — camera không tham gia. Bake một lần từ dữ liệu phim,
 * lấy mẫu frame k = tra bảng ⇒ tua thẳng = xem tuần tự. Nằm yên: tốc độ ≤ REST_SPEED và quay ≤ REST_SPIN liên tục
 * REST_FRAMES frame (sau khi chạm) → khóa tư thế từ đó. Chưa nằm yên trước hết phim / rơi khỏi mặt đỡ → lỗi có mã.
 * Va chạm đợt 1: chỉ mặt đỡ `onto` (khối tĩnh trên [x0, x1]); bàn, đạo cụ khác, nhân vật: đợt sau.
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
/** "Chạm" = góc thấp nhất của khối cách mặt đỡ ≤ 1 px (khe tiếp xúc của Rapier nhỏ hơn nhiều, xem test). */
export const LAND_GAP_PX = 1;

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
  state: 'falling' | 'landed' | 'rest';
}

export interface DropBake {
  id: string;
  prop: string;
  engine: string;
  releaseFrame: number;
  landFrame: number;
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

function bake(film: Film, d: DropSpec): DropBake {
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
  const surface = film.data.stage.surfaces.find((s) => s.id === d.onto)!;
  // Khối = khung art × scale; tâm khối tính từ pivot trong khung local (y-lên).
  const hw = (asset.width * prop.scale) / 2, hh = (asset.height * prop.scale) / 2;
  const cLocal = artToLocal([asset.width / 2, asset.height / 2], asset.pivot);
  const c0: V2 = [cLocal[0] * prop.scale, cLocal[1] * prop.scale];
  const centerOf = (pivot: V2, angle: number): V2 => { const r = rotate(c0, angle); return [pivot[0] + r[0], pivot[1] + r[1]]; };
  const pivotOf = (center: V2, angle: number): V2 => { const r = rotate(c0, angle); return [center[0] - r[0], center[1] - r[1]]; };

  const world = new RAPIER.World({ x: 0, y: -d.world.gravity });
  world.timestep = 1 / (fps * SUBSTEPS);
  world.numSolverIterations = SOLVER_ITERATIONS;
  const SLAB_PX = 50;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((surface.x0 + surface.x1) / 2 / ppm, (surface.y - SLAB_PX) / ppm));
  world.createCollider(RAPIER.ColliderDesc.cuboid((surface.x1 - surface.x0) / 2 / ppm, SLAB_PX / ppm).setFriction(d.body.friction).setRestitution(d.body.restitution), floor);
  const c = centerOf(p1, angle0);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(c[0] / ppm, c[1] / ppm)
      .setRotation((angle0 * Math.PI) / 180)
      .setLinvel(v0[0] / ppm, v0[1] / ppm)
      .setAngvel(0)
      .setCcdEnabled(true),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(hw / ppm, hh / ppm).setDensity(d.body.density).setFriction(d.body.friction).setRestitution(d.body.restitution), body);

  const poses: DropPose[] = [];
  let landFrame = -1, restFrame = -1, calm = 0;
  try {
    for (let fr = R; fr < N; fr++) {
      if (restFrame >= 0) {
        poses.push({ ...poses[poses.length - 1]!, frame: fr, vx: 0, vy: 0, spin: 0 });
        continue;
      }
      for (let k = 0; k < SUBSTEPS; k++) world.step();
      const t = body.translation(), lv = body.linvel();
      const angle = (body.rotation() * 180) / Math.PI;
      const center: V2 = [t.x * ppm, t.y * ppm];
      const pv = pivotOf(center, angle);
      const w = body.angvel();
      // vận tốc của pivot = v_tâm + ω × (pivot − tâm)
      const rx = pv[0] - center[0], ry = pv[1] - center[1];
      const vx = lv.x * ppm - w * ry, vy = lv.y * ppm + w * rx;
      const spin = (w * 180) / Math.PI;
      const low = Math.min(...[[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => center[1] + rotate([x!, y!], angle)[1]));
      if (landFrame < 0 && low <= surface.y + LAND_GAP_PX) landFrame = fr;
      if (center[0] < surface.x0 || center[0] > surface.x1 || low < surface.y - SLAB_PX) {
        fail('PHYSICS_NO_LANDING', `${where} frame ${fr}`, `"${d.prop}" leaves "${surface.id}" (x=${center[0].toFixed(1)} ∉ [${surface.x0}, ${surface.x1}])`);
      }
      const calmNow = landFrame >= 0 && Math.hypot(lv.x * ppm, lv.y * ppm) <= REST_SPEED_PX && Math.abs(spin) <= REST_SPIN_DEG;
      calm = calmNow ? calm + 1 : 0;
      const state: DropPose['state'] = calm >= REST_FRAMES ? 'rest' : landFrame >= 0 ? 'landed' : 'falling';
      poses.push({ frame: fr, x: pv[0], y: pv[1], angle, vx, vy, spin, state });
      if (state === 'rest') restFrame = fr;
    }
  } finally {
    world.free();
  }
  if (restFrame < 0) {
    const last = poses[poses.length - 1];
    fail('PHYSICS_NOT_AT_REST', where, `"${d.prop}" ${landFrame < 0 ? 'never lands' : `lands at frame ${landFrame} but is still moving`} at the last frame ${N - 1}${last ? ` (speed ${Math.hypot(last.vx, last.vy).toFixed(1)} px/s)` : ''}; lengthen the film or release earlier`);
  }
  return { id: d.id, prop: d.prop, engine: `rapier2d-deterministic-compat@${RAPIER_VERSION}`, releaseFrame: R, landFrame, restFrame, init: { pivot: p1, velocity: v0, angle: angle0 }, poses };
}
