/**
 * Bao lồi 2D (chuỗi đơn điệu Andrew) — DÙNG CHUNG cho mọi nơi coi một danh sách điểm là hình lồi: kiểm diện tích hull của
 * validator (src/schema/film.ts) và đa giác collider của phép kiểm vật rơi trúng nhân vật (src/physics/hits.ts), khớp với
 * Rapier (ColliderDesc.convexHull dựng bao lồi từ các điểm, không theo thứ tự nhập). Tất định, không phụ thuộc thứ tự
 * nhập; trả đỉnh ngược chiều kim đồng hồ (y-lên), bỏ điểm trong và điểm thẳng hàng trên cạnh.
 */
export function convexHull<P extends readonly [number, number]>(points: readonly P[]): P[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P[]) => {
    const h: P[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(ps), ...half([...ps].reverse())];
}

export function polygonArea(poly: readonly (readonly [number, number])[]): number {
  let a2 = 0;
  for (let k = 0; k < poly.length; k++) { const p = poly[k]!, q = poly[(k + 1) % poly.length]!; a2 += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a2) / 2;
}
