import { z } from 'zod';
import { fail, parseWith } from '../core/errors.ts';
import { artToLocal, length } from '../core/space.ts';
import type { ArtPack } from './art-pack.ts';
import { AnchorName } from './art-pack.ts';
import { Id, firstDuplicate } from './common.ts';

/** Id xương: tên + hậu tố bên tùy chọn (`forearm.l`). */
export const BoneId = z.string().regex(/^[a-z][a-z0-9-]*(\.[lr])?$/, 'bone id must match ^[a-z][a-z0-9-]*(\\.[lr])?$');
const Angle = z.number().finite().min(-180).max(180);

const BoneSchema = z
  .object({
    id: BoneId,
    parent: BoneId.nullable(),
    attach: AnchorName.nullable(),
    limits: z.object({ min: Angle, max: Angle }).strict(),
    /** Tốc độ xoay khớp tối đa (độ/frame) — NGƯỠNG DUY NHẤT cho tính liên tục của xương này. */
    maxDegPerFrame: z.number().finite().positive().max(90),
    z: z.number().int().min(-100).max(100),
  })
  .strict();

const SkinSchema = z.object({ default: Id, variants: z.record(Id, Id).optional() }).strict();

/**
 * Chuỗi IK 2 xương: upper → lower → end, contact nằm trên `end`.
 * bend = +1/−1: khớp giữa (khuỷu/gối) nằm về phía góc dương/âm của đường gốc→đích (local nhân vật, y-lên).
 * endWorldAngle: nếu có, xương `end` giữ góc thế giới này (vd. bàn chân phẳng = 0); nếu không, `end` giữ góc khớp FK.
 */
const IkChainSchema = z
  .object({ upper: BoneId, lower: BoneId, end: BoneId, contact: AnchorName, bend: z.union([z.literal(1), z.literal(-1)]), endWorldAngle: Angle.optional() })
  .strict();

/** Tham số dáng đi, tính theo tỷ lệ chiều dài chân (lấy từ art) — không có số đo tuyệt đối. */
const GaitSchema = z
  .object({
    strideRatio: z.number().finite().positive().max(1.5),
    liftRatio: z.number().finite().min(0).max(0.5),
    reachRatio: z.number().finite().min(0.8).max(0.999),
    /** Phần đầu mỗi bước bàn chân di chuyển; phần còn lại cả hai chân cùng trụ (không có frame nào hai chân cùng trượt). */
    swingRatio: z.number().finite().min(0.3).max(0.9),
    turnFrames: z.number().int().min(1).max(48),
    /** Xương đung đưa theo nhịp bước (cùng chiều, ±armSwingDeg) — dữ liệu, không gắn tên trong code. */
    swingBones: z.array(BoneId),
    armSwingDeg: z.number().finite().min(0).max(45),
  })
  .strict();

const CharacterSchema = z
  .object({ id: Id, skin: z.record(BoneId, SkinSchema), rest: z.record(BoneId, Angle) })
  .strict();

const RigSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    sides: z.tuple([z.literal('l'), z.literal('r')]),
    bones: z.array(BoneSchema).min(1),
    contacts: z.record(AnchorName, z.object({ bone: BoneId, anchor: AnchorName }).strict()),
    /** Contact chạm mặt đỡ khi đứng (vd. sole.l, sole.r): dùng để đặt nhân vật đúng sàn. */
    ground: z.array(AnchorName).min(1),
    ik: z.record(BoneId, IkChainSchema).optional(),
    gait: GaitSchema.optional(),
    characters: z.array(CharacterSchema).min(1),
  })
  .strict();

export type RigData = z.output<typeof RigSchema>;
export type Bone = z.output<typeof BoneSchema>;

export interface CharacterInfo {
  id: string;
  /** Độ dài suy ra từ art: |anchor attach − pivot| trên asset default của xương cha. Khóa = id xương con. */
  boneLengths: ReadonlyMap<string, number>;
}

export interface Rig {
  data: RigData;
  /** Xương theo thứ tự cha trước con. */
  order: readonly Bone[];
  characters: ReadonlyMap<string, CharacterInfo>;
}

