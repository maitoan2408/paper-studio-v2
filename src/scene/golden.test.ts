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
  'm2-handover': '69003dd3ad09a9427172d019e9e8d69bec2e2ed1f23323490cea4cbd7dd85b34',
  'm2-plant': '06799d73a65cc31a5a2061e97af5350b219a03bc4c7147fffad78b3268fc112d',
};

for (const [id, want] of Object.entries(GOLDEN)) {
  test(`golden SceneFrame hash: ${id}`, () => {
    assert.equal(sceneFramesSha256(sampleAll(loadFilm(`examples/films/${id}.json`, 'assets'))), want);
  });
}
