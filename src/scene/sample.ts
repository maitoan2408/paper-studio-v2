/**
 * film + frame → SceneFrame. Hàm thuần: không đồng hồ, không trạng thái, không phụ thuộc thứ tự gọi.
 *
 * SceneFrame ở KHÔNG GIAN MÀN HÌNH: px của khung xuất, gốc trên-trái, y hướng XUỐNG,
 * rot độ dương = THEO chiều kim đồng hồ trên màn hình (giống SVG/CSS).
 * Đây là chỗ duy nhất đổi từ thế giới (y lên, góc dương ngược chiều kim đồng hồ) sang màn hình.
 *
 * Multiplane: lớp ở depth d có hệ số p = 1/(1+d). Mọi thứ tính tương đối với key camera đầu tiên,
 * nên ở frame 0 bố cục đúng như dữ liệu; khi camera dịch/zoom, lớp xa đổi ít hơn lớp gần.
 */
import { fail } from '../core/errors.ts';
import type { V2 } from '../core/space.ts';
import { ease } from '../motion/easing.ts';
import type { Film } from '../schema/film.ts';
import type { Asset } from '../schema/art-pack.ts';
import { characterState, contactWorld } from '../motion/character.ts';
import { propPivot, segmentAt } from '../motion/props.ts';
import { forwardKinematics } from '../rig/pose.ts';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Sprite {
  /** id của layer/prop trong film. */
  id: string;
  asset: string;
  assetSha256: string;
  /** Kích thước và pivot của art (px SVG, y xuống). */
  width: number;
  height: number;
  pivot: V2;
  /** Vị trí pivot trên màn hình (px, y xuống). */
  x: number;
  y: number;
  /** Độ, dương = theo chiều kim đồng hồ trên màn hình. */
  rot: number;
  /** px màn hình trên mỗi px art theo chiều dọc. */
  scale: number;
  /** px màn hình trên mỗi px art theo chiều ngang, CÓ DẤU: âm = lật gương; |scaleX| < scale = bóp ngang. */
  scaleX: number;
  /**
   * Co ngang TRÊN MÀN HÌNH, áp SAU khi xoay, quanh pivot của sprite (0 < paperX < 1). Chỉ có khi nhân vật đang lật
   * như tờ giấy: cả con rối co theo trục x thế giới với hệ số |fx| — cùng phép co mà vị trí khớp, contact và đồ cầm
   * tay dùng, nên hình vẽ ra khớp đúng các điểm đó. Vắng mặt = 1.
   */
  paperX?: number;
  opacity: number;
  /** Bóng đổ ở không gian màn hình (dy dương = xuống). */
  shadow?: { dx: number; dy: number; blur: number; opacity: number };
}

export interface SceneFrame {
  frame: number;
  width: number;
  height: number;
  camera: Camera;
  /** Thứ tự vẽ: xa → gần. */
  sprites: Sprite[];
}

export function cameraAt(film: Film, frame: number): Camera {
  const keys = film.data.camera.keys;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.frame <= frame) i++;
  const a = keys[i]!;
  const b = keys[i + 1];
  if (!b) return { x: a.x, y: a.y, zoom: a.zoom };
  const e = ease(a.ease ?? 'linear', (frame - a.frame) / (b.frame - a.frame));
  const lerp = (p: number, q: number) => p + (q - p) * e;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), zoom: lerp(a.zoom, b.zoom) };
}

