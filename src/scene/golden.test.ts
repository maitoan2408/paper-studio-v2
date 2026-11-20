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
  'demo-greeting': '42aefe3e4e059b811a9739d16990063bf995c5e9d3b77503bc11e063485f276e',
  'm0-static': 'a6c7aced25fe843ca888caf9cb1d82e7c2a57fd1650f8ea4549fa8157df1bae2',
};

for (const [id, want] of Object.entries(GOLDEN)) {
  test(`golden SceneFrame hash: ${id}`, () => {
    assert.equal(sceneFramesSha256(sampleAll(loadFilm(`examples/films/${id}.json`, 'assets'))), want);
  });
}
