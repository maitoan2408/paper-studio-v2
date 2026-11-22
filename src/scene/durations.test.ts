/**
 * Thời lượng phim mẫu M2 theo PLAN.md §6 M2: phim chính 15–20 giây, phim ngắn dàn cảnh khác 8–10 giây.
 * Kiểm trên dữ liệu phim (durationFrames / fps) — MP4 thật được ffprobe kiểm trong audit (khớp số frame + fps).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFilm } from '../schema/film.ts';

const RANGES: Record<string, [number, number]> = {
  'm2-handover': [15, 20], // phim chính
  'm2-plant': [8, 10], // phim ngắn
};

for (const [id, [lo, hi]] of Object.entries(RANGES)) {
  test(`${id} lasts ${lo}–${hi} s (PLAN §6 M2)`, () => {
    const { durationFrames, fps } = loadFilm(`examples/films/${id}.json`, 'assets').data.output;
    const s = durationFrames / fps;
    assert.ok(s >= lo && s <= hi, `${id}: ${durationFrames} frames @ ${fps} fps = ${s.toFixed(2)} s, need ${lo}–${hi} s`);
  });
}
