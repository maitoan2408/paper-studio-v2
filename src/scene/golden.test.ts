/**
 * Mức tất định 1 (PLAN.md §3): hash SceneFrame phải GIỐNG HỆT trên mọi máy.
 * Giá trị golden tính tại chỗ và commit; CI chạy lại trên máy khác. Đổi dữ liệu phim/art/rig/clip
 * hoặc code lấy mẫu → golden đổi; phải cập nhật CÓ CHỦ Ý kèm lý do trong commit, không cập nhật để lấy màu xanh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../schema/film.ts';
import { sampleAll, sceneFramesSha256 } from '../render/render.ts';

const GOLDEN: Record<string, string> = {
  'demo-greeting': 'f271276faff5bf91562cc930f93f1fa47054d1b884a23e2615b8ed2cd997ab9b',
  'm0-static': '3b7409d39b98b66755065448cadb7c929378b97b003beaff0da12fdc5c8edeb9',
  'm2-handover': '8fcb912a95b0e74b51c5f78a900a53caa594d242e518d2f314a83ae4441d4c1e',
  'm2-plant': '791a18777d51cf915723609d38072d170ae41d5a5940a6a6869ad1bf76e98c70',
  // M3 đợt 1: quỹ đạo rơi do Rapier 2D tất định @0.21.0 (đổi phiên bản/bước mô phỏng → đổi golden có chủ ý).
  'm3-drop': 'e773000116dc5df4616dab74307ef64e59f3828e357f189de96cbb96e8016bfe',
  // M3 việc 2: Lan tay trái thả đèn lồng (collider hull) lên mặt bàn — phim mới, không đổi golden cũ.
  'm3-drop-table': 'afb62ed98f49fe8c6465425f2db0f55389f83cfdb273e31820a12d2dc0da8fe2',
};

for (const [id, want] of Object.entries(GOLDEN)) {
  test(`golden SceneFrame hash: ${id}`, () => {
    assert.equal(sceneFramesSha256(sampleAll(loadFilm(`examples/films/${id}.json`, 'assets'))), want);
  });
}
