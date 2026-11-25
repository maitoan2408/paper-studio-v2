/**
 * Bản ghi bake vật lý (M3 việc 4) — ghi cạnh render, audit đọc lại, kiểm SHA và mô phỏng lại để so.
 *
 * Dữ liệu được băm (canonicalSha256 của toàn bộ object, src/core/hash.ts):
 *  - format/formatVersion: định dạng bản ghi này;
 *  - engine: gói Rapier + phiên bản đã ghim (src/physics/rapier.ts);
 *  - config: lịch bước (fps, SUBSTEPS, SOLVER_ITERATIONS), trọng lực + px/m của thế giới chung, mọi ngưỡng quyết định
 *    trạng thái (REST_*, LAND_GAP_PX, SUPPORT_MIN_NY, SLAB_PX);
 *  - inputs: SHA film chuẩn hóa (mọi dữ liệu quyết định mô phỏng: đạo cụ, mặt đỡ, timeline/walks/turns → tay lúc buông,
 *    physics), danh sách pack + SHA manifest (art: khung, pivot, anchor → hình va chạm) và SHA riêng khối physics;
 *  - drops (sắp theo id): trạng thái lúc buông, quỹ đạo dùng khi phát phim (pivot, góc, vận tốc, trạng thái, điểm tựa theo
 *    frame) và sự kiện (lần chạm đầu theo cặp, đánh thức, frame nghỉ). Quan hệ giữa các đạo cụ của thế giới chung nằm
 *    trong contacts/wakes/supportedBy (khóa `prop:<id>` / `surface:<id>`).
 * Không băm: điểm manifold, xung lực, cận hụt (chẩn đoán) — mô phỏng lại sẽ tính lại chúng; chúng không vào SceneFrame.
 * Số −0 được đưa về 0 (JSON chuẩn hóa từ chối −0; mọi phép so dùng cùng biểu diễn).
 */
import type { Film } from '../schema/film.ts';
import { canonicalSha256 } from '../core/hash.ts';
import { dropBake, LAND_GAP_PX, REST_FRAMES, REST_SPEED_PX, REST_SPIN_DEG, SLAB_PX, SOLVER_ITERATIONS, SUBSTEPS, SUPPORT_MIN_NY } from './drop.ts';
import { RAPIER_VERSION } from './rapier.ts';

export const BAKE_FORMAT = 'paper-studio-physics-bake';
export const BAKE_FORMAT_VERSION = 1;
export const BAKE_FILE = 'physics-bake.json';
export const RAPIER_PACKAGE = '@dimforge/rapier2d-deterministic-compat';

const z0 = (v: number) => (Object.is(v, -0) ? 0 : v);

export interface PhysicsBakeRecord {
  format: typeof BAKE_FORMAT;
  formatVersion: typeof BAKE_FORMAT_VERSION;
  engine: { package: string; version: string };
  config: {
    fps: number;
    substeps: number;
    solverIterations: number;
    gravity: number;
    pxPerMeter: number;
    restSpeedPx: number;
    restSpinDeg: number;
    restFrames: number;
    landGapPx: number;
    supportMinNy: number;
    slabPx: number;
  };
  inputs: { filmSha256: string; packs: { id: string; version: string; manifestSha256: string }[]; physicsSha256: string };
  drops: {
    id: string;
    prop: string;
    onto: string;
    releaseFrame: number;
    init: { pivot: [number, number]; velocity: [number, number]; angle: number };
    firstContact: { frame: number; substep: number };
    contacts: { other: string; frame: number; substep: number }[];
    wakes: { frame: number; by: string }[];
    restFrame: number;
    poses: { frame: number; x: number; y: number; angle: number; vx: number; vy: number; spin: number; state: string; supportedBy: string[] }[];
  }[];
}

/** Các phần cấu hình/engine hiện hành (audit so bake trên đĩa với chúng). */
export function currentConfig(film: Film): PhysicsBakeRecord['config'] {
  const w = film.data.physics[0]!.world;
  return {
    fps: film.data.output.fps, substeps: SUBSTEPS, solverIterations: SOLVER_ITERATIONS, gravity: w.gravity, pxPerMeter: w.pxPerMeter,
    restSpeedPx: REST_SPEED_PX, restSpinDeg: REST_SPIN_DEG, restFrames: REST_FRAMES, landGapPx: LAND_GAP_PX, supportMinNy: SUPPORT_MIN_NY, slabPx: SLAB_PX,
  };
}

