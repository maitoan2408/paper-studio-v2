/**
 * Ráp con rối (FK) — hàm thuần. Không gian local của nhân vật: y LÊN, gốc = pivot xương gốc, góc độ CCW.
 * Góc thế giới của xương = góc thế giới cha + góc khớp. Vị trí khớp = anchor `attach` trên art (variant hiện tại)
 * của xương cha, xoay theo góc thế giới của cha. Không có số đo cơ thể nào ngoài art.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { ArtPack, Asset } from '../schema/art-pack.ts';
import type { Rig } from '../schema/rig.ts';

export interface Part {
  bone: string;
  asset: Asset;
  /** Pivot của xương, local y-lên, tính từ pivot xương gốc. */
  pos: V2;
  /** Góc thế giới (độ, CCW). */
  angle: number;
  z: number;
  order: number;
}

export interface PoseInput {
  angle(bone: string): number;
  variant(bone: string): string;
}

export function restPose(rig: Rig, characterId: string): PoseInput {
  const ch = character(rig, characterId);
  return { angle: (b) => ch.rest[b]!, variant: () => 'default' };
}

function character(rig: Rig, id: string) {
  const ch = rig.data.characters.find((c) => c.id === id);
  if (!ch) return fail('RIG_UNKNOWN_CHARACTER', `rig.${rig.data.id}`, `character "${id}" not in rig`);
  return ch;
}

export function assetFor(rig: Rig, pack: ArtPack, characterId: string, bone: string, variant: string): Asset {
  const skin = character(rig, characterId).skin[bone];
  const id = variant === 'default' ? skin?.default : skin?.variants?.[variant];
  const a = id === undefined ? undefined : pack.assets.get(id);
  if (!a) return fail('ACTION_UNKNOWN_VARIANT', `${characterId}.${bone}`, `no asset for variant "${variant}"`);
  return a;
}

export function forwardKinematics(rig: Rig, pack: ArtPack, characterId: string, pose: PoseInput): Part[] {
  const parts = new Map<string, Part>();
  rig.order.forEach((b, order) => {
    const asset = assetFor(rig, pack, characterId, b.id, pose.variant(b.id));
    const local = pose.angle(b.id);
    if (b.parent === null || b.attach === null) {
      parts.set(b.id, { bone: b.id, asset, pos: [0, 0], angle: local, z: b.z, order });
      return;
    }
    const p = parts.get(b.parent)!;
    const anchor = p.asset.anchors[b.attach];
    if (!anchor) fail('RIG_ANCHOR_MISSING', `${characterId}.${b.parent}`, `asset "${p.asset.id}" lacks anchor "${b.attach}"`);
    const off = rotate(artToLocal(anchor, p.asset.pivot), p.angle);
    parts.set(b.id, { bone: b.id, asset, pos: [p.pos[0] + off[0], p.pos[1] + off[1]], angle: p.angle + local, z: b.z, order });
  });
  return [...parts.values()];
}

/** Vị trí local (y-lên) của một contact trong tư thế đã ráp. */
export function contactPoint(rig: Rig, parts: Part[], contact: string): V2 {
  const c = rig.data.contacts[contact];
  const part = c && parts.find((p) => p.bone === c.bone);
  const a = c && part?.asset.anchors[c.anchor];
  if (!c || !part || !a) return fail('RIG_ANCHOR_MISSING', `rig.contacts.${contact}`, 'contact not resolvable in this pose');
  const v = rotate(artToLocal(a, part.asset.pivot), part.angle);
  return [part.pos[0] + v[0], part.pos[1] + v[1]];
}

/** Độ cao pivot gốc so với mặt đỡ để contact `ground` thấp nhất chạm sàn trong tư thế nghỉ (px art). */
export function standingHeight(rig: Rig, pack: ArtPack, characterId: string): number {
  const parts = forwardKinematics(rig, pack, characterId, restPose(rig, characterId));
  return -Math.min(...rig.data.ground.map((g) => contactPoint(rig, parts, g)[1]));
}
