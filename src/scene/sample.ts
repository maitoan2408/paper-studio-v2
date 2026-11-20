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
  /** px màn hình trên mỗi px art. */
  scale: number;
  flipX: boolean;
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

  type Item = (typeof film.data.stage.layers)[number] | (typeof film.data.props)[number];
  const items: { item: Item; kind: number; index: number }[] = [
    ...film.data.stage.layers.map((item, index) => ({ item, kind: 0, index })),
    ...film.data.props.map((item, index) => ({ item, kind: 1, index })),
  ];
  // Xa trước; cùng depth: layer trước prop; rồi theo thứ tự trong file. Sắp ổn định, tất định.
  items.sort((a, b) => b.item.depth - a.item.depth || a.kind - b.kind || a.index - b.index);

  const sprites = items.map(({ item }): Sprite => {
    const asset = film.assets.get(item.asset);
    if (!asset) return fail('SCENE_UNKNOWN_ASSET', `film.${item.id}`, `asset "${item.asset}" not resolved`);
    const p = 1 / (1 + item.depth);
    const zoomL = cam0.zoom * (1 + (cam.zoom / cam0.zoom - 1) * p);
    const dx = item.x - cam0.x - (cam.x - cam0.x) * p;
    const dy = item.y - cam0.y - (cam.y - cam0.y) * p;
    const s: Sprite = {
      id: item.id,
      asset: asset.id,
      assetSha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      pivot: asset.pivot,
      x: W / 2 + dx * zoomL,
      y: H / 2 - dy * zoomL, // thế giới y-lên → màn hình y-xuống
      rot: item.rotation === 0 ? 0 : -item.rotation, // ngược chiều kim đồng hồ (thế giới) → theo chiều (màn hình)
      scale: item.scale * zoomL,
      flipX: false,
      opacity: 1,
    };
    if (item.shadow) {
      s.shadow = {
        dx: item.shadow.dx * zoomL,
        dy: item.shadow.dy === 0 ? 0 : -item.shadow.dy * zoomL,
        blur: item.shadow.blur * zoomL,
        opacity: item.shadow.opacity,
      };
    }
    return s;
  });

  return { frame, width: W, height: H, camera: cam, sprites };
}

/** Điểm art (px SVG) của sprite → px màn hình. Định nghĩa phép biến đổi mà renderer phải tuân theo. */
export function spriteToScreen(s: Sprite, artPoint: V2): V2 {
  const vx = (artPoint[0] - s.pivot[0]) * s.scale * (s.flipX ? -1 : 1);
  const vy = (artPoint[1] - s.pivot[1]) * s.scale;
  const r = (s.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const n = Math.sin(r);
  return [s.x + vx * c - vy * n, s.y + vx * n + vy * c];
}