export function validateRig(raw: unknown, pack: ArtPack): Rig {
  const data = parseWith(RigSchema, raw, 'RIG_SCHEMA', 'rig');
  const bones = new Map(data.bones.map((b) => [b.id, b]));
  const dupBone = firstDuplicate(data.bones.map((b) => b.id));
  if (dupBone) fail('RIG_SCHEMA', 'rig.bones', `duplicate bone id "${dupBone}"`);
  const dupChar = firstDuplicate(data.characters.map((c) => c.id));
  if (dupChar) fail('RIG_SCHEMA', 'rig.characters', `duplicate character id "${dupChar}"`);

  // Cấu trúc cây.
  for (const b of data.bones) {
    const where = `rig.bones.${b.id}`;
    if (b.parent !== null && !bones.has(b.parent)) fail('RIG_UNKNOWN_PARENT', where, `parent "${b.parent}" does not exist`);
    if ((b.parent === null) !== (b.attach === null)) fail('RIG_SCHEMA', where, 'attach must be null exactly when parent is null');
    if (!(b.limits.min < b.limits.max)) fail('RIG_LIMIT_INVALID', `${where}.limits`, `min ${b.limits.min} must be < max ${b.limits.max}`);
  }
  const roots = data.bones.filter((b) => b.parent === null);
  if (roots.length !== 1) fail('RIG_ROOT_COUNT', 'rig.bones', `expected exactly 1 root, found ${roots.length}`);
  const order = topoOrder(data.bones);

  // Xương hai bên phải có cặp đối xứng (để @active = l/r luôn hợp lệ).
  for (const b of data.bones) {
    const m = /^(.*)\.([lr])$/.exec(b.id);
    if (!m) continue;
    const twin = `${m[1]}.${m[2] === 'l' ? 'r' : 'l'}`;
    if (!bones.has(twin)) fail('RIG_SIDE_UNPAIRED', `rig.bones.${b.id}`, `missing mirrored bone "${twin}"`);
  }

  for (const [name, c] of Object.entries(data.contacts)) {
    if (!bones.has(c.bone)) fail('RIG_UNKNOWN_PARENT', `rig.contacts.${name}`, `bone "${c.bone}" does not exist`);
  }
  for (const g of data.ground) if (!data.contacts[g]) fail('RIG_UNKNOWN_PARENT', 'rig.ground', `contact "${g}" does not exist`);
  for (const [name, ch] of Object.entries(data.ik ?? {})) {
    const where = `rig.ik.${name}`;
    const u = bones.get(ch.upper);
    const l = bones.get(ch.lower);
    const e = bones.get(ch.end);
    if (!u || !l || !e) fail('RIG_IK_INVALID', where, 'upper/lower/end must be existing bones');
    if (l.parent !== u.id || e.parent !== l.id) fail('RIG_IK_INVALID', where, `chain must be parent→child: ${ch.upper} → ${ch.lower} → ${ch.end}`);
    if (data.contacts[ch.contact]?.bone !== ch.end) fail('RIG_IK_INVALID', where, `contact "${ch.contact}" must be on bone "${ch.end}"`);
  }
  for (const b of data.gait?.swingBones ?? []) if (!bones.has(b)) fail('RIG_UNKNOWN_PARENT', 'rig.gait.swingBones', `bone "${b}" does not exist`);

  const characters = new Map<string, CharacterInfo>();
  for (const ch of data.characters) characters.set(ch.id, validateCharacter(ch, data, bones, order, pack));
  return { data, order, characters };
}

function validateCharacter(
  ch: RigData['characters'][number],
  rig: RigData,
  bones: ReadonlyMap<string, Bone>,
  order: readonly Bone[],
  pack: ArtPack,
): CharacterInfo {
  const at = `rig.characters.${ch.id}`;
  for (const id of [...Object.keys(ch.skin), ...Object.keys(ch.rest)]) {
    if (!bones.has(id)) fail('RIG_SKIN_INCOMPLETE', at, `unknown bone "${id}"`);
  }
  for (const b of order) {
    if (!ch.skin[b.id]) fail('RIG_SKIN_INCOMPLETE', `${at}.skin`, `no skin for bone "${b.id}"`);
    const rest = ch.rest[b.id];
    if (rest === undefined) fail('RIG_SKIN_INCOMPLETE', `${at}.rest`, `no rest angle for bone "${b.id}"`);
    if (rest < b.limits.min || rest > b.limits.max) {
      fail('RIG_REST_OUT_OF_LIMIT', `${at}.rest.${b.id}`, `${rest} outside [${b.limits.min}, ${b.limits.max}]`);
    }
  }
  const assetsOf = (boneId: string) => {
    const s = ch.skin[boneId]!;
    return [['default', s.default], ...Object.entries(s.variants ?? {})] as const;
  };
  for (const b of order) {
    for (const [variant, assetId] of assetsOf(b.id)) {
      if (!pack.assets.has(assetId)) fail('RIG_ASSET_MISSING', `${at}.skin.${b.id}.${variant}`, `asset "${assetId}" not in pack ${pack.id}`);
    }
  }

  // Mọi variant của xương cha phải có anchor gắn con; độ dài > 0.
  const boneLengths = new Map<string, number>();
  for (const b of order) {
    if (b.parent === null || b.attach === null) continue;
    for (const [variant, assetId] of assetsOf(b.parent)) {
      const a = pack.assets.get(assetId)!;
      const p = a.anchors[b.attach];
      if (!p) fail('RIG_ANCHOR_MISSING', `${at}.skin.${b.parent}.${variant}`, `asset "${assetId}" lacks anchor "${b.attach}" for child "${b.id}"`);
      const len = length(artToLocal(p, a.pivot));
      if (len === 0) fail('RIG_DEGENERATE_BONE', `${at}.skin.${b.parent}.${variant}`, `anchor "${b.attach}" coincides with pivot of "${assetId}"`);
      if (variant === 'default') boneLengths.set(b.id, len);
    }
  }
  for (const [name, c] of Object.entries(rig.contacts)) {
    for (const [variant, assetId] of assetsOf(c.bone)) {
      if (!pack.assets.get(assetId)!.anchors[c.anchor]) {
        fail('RIG_ANCHOR_MISSING', `${at}.skin.${c.bone}.${variant}`, `asset "${assetId}" lacks contact anchor "${c.anchor}" (${name})`);
      }
    }
  }
  return { id: ch.id, boneLengths };
}

function topoOrder(list: readonly Bone[]): Bone[] {
  const children = new Map<string, Bone[]>();
  for (const b of list) if (b.parent !== null) children.set(b.parent, [...(children.get(b.parent) ?? []), b]);
  const out: Bone[] = [];
  const stack = list.filter((b) => b.parent === null);
  while (stack.length > 0) {
    const b = stack.pop()!;
    out.push(b);
    stack.push(...(children.get(b.id) ?? []).slice().reverse());
  }
  // Xương không tới được từ gốc ⇒ có chu trình.
  if (out.length !== list.length) {
    const reached = new Set(out.map((b) => b.id));
    const stuck = list.find((b) => !reached.has(b.id))!;
    fail('RIG_CYCLE', `rig.bones.${stuck.id}`, 'bone is part of a parent cycle');
  }
  return out;
}
