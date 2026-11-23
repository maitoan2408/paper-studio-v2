/**
 * Fixture kiểm thử cho thả tự do: biến thể DỮ LIỆU của examples/films/m3-drop.json (cảnh gốc giữ nguyên làm đối chứng).
 * Mỗi fixture chỉ đổi đúng các trường nêu dưới đây; dùng trong src/physics/drop.test.ts và để render clip kiểm tra:
 *   node src/cli/drop-fixture.ts <tên> <out.json> && npm run render -- <out.json>
 *
 * Bối cảnh số (cảnh gốc, Rapier 0.21): buông ở f160, pivot = giữa đáy chậu (khối 102 × 161.5 px), vx ≈ 79.32 px/s;
 * ở f160 tâm x ≈ −190.07, đáy cao ≈ 105.6 px; chạm sàn y=0 lần đầu trong f165 (bước con 6/8, t = 164.75).
 */
import { readFileSync } from 'node:fs';

type Raw = any; // JSON phim chưa validate — validateFilm kiểm toàn bộ sau khi biến đổi.

const ledge = (d: Raw, s: { id: string; y: number; x0: number; x1: number }) => {
  d.stage.surfaces.push(s);
  d.physics[0].onto = s.id;
};

export const DROP_FIXTURES: Record<string, (d: Raw) => void> = {
  /** Lỗi A: chỉ đổi restitution 0.1 → 0.65 — chậu nảy lên ngay trong frame chạm đầu tiên. */
  'm3-drop-bounce': (d) => {
    d.physics[0].body.restitution = 0.65;
  },
  /** Lỗi B / ca 1: mặt đỡ hữu hạn ngang sàn, mép trái −182.29 — ở f160 tâm chậu còn ngoài mép, bay vào và đáp được. */
  'm3-drop-edge-land': (d) => ledge(d, { id: 'ledge', y: 0, x0: -182.29, x1: 400 }),
  /** Lỗi B / ca 2: mặt đỡ bắt đầu ở −100 — chậu (mép phải tối đa ≈ −109) không bao giờ chạm tới: hụt thật. */
  'm3-drop-edge-miss': (d) => ledge(d, { id: 'ledge', y: 0, x0: -100, x1: 400 }),
  /** Lỗi B / ca 3: mặt đỡ kết thúc ở −190 — chậu chạm, được đỡ vài frame bằng phần đáy chồm lên mép rồi lật/trượt khỏi mép. */
  'm3-drop-edge-slide': (d) => ledge(d, { id: 'ledge', y: 0, x0: -400, x1: -190 }),
  /**
   * Bản NHÌN THẤY ĐƯỢC của ca đáp sát mép (để render clip): bục thấp = art bàn scale 0.25 (mặt trên 246·0.25 = 61.5,
   * rộng 400·0.25 = 100), mép trái −184 — ở f160 tâm chậu (−190.07) còn ngoài mép; chậu đáp với tâm cách mép ≈ 4.6 px.
   * depth 0.999 (thay vì 1) chỉ để bục vẽ TRƯỚC chân Tam (cùng depth thì layer vẽ trước nhân vật và bị che); lệch parallax
   * so với depth 1 ở cảnh này < 0.05 px.
   */
  'm3-drop-edge-stool': (d) => {
    const s = 0.25, x0 = -184;
    d.stage.layers.push({ id: 'stool', asset: 'table', x: x0 + 200 * s, y: 0, scale: s, rotation: 0, depth: 0.999 });
    ledge(d, { id: 'stool-top', y: 246 * s, x0, x1: x0 + 400 * s });
  },
};

export function dropFixture(name: string, base = 'examples/films/m3-drop.json'): Raw {
  const f = DROP_FIXTURES[name];
  if (!f) throw new Error(`unknown drop fixture "${name}" (${Object.keys(DROP_FIXTURES).join(', ')})`);
  const d = JSON.parse(readFileSync(base, 'utf8'));
  f(d);
  d.id = name;
  return d;
}
