/** Hợp đồng dữ liệu Node ↔ trang render. Chỉ chứa type (bị xóa khi chạy). */
import type { SceneFrame } from '../scene/sample.ts';

export interface PageAsset {
  sha256: string;
  url: string;
  width: number;
  height: number;
  pivot: readonly [number, number];
  /** Hệ số raster SVG → texture (px texture trên mỗi px art). */
  raster: number;
}

export interface PageShadow {
  sha256: string;
  /** Bán kính blur tính bằng px art (số nguyên). */
  blurArt: number;
}

/** /scene.json — chỉ dữ liệu, không có code. */
export interface PageConfig {
  width: number;
  height: number;
  assetTimeoutMs: number;
  assets: PageAsset[];
  shadows: PageShadow[];
  frames: SceneFrame[];
}

/** State mà trang ĐÃ VẼ, đọc lại từ đối tượng Three.js (không phải chép lại input). */
export interface DrawnSprite {
  id: string;
  sha256: string;
  x: number;
  y: number;
  rot: number;
  scale: number;
  flipX: boolean;
  opacity: number;
  shadow: { dx: number; dy: number; blurArt: number; opacity: number } | null;
}

export interface DrawnFrame {
  frame: number;
  sprites: DrawnSprite[];
}
