/**
 * Trạng thái nhân vật ở một frame = clip (timeline) + đi bộ + khóa bàn chân bằng IK. Hàm thuần.
 *
 * Khi rig có `gait` và 2 chuỗi IK có contact thuộc `ground`: bàn chân LUÔN khóa sàn.
 * Độ cao gốc h (px art trên mặt đỡ) = min theo từng chân của độ cao lớn nhất mà cổ chân còn với tới
 * reachRatio·L (gối hơi chùng), cộng rootY của clip. Hàm liên tục theo vị trí bàn chân → không giật.
 * Rig không có gait: giữ cách cũ (FK tư thế nghỉ, standingHeight).
 */
import { fail, StudioError } from '../core/errors.ts';
import { artToLocal, length, rotate, type V2 } from '../core/space.ts';
import type { Film } from '../schema/film.ts';
import type { Rig } from '../schema/rig.ts';
import type { ArtPack } from '../schema/art-pack.ts';
import { contactPoint, forwardKinematics, restPose, standingHeight, type PoseInput } from '../rig/pose.ts';
import { solveChain } from './ik.ts';
import { activeItems, characterPose, keyValue } from './timeline.ts';
import { anchorOffset, restPivot, segmentAt } from './props.ts';
import { solvedPoint } from './interaction.ts';
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

export function characterState(film: Film, ci: number, frame: number, ignorePoints?: ReadonlySet<string>): CharacterState {
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
    applyReach(film, ci, frame, angles, clip.variants, root, sign, c.scale, ignorePoints);
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
  applyReach(film, ci, frame, angles, clip.variants, root, walk.fx, c.scale, ignorePoints);
  return { angles, variants: clip.variants, squash: clip.squash, root, fx: walk.fx, scale: c.scale, walk };
}

/**
 * Kênh reach: IK tay tới đích thế giới với trọng số = w(blend) · keys(t). Đích {role, anchor} chỉ hợp lệ khi
 * đạo cụ đang NẰM YÊN (PROP_TARGET_HELD nếu đang trong tay ai). Không với trong lúc đang lật hướng.
 */