export function sampleFrame(film: Film, frame: number): SceneFrame {
  const { width: W, height: H, durationFrames } = film.data.output;
  if (!Number.isInteger(frame) || frame < 0 || frame >= durationFrames) {
    fail('SCENE_FRAME_RANGE', 'frame', `${frame} not in [0, ${durationFrames - 1}]`);
  }
  const cam = cameraAt(film, frame);
  const cam0 = film.data.camera.keys[0]!;

  /** Chiếu một điểm thế giới (y-lên) ở depth cho trước lên màn hình; trả về cả hệ số zoom của lớp. */
  const project = (x: number, y: number, depth: number) => {
    const p = 1 / (1 + depth);
    const zoomL = cam0.zoom * (1 + (cam.zoom / cam0.zoom - 1) * p);
    const dx = x - cam0.x - (cam.x - cam0.x) * p;
    const dy = y - cam0.y - (cam.y - cam0.y) * p;
    return { sx: W / 2 + dx * zoomL, sy: H / 2 - dy * zoomL, zoomL }; // thế giới y-lên → màn hình y-xuống
  };
  const base = (id: string, asset: Asset) => ({
    id, asset: asset.id, assetSha256: asset.sha256, width: asset.width, height: asset.height, pivot: asset.pivot, opacity: 1,
  });

  type Item = (typeof film.data.stage.layers)[number] | (typeof film.data.props)[number];
  /** Người đang cầm đạo cụ ở frame này (tay nắm gần nhất), nếu có. */
  const heldBy = (propId: string) => {
    const s = segmentAt(film, propId, frame);
    return s.holders.length > 0 ? s.holders[s.holders.length - 1]! : undefined;
  };
  const flat = (item: Item, isProp: boolean, depth = item.depth): Sprite[] => {
    const asset = film.assets.get(item.asset);
    if (!asset) return fail('SCENE_UNKNOWN_ASSET', `film.${item.id}`, `asset "${item.asset}" not resolved`);
    // Đạo cụ: vị trí theo trạng thái cầm/đặt ở frame này (nằm yên tại chỗ dàn cảnh nếu chưa ai cầm).
    const [x, y] = isProp ? propPivot(film, item.id, frame, (ci, contact) => contactWorld(film, ci, frame, contact)) : [item.x, item.y];
    const { sx, sy, zoomL } = project(x, y, depth);
    const s: Sprite = {
      ...base(item.id, asset),
      x: sx,
      y: sy,
      rot: item.rotation === 0 ? 0 : -item.rotation, // ngược chiều kim đồng hồ (thế giới) → theo chiều (màn hình)
      scale: item.scale * zoomL,
      scaleX: item.scale * zoomL,
    };
    if (item.shadow) {
      s.shadow = {
        dx: item.shadow.dx * zoomL,
        dy: item.shadow.dy === 0 ? 0 : -item.shadow.dy * zoomL,
        blur: item.shadow.blur * zoomL,
        opacity: item.shadow.opacity,
      };
    }
    return [s];
  };

  /** Nhân vật: FK trong không gian local (y-lên), lật theo hướng, đặt pivot gốc sao cho chân chạm mặt đỡ. */
  const puppet = (ci: number): Sprite[] => {
    const c = film.data.characters[ci]!;
    const rig = film.rigs.get(c.pack)!;
    const pack = film.packs.get(c.pack)!;
    const st = characterState(film, ci, frame);
    const parts = forwardKinematics(rig, pack, c.character, {
      angle: (b) => st.angles.get(b)!,
      variant: (b) => st.variants.get(b) ?? 'default',
    });
    // fx ∈ [−1, 1]: x local nhân với fx (lật/co như tờ giấy quanh gốc, theo trục x THẾ GIỚI); góc lật dấu theo dấu fx.
    // Sprite: gương (dấu) nằm trong scaleX/rot; phần co |fx| là paperX — áp sau khi xoay, giống hệt phép co của
    // vị trí khớp/contact (contactWorld), nên khớp và đồ cầm tay nằm đúng trên hình ở mọi frame lật.
    const sign = st.fx >= 0 ? 1 : -1;
    const paper = Math.abs(st.fx);
    // Đồ đang cầm: vẽ trong lượt của người cầm, ngay TRƯỚC sprite xương chứa contact đang nắm
    // (đồ đè lên thân/cánh tay nhưng nằm dưới bàn tay), chiếu ở depth của người cầm để bám tay khi parallax.
    const held = new Map<string, Sprite[]>();
    for (const p of film.data.props) {
      const h = heldBy(p.id);
      if (!h || h.ci !== ci) continue;
      const bone = rig.data.contacts[h.contact]!.bone;
      held.set(bone, [...(held.get(bone) ?? []), ...flat(p, true, c.depth)]);
    }
    return parts
      .slice()
      .sort((a, b) => a.z - b.z || a.order - b.order)
      .flatMap((part): Sprite[] => {
        const { sx, sy, zoomL } = project(st.root[0] + st.fx * part.pos[0] * c.scale, st.root[1] + part.pos[1] * c.scale, c.depth);
        const worldAngle = sign * part.angle; // lật gương: góc đổi dấu, art lật ngang
        const own: Sprite = {
          ...base(`${c.id}/${part.bone}`, part.asset),
          x: sx,
          y: sy,
          rot: worldAngle === 0 ? 0 : -worldAngle,
          scale: c.scale * zoomL,
          scaleX: sign * c.scale * zoomL * (st.squash.get(part.bone) ?? 1),
          ...(paper < 1 ? { paperX: paper } : {}),
        };
        return [...(held.get(part.bone) ?? []), own];
      });
  };

  const entries: { depth: number; kind: number; index: number; make: () => Sprite[] }[] = [
    ...film.data.stage.layers.map((it, index) => ({ depth: it.depth, kind: 0, index, make: () => flat(it, false) })),
    ...film.data.props.map((it, index) => ({ depth: it.depth, kind: 1, index, make: () => (heldBy(it.id) ? [] : flat(it, true)) })),
    ...film.data.characters.map((it, index) => ({ depth: it.depth, kind: 2, index, make: () => puppet(index) })),
  ];
  // Xa trước; cùng depth: layer → prop → nhân vật; rồi theo thứ tự trong file. Sắp ổn định, tất định.
  entries.sort((a, b) => b.depth - a.depth || a.kind - b.kind || a.index - b.index);
  const sprites = entries.flatMap((e) => e.make());

  return { frame, width: W, height: H, camera: cam, sprites };
}

/** Điểm art (px SVG) của sprite → px màn hình. Định nghĩa phép biến đổi mà renderer phải tuân theo. */
export function spriteToScreen(s: Sprite, artPoint: V2): V2 {
  const vx = (artPoint[0] - s.pivot[0]) * s.scaleX;
  const vy = (artPoint[1] - s.pivot[1]) * s.scale;
  const r = (s.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const n = Math.sin(r);
  return [s.x + (s.paperX ?? 1) * (vx * c - vy * n), s.y + vx * n + vy * c];
}
