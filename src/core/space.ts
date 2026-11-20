/**
 * Quy ước không gian — nơi DUY NHẤT đổi trục:
 * - Art (SVG): đơn vị px, gốc góc trên-trái, trục y hướng XUỐNG.
 * - Thế giới / local của xương: đơn vị px tại 1080p, trục y hướng LÊN.
 * - Góc: độ, dương = NGƯỢC chiều kim đồng hồ khi nhìn trong hệ y-lên.
 */
export type V2 = readonly [number, number];

/** Điểm art (y xuống) → vector local y-lên, tính từ pivot của chính asset đó. */
export function artToLocal(p: V2, pivot: V2): V2 {
  return [p[0] - pivot[0], pivot[1] - p[1]];
}

/** Xoay vector theo độ, dương = ngược chiều kim đồng hồ (y-lên). */
export function rotate(v: V2, deg: number): V2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [clean(v[0] * c - v[1] * s), clean(v[0] * s + v[1] * c)];
}

/** Góc của vector (độ, y-lên, ngược chiều kim đồng hồ từ +x), trong (-180, 180]. */
export function angleOf(v: V2): number {
  return clean((Math.atan2(v[1], v[0]) * 180) / Math.PI);
}

export function length(v: V2): number {
  return Math.hypot(v[0], v[1]);
}

/** Bỏ sai số dấu chấm động cực nhỏ để kết quả tất định và -0 không lọt vào hash. */
function clean(x: number): number {
  const r = Math.round(x * 1e9) / 1e9;
  return r === 0 ? 0 : r;
}
