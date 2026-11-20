/**
 * Trạng thái nhân vật ở một frame = clip (timeline) + đi bộ + khóa bàn chân bằng IK. Hàm thuần.
 *
 * Khi rig có `gait` và 2 chuỗi IK có contact thuộc `ground`: bàn chân LUÔN khóa sàn.
 * Độ cao gốc h (px art trên mặt đỡ) = min theo từng chân của độ cao lớn nhất mà cổ chân còn với tới
 * reachRatio·L (gối hơi chùng), cộng rootY của clip. Hàm liên tục theo vị trí bàn chân → không giật.
 * Rig không có gait: giữ cách cũ (FK tư thế nghỉ, standingHeight).
 */
import { fail } from '../core/errors.ts';
import { artToLocal, length, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import type { Rig } from '../schema/rig.ts';
import type { ArtPack } from '../schema/art-pack.ts';
import { contactPoint, forwardKinematics, restPose, standingHeight, type PoseInput } from '../rig/pose.ts';
import { solveChain } from './ik.ts';
import { characterPose } from './timeline.ts';
import { walkState, type WalkState } from './walk.ts';

export interface CharacterState {
  angles: Map<string, number>;
  variants: Map<string, string>;
  squash: Map<string, number>;
  /** Pivot gốc trong thế giới (y-lên). */
  root: V2;
  /** Hệ số hướng nhìn ∈ [−1, 1] (dấu = hướng; |fx| < 1 khi đang lật). */
  fx: number;
  scale: number;
  walk: WalkState;
}

interface LegInfo {
  chain: string;
  contact: string;
  /** Sole ở tư thế nghỉ, local. */
  restSole: V2;
  /** Vector cổ chân → sole khi bàn chân ở endWorldAngle (local). */
  ankleToSole: V2;
  /** Chiều dài hông→cổ chân (px art). */
  L: number;
}

export function legsOf(rig: Rig, pack: ArtPack, characterId: string): LegInfo[] {
  const chains = Object.entries(rig.data.ik ?? {}).filter(([, ch]) => rig.data.ground.includes(ch.contact));
  if (chains.length !== 2) fail('ACTION_PRECONDITION', `rig.${rig.data.id}`, `need exactly 2 IK chains on ground contacts, found ${chains.length}`);
  const rest = forwardKinematics(rig, pack, characterId, restPose(rig, characterId));
  const legs = chains.map(([name, ch]): LegInfo => {
    const part = (b: string) => rest.find((p) => p.bone === b)!;
    const up = part(ch.upper);
    const lo = part(ch.lower);
    const en = part(ch.end);
    const loBone = rig.order.find((b) => b.id === ch.lower)!;
    const enBone = rig.order.find((b) => b.id === ch.end)!;
    const L = length(artToLocal(up.asset.anchors[loBone.attach!]!, up.asset.pivot)) + length(artToLocal(lo.asset.anchors[enBone.attach!]!, lo.asset.pivot));
    const c = rig.data.contacts[ch.contact]!;
    return {
      chain: name,
      contact: ch.contact,
      restSole: contactPoint(rig, rest, ch.contact),
      ankleToSole: rotate(artToLocal(en.asset.anchors[c.anchor]!, en.asset.pivot), ch.endWorldAngle ?? 0),
      L,
    };
  });
  // Chân dẫn (index 0) = chân có sole nghỉ xa nhất về phía hướng nhìn (+x local).
  return legs.sort((a, b) => b.restSole[0] - a.restSole[0]);
}

export function characterState(film: Film, ci: number, frame: number): CharacterState {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const pack = film.packs.get(c.pack)!;
  const surface = film.data.stage.surfaces.find((s) => s.id === c.on)!;
  const clip = characterPose(film, ci, frame);
  const angles = new Map(clip.angles);

  if (!rig.data.gait) {
    const sign = c.facing === 'right' ? 1 : -1;
    const walk: WalkState = { rootX: c.x, fx: sign, stepPhase: 0 };
    const root: V2 = [c.x + sign * clip.root[0] * c.scale, surface.y + (standingHeight(rig, pack, c.character) + clip.root[1]) * c.scale];
    return { angles, variants: clip.variants, squash: clip.squash, root, fx: sign, scale: c.scale, walk };
  }

  const gait = rig.data.gait;
  const legs = legsOf(rig, pack, c.character);
  const walk = walkState(film, ci, frame, legs[0]!.L, gait.liftRatio, gait.swingRatio);
  const sign = walk.fx >= 0 ? 1 : -1;

  // Đung đưa tay khi bước (cộng vào clip).
  if (walk.step && gait.armSwingDeg > 0) {
    const a = gait.armSwingDeg * Math.sin(Math.PI * walk.stepPhase);
    for (const b of gait.swingBones) angles.set(b, angles.get(b)! + a);
  }

  // Vị trí sole mục tiêu (local x) và độ nhấc (local y trên mặt đỡ).
  const target = legs.map((leg, k) => {
    if (!walk.step) return { x: leg.restSole[0], lift: 0 };
    const restWorldX = walk.step.seg.fromX + walk.step.seg.dir * c.scale * leg.restSole[0];
    const worldX = restWorldX + walk.step.shift[k]!;
    return { x: (worldX - walk.rootX) / (sign * c.scale), lift: walk.step.lift[k]! };
  });

  // Hông theo pose hiện tại (pelvis có thể bị clip xoay).
  const pose: PoseInput = { angle: (b) => angles.get(b)!, variant: (b) => clip.variants.get(b) ?? 'default' };
  const parts = forwardKinematics(rig, pack, c.character, pose);
  let h = Infinity;
  legs.forEach((leg, k) => {
    const hip = parts.find((p) => p.bone === rig.data.ik![leg.chain]!.upper)!.pos;
    const ax = target[k]!.x - leg.ankleToSole[0];
    const dx = ax - hip[0];
    const R = gait.reachRatio * leg.L;
    if (Math.abs(dx) >= R) fail('IK_UNREACHABLE', `${c.id}.${leg.chain} frame ${frame}`, `foot is ${(Math.abs(dx) - R).toFixed(1)} px beyond reach; shorten the stride`);
    // cổ chân y = −h + lift − ankleToSole.y; cần (cổ chân y − hip y) ≥ −√(R² − dx²)
    h = Math.min(h, Math.sqrt(R * R - dx * dx) + target[k]!.lift - leg.ankleToSole[1] - hip[1]);
  });
  const hFinal = h + clip.root[1];

  let cur: PoseInput = pose;
  legs.forEach((leg, k) => {
    const solved = solveChain(rig, pack, c.character, cur, leg.chain, [target[k]!.x, -hFinal + target[k]!.lift], 1);
    for (const [b, v] of solved) angles.set(b, v);
    cur = { angle: (b) => angles.get(b)!, variant: pose.variant };
  });

  const root: V2 = [walk.rootX + walk.fx * clip.root[0] * c.scale, surface.y + hFinal * c.scale];
  return { angles, variants: clip.variants, squash: clip.squash, root, fx: walk.fx, scale: c.scale, walk };
}

/** Một contact của nhân vật trong thế giới (y-lên) — dùng cho test trượt chân và gắn đạo cụ. */
export function contactWorld(film: Film, ci: number, frame: number, contact: string, state = characterState(film, ci, frame)): V2 {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const pack = film.packs.get(c.pack)!;
  const parts = forwardKinematics(rig, pack, c.character, {
    angle: (b) => state.angles.get(b)!,
    variant: (b) => state.variants.get(b) ?? 'default',
  });
  const p = contactPoint(rig, parts, contact);
  return [state.root[0] + state.fx * state.scale * p[0], state.root[1] + state.scale * p[1]];
}