function applyReach(film: Film, ci: number, frame: number, angles: Map<string, number>, variants: Map<string, string>, root: V2, fx: number, scale: number, ignorePoints?: ReadonlySet<string>): void {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  const pack = film.packs.get(c.pack)!;
  // Gom theo chuỗi tay: đích = trung bình có trọng số (tay đi THẲNG giữa các đích), trọng số FK→IK = 1 − Π(1 − wᵢ);
  // giải IK MỘT lần cho mỗi chuỗi. Một kênh duy nhất ⇒ đúng như trộn FK↔IK thông thường.
  const byChain = new Map<string, { flip: boolean; where: string; targets: { local: V2; w: number; label?: string }[] }>();
  for (const a of activeItems(film, ci, frame)) {
    for (const ch of a.clip.channels) {
      if (ch.prop !== 'reach') continue;
      if ('point' in ch.target) {
        const b = a.item.bind.points?.[ch.target.point];
        if (b && 'use' in b && ignorePoints?.has(b.use)) continue; // đang giải chính điểm này
      }
      const weight = a.w * keyValue(ch.keys, a.t);
      if (weight <= 0) continue;
      const where = `film.timeline[${a.index}] frame ${frame}`;
      const contact = a.side ? ch.contact.replace('.@active', `.${a.side}`) : ch.contact;
      const chainName = Object.entries(rig.data.ik ?? {}).find(([, k]) => k.contact === contact)?.[0];
      if (!chainName) fail('ACTION_UNKNOWN_BONE', where, `no IK chain for contact "${contact}"`);
      const flip = ch.bend === 'flip';
      const other = byChain.get(chainName);
      if (other && other.flip !== flip) {
        fail('IK_BEND_CONFLICT', `${where} (${a.item.clip})`, `${c.id}.${chainName}: reach channels with opposite bends overlap (also ${other.where}); fade one to 0 before the other starts`);
      }
      const entry = other ?? { flip, where: `${where} (${a.item.clip})`, targets: [] };
      byChain.set(chainName, entry);
      let target: V2 | undefined; // đích thế giới (y-lên)
      let local: V2 | undefined; // hoặc đích local trực tiếp (bám thân — dùng được cả khi đang lật)
      let label: string | undefined; // đích là anchor đạo cụ: nêu trong lỗi IK (vd. nhặt lại vật nằm ngoài tầm tay)
      const tg = ch.target;
      // offset.x đối xứng gương khi @active = r (như giá trị xoay của xương @active — timeline.ts).
      const ox = (a.side === 'r' ? -1 : 1) * ('offset' in tg ? (tg.offset?.x ?? 0) : 0);
      const oy = 'offset' in tg ? (tg.offset?.y ?? 0) : 0;
      if ('point' in tg) {
        const p = a.item.bind.points?.[tg.point];
        if (!p) fail('FILM_UNKNOWN_REF', `${where}.bind.points.${tg.point}`, 'point is not bound');
        target = 'use' in p ? solvedPoint(film, p.use) : [p.x, p.y];
      } else if ('bone' in tg) {
        const bone = a.side ? tg.bone.replace('.@active', `.${a.side}`) : tg.bone;
        const anchor = a.side ? tg.anchor.replace('.@active', `.${a.side}`) : tg.anchor;
        const parts = forwardKinematics(rig, pack, c.character, { angle: (b) => angles.get(b)!, variant: (b) => variants.get(b) ?? 'default' });
        const part = parts.find((p) => p.bone === bone);
        const an = part?.asset.anchors[anchor];
        if (!part || !an) fail('RIG_ANCHOR_MISSING', where, `${c.character}: bone "${bone}" has no anchor "${anchor}"`);
        const v = rotate(artToLocal(an, part.asset.pivot), part.angle);
        local = [part.pos[0] + v[0] + ox, part.pos[1] + v[1] + oy];
      } else {
        const propId = a.item.bind.roles?.[tg.role];
        if (!propId) fail('ACTION_PRECONDITION', `${where}.bind.roles.${tg.role}`, 'role is not bound to a prop');
        const off = anchorOffset(film, propId, tg.anchor, frame);
        let pivot: V2;
        if (tg.at === 'place') {
          const pl = a.item.bind.place;
          if (!pl) fail('ACTION_PRECONDITION', `${where}.bind.place`, 'reach "at: place" needs bind.place');
          const s = film.data.stage.surfaces.find((x) => x.id === pl.surface);
          if (!s) fail('FILM_UNKNOWN_REF', `${where}.bind.place`, `surface "${pl.surface}" does not exist`);
          pivot = [pl.x, s.y];
        } else {
          const seg = segmentAt(film, propId, frame);
          const others = seg.holders.filter((h) => !(h.ci === ci && h.contact === contact));
          if (others.length > 0) fail('PROP_TARGET_HELD', where, `reach target "${propId}" is held by someone else; reach a point instead`);
          // Đang do chính tay này cầm: đích là chỗ đồ nằm TRƯỚC khi cầm (rời tay khỏi chỗ nhặt mượt mà) — gồm pose bake
          // ở frame trước grip nếu nhặt lại sau rơi tự do.
          const mine = seg.holders.find((h) => h.ci === ci && h.contact === contact);
          pivot = restPivot(film, propId, mine ? mine.since - 1 : frame);
        }
        // clear = dời VỀ PHÍA NGƯỜI một phần bề ngang của chính đạo cụ (px thế giới, suy ra từ art × scale; gương khi r).
        const pr = film.data.props.find((x) => x.id === propId)!;
        const clearX = (a.side === 'r' ? 1 : -1) * (tg.clear ?? 0) * film.assets.get(pr.asset)!.width * pr.scale;
        target = [pivot[0] + off[0] + fx * (scale * ox + clearX), pivot[1] + off[1] + scale * oy];
        label = `"${propId}" anchor "${tg.anchor}" at (${(pivot[0] + off[0]).toFixed(1)}, ${(pivot[1] + off[1]).toFixed(1)})`;
      }
      if (!local) {
        if (Math.abs(fx) < 1) fail('ACTION_PRECONDITION', where, `${c.id} reaches a world target while turning`);
        local = [(target![0] - root[0]) / (fx * scale), (target![1] - root[1]) / scale];
      }
      entry.targets.push({ local, w: weight, ...(label ? { label } : {}) });
    }
  }
  for (const [chainName, e] of byChain) {
    const sw = e.targets.reduce((acc, t) => acc + t.w, 0);
    const target: V2 = [e.targets.reduce((acc, t) => acc + t.w * t.local[0], 0) / sw, e.targets.reduce((acc, t) => acc + t.w * t.local[1], 0) / sw];
    const W = 1 - e.targets.reduce((acc, t) => acc * (1 - t.w), 1);
    const pose: PoseInput = { angle: (b) => angles.get(b)!, variant: (b) => variants.get(b) ?? 'default' };
    let solved: Map<string, number>;
    try {
      solved = solveChain(rig, pack, c.character, pose, chainName, target, W, e.flip);
    } catch (err) {
      const labels = [...new Set(e.targets.flatMap((t) => (t.label ? [t.label] : [])))];
      if (err instanceof StudioError) fail(err.code, e.where, `${err.path}: ${err.detail}${labels.length ? `; reaching ${labels.join(', ')}` : ''}`);
      throw err;
    }
    for (const [b, v] of solved) angles.set(b, v);
  }
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
