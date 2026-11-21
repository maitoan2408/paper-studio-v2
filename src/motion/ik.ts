/**
 * IK giải tích 2 xương (luật cos). Không gian: local nhân vật (y-lên, gốc = pivot xương gốc, chưa lật/scale).
 * Độ dài lấy từ anchor art của đúng variant đang dùng. Không với tới → IK_UNREACHABLE (không kéo dài xương, không đoán).
 * Trả về góc KHỚP (local) mới cho upper/lower(/end); trộn tuyến tính với FK theo trọng số w (góc chuẩn hoá về (−180, 180]).
 */
import { fail } from '../core/errors.ts';
import { angleOf, artToLocal, length, rotate, type V2 } from '../core/space.ts';
import type { ArtPack } from '../schema/art-pack.ts';
import type { Rig } from '../schema/rig.ts';
import { forwardKinematics, type PoseInput } from '../rig/pose.ts';

const wrap = (d: number) => {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
};

export function solveChain(rig: Rig, pack: ArtPack, characterId: string, pose: PoseInput, chainName: string, target: V2, weight: number): Map<string, number> {
  const chain = rig.data.ik?.[chainName];
  if (!chain) return fail('RIG_IK_INVALID', `rig.ik.${chainName}`, 'no such IK chain');
  const out = new Map<string, number>();
  if (weight <= 0) return out;
  const parts = forwardKinematics(rig, pack, characterId, pose);
  const part = (b: string) => parts.find((p) => p.bone === b)!;
  const up = part(chain.upper);
  const lo = part(chain.lower);
  const en = part(chain.end);
  const loBone = rig.order.find((b) => b.id === chain.lower)!;
  const enBone = rig.order.find((b) => b.id === chain.end)!;
  const contact = rig.data.contacts[chain.contact]!;

  const u1 = artToLocal(up.asset.anchors[loBone.attach!]!, up.asset.pivot);
  const lowerToEnd = artToLocal(lo.asset.anchors[enBone.attach!]!, lo.asset.pivot);
  const endToContact = artToLocal(en.asset.anchors[contact.anchor]!, en.asset.pivot);
  const localEnd = pose.angle(chain.end);

  // Điểm cần đưa tới và vector của "lower" trong hệ của nó.
  let goal: V2 = target;
  let v2: V2;
  if (chain.endWorldAngle !== undefined) {
    const e = rotate(endToContact, chain.endWorldAngle);
    goal = [target[0] - e[0], target[1] - e[1]];
    v2 = lowerToEnd;
  } else {
    const e = rotate(endToContact, localEnd);
    v2 = [lowerToEnd[0] + e[0], lowerToEnd[1] + e[1]];
  }
  const L1 = length(u1);
  const L2 = length(v2);
  const S = up.pos;
  const d = Math.hypot(goal[0] - S[0], goal[1] - S[1]);
  if (d > L1 + L2 + 1e-9 || d < Math.abs(L1 - L2) - 1e-9 || d === 0) {
    const need = d > L1 + L2 ? `${(d - (L1 + L2)).toFixed(1)} px too far` : `${(Math.abs(L1 - L2) - d).toFixed(1)} px too close`;
    fail('IK_UNREACHABLE', `${characterId}.${chainName}`, `target is ${need} (reach ${Math.abs(L1 - L2).toFixed(1)}–${(L1 + L2).toFixed(1)} px art)`);
  }
  const base = angleOf([goal[0] - S[0], goal[1] - S[1]]);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const dir1 = base + chain.bend * ((Math.acos(cosA) * 180) / Math.PI);
  const worldUpper = dir1 - angleOf(u1);
  const E: V2 = [S[0] + L1 * Math.cos((dir1 * Math.PI) / 180), S[1] + L1 * Math.sin((dir1 * Math.PI) / 180)];
  const worldLower = angleOf([goal[0] - E[0], goal[1] - E[1]]) - angleOf(v2);
  const parentWorld = up.angle - pose.angle(chain.upper);

  // Góc khớp chuẩn hoá về (−180, 180] (miền chứa mọi giới hạn khớp) rồi nội suy TUYẾN TÍNH.
  // Không dùng "đường quay ngắn nhất": khi hai nghiệm lệch ~180° nó đổi chiều giữa hai frame → giật.
  const set = (bone: string, ik: number) => {
    const fk = pose.angle(bone);
    out.set(bone, fk + weight * (wrap(ik) - fk));
  };
  set(chain.upper, worldUpper - parentWorld);
  set(chain.lower, worldLower - worldUpper);
  if (chain.endWorldAngle !== undefined) set(chain.end, chain.endWorldAngle - worldLower);
  return out;
}