export function filmInputs(film: Film): PhysicsBakeRecord['inputs'] {
  return {
    filmSha256: canonicalSha256(film.data),
    packs: film.data.packs.map((p) => ({ id: p.id, version: p.version, manifestSha256: p.manifestSha256 })),
    physicsSha256: canonicalSha256(film.data.physics),
  };
}

/** Bản ghi bake của film (null nếu film không có physics). Mô phỏng (hoặc đọc bake đã ghi nhớ) qua dropBake. */
export function physicsBakeRecord(film: Film): PhysicsBakeRecord | null {
  if (film.data.physics.length === 0) return null;
  const ids = film.data.physics.map((d) => d.id).sort();
  return {
    format: BAKE_FORMAT,
    formatVersion: BAKE_FORMAT_VERSION,
    engine: { package: RAPIER_PACKAGE, version: RAPIER_VERSION },
    config: currentConfig(film),
    inputs: filmInputs(film),
    drops: ids.map((id) => {
      const b = dropBake(film, id);
      const d = film.data.physics.find((x) => x.id === id)!;
      return {
        id, prop: b.prop, onto: d.onto, releaseFrame: b.releaseFrame,
        init: { pivot: [z0(b.init.pivot[0]), z0(b.init.pivot[1])], velocity: [z0(b.init.velocity[0]), z0(b.init.velocity[1])], angle: z0(b.init.angle) },
        firstContact: { frame: b.firstContact.frame, substep: b.firstContact.substep },
        contacts: b.contacts.map((c) => ({ other: c.other, frame: c.frame, substep: c.substep })),
        wakes: b.wakes.map((w) => ({ frame: w.frame, by: w.by })),
        restFrame: b.restFrame,
        poses: b.poses.map((q) => ({ frame: q.frame, x: z0(q.x), y: z0(q.y), angle: z0(q.angle), vx: z0(q.vx), vy: z0(q.vy), spin: z0(q.spin), state: q.state, supportedBy: [...q.supportedBy] })),
      };
    }),
  };
}

export function bakeSha256(record: unknown): string {
  return canonicalSha256(record);
}

/**
 * Chỗ khác ĐẦU TIÊN giữa hai bản ghi (null nếu trùng) — đường dẫn đọc được: mảng drops theo id, poses theo frame.
 * Duyệt theo thứ tự khóa chuẩn hóa ⇒ tất định.
 */
export function firstDifference(expected: unknown, got: unknown, path = '$'): { path: string; expected: unknown; got: unknown } | null {
  if (typeof expected !== 'object' || expected === null || typeof got !== 'object' || got === null) {
    return Object.is(expected, got) || (expected === got) ? null : { path, expected, got };
  }
  if (Array.isArray(expected) !== Array.isArray(got)) return { path, expected: Array.isArray(expected) ? 'array' : 'object', got: Array.isArray(got) ? 'array' : 'object' };
  if (Array.isArray(expected)) {
    const g = got as unknown[];
    const label = (v: unknown, i: number) => {
      const o = v as { id?: unknown; frame?: unknown } | null;
      if (o && typeof o === 'object' && typeof o.id === 'string') return `[${o.id}]`;
      if (o && typeof o === 'object' && typeof o.frame === 'number' && path.endsWith('.poses')) return `[frame ${o.frame}]`;
      return `[${i}]`;
    };
    for (let i = 0; i < Math.max(expected.length, g.length); i++) {
      if (i >= expected.length || i >= g.length) return { path: `${path}.length`, expected: expected.length, got: g.length };
      const d = firstDifference(expected[i], g[i], `${path}${label(expected[i], i)}`);
      if (d) return d;
    }
    return null;
  }
  const e = expected as Record<string, unknown>, o = got as Record<string, unknown>;
  for (const k of [...new Set([...Object.keys(e), ...Object.keys(o)])].sort()) {
    if (!(k in o)) return { path: `${path}.${k}`, expected: e[k], got: undefined };
    if (!(k in e)) return { path: `${path}.${k}`, expected: undefined, got: o[k] };
    const d = firstDifference(e[k], o[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}
