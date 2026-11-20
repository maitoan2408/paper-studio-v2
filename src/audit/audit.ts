/**
 * Audit độc lập sau render (process riêng, phiên trình duyệt mới). Dừng ở kiểm tra sai đầu tiên.
 * 1. Film/pack còn đúng như lúc render (hash).  2. SceneFrame tính lại trùng hash.
 * 3. MP4: sha256, ffprobe (1920x1080, 24/1, yuv420p, h264, số frame), decode toàn bộ (-xerror).
 * 4. Render lại K frame ngẫu nhiên (seed in ra để tái lập) → hash pixel + state trùng manifest.
 * 5. Frame decode từ MP4 so với RGBA render lại: PSNR ≥ ngưỡng trong config/audit.json.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { fail, parseWith, readJsonFile } from '../core/errors.ts';
import { canonicalSha256, sha256Hex } from '../core/hash.ts';
import { Sha256 } from '../schema/common.ts';
import { loadFilm } from '../schema/film.ts';
import { capture } from '../render/browser.ts';
import { checkProbe, decodeAll, extractFrames, psnr } from '../render/ffmpeg.ts';
import { openSession, sampleAll, shuffledPick, stateSha } from '../render/render.ts';
import { compareState, expectedState } from '../render/state.ts';

const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    renderer: z.string(),
    film: z.object({ id: z.string(), path: z.string(), sha256: Sha256 }).strict(),
    packs: z.array(z.object({ id: z.string(), version: z.string(), manifestSha256: Sha256 }).strict()),
    output: z.object({ width: z.number().int(), height: z.number().int(), fps: z.number().int(), frames: z.number().int().positive() }).strict(),
    tools: z.object({ chromium: z.string(), ffmpeg: z.string(), three: z.string() }).strict(),
    sceneFrameSha256: z.array(Sha256),
    drawnStateSha256: z.array(Sha256),
    frameRgbaSha256: z.array(Sha256),
    mp4: z.object({ file: z.string().regex(/^[\w.-]+\.mp4$/), sha256: Sha256 }).strict(),
    rechecks: z.object({ sameSession: z.array(z.number().int()), newSession: z.array(z.number().int()) }).strict(),
    review: z.object({ halfSpeed: z.string(), contactSheet: z.string(), audited: z.literal(false) }).strict(),
  })
  .strict();

const AuditConfig = z.object({ schemaVersion: z.literal(1), sampleFrames: z.number().int().min(2).max(64), minPsnrDb: z.number().positive() }).strict();

export interface AuditReport {
  status: 'PASS_TECHNICAL';
  manifest: string;
  seed: string;
  frames: number[];
  psnrDb: Record<number, number>;
  minPsnrDb: number;
}

export async function auditRender(manifestPath: string, assetsRoot = 'assets', configPath = 'config/audit.json', seed = randomBytes(4).toString('hex')): Promise<AuditReport> {
  const cfg = parseWith(AuditConfig, readJsonFile(configPath), 'AUDIT_CONFIG', configPath);
  const m = parseWith(ManifestSchema, readJsonFile(manifestPath), 'AUDIT_MANIFEST', manifestPath);
  const N = m.output.frames;
  for (const k of ['sceneFrameSha256', 'drawnStateSha256', 'frameRgbaSha256'] as const) {
    if (m[k].length !== N) fail('AUDIT_MANIFEST', `${manifestPath}.${k}`, `${m[k].length} entries for ${N} frames`);
  }

  // 1. Film + pack.
  const film = loadFilm(m.film.path, assetsRoot);
  const filmSha = canonicalSha256(film.data);
  if (filmSha !== m.film.sha256 || film.data.id !== m.film.id) fail('AUDIT_FILM_CHANGED', m.film.path, `sha256 ${filmSha} != rendered ${m.film.sha256}`);
  if (canonicalSha256(film.data.packs) !== canonicalSha256(m.packs)) fail('AUDIT_PACK_CHANGED', m.film.path, 'pack list/hashes differ from render');
  const o = film.data.output;
  if (o.width !== m.output.width || o.height !== m.output.height || o.fps !== m.output.fps || o.durationFrames !== N) {
    fail('AUDIT_MANIFEST', manifestPath, 'output section does not match film');
  }

  // 2. SceneFrame.
  const frames = sampleAll(film);
  frames.forEach((f, i) => {
    if (canonicalSha256(f) !== m.sceneFrameSha256[i]) fail('AUDIT_SCENE_MISMATCH', `frame ${i}`, 'recomputed SceneFrame hash differs');
  });

  // 3. MP4.
  const mp4 = join(dirname(manifestPath), m.mp4.file);
  const mp4Sha = sha256Hex(readFileSync(mp4));
  if (mp4Sha !== m.mp4.sha256) fail('AUDIT_MP4_HASH', mp4, `sha256 ${mp4Sha} != manifest ${m.mp4.sha256}`);
  checkProbe(mp4, { width: o.width, height: o.height, fps: o.fps, frames: N });
  decodeAll(mp4);

  // 4. Render lại ngẫu nhiên trong phiên mới.
  const pick = shuffledPick(N, Math.min(cfg.sampleFrames, N), seed);
  const rerendered = new Map<number, Buffer>();
  const s = await openSession(film, frames);
  try {
    const chromium = await s.browser.version();
    if (chromium !== m.tools.chromium) fail('AUDIT_ENV_MISMATCH', 'chromium', `${chromium} != rendered with ${m.tools.chromium}; pixel hashes are only comparable on the same build`);
    for (const i of pick) {
      const c = await capture(s.page, i);
      compareState(expectedState(frames[i]!), c.state);
      if (stateSha(c.state) !== m.drawnStateSha256[i]) fail('AUDIT_STATE_MISMATCH', `frame ${i}`, 'drawn state hash differs from render');
      const px = sha256Hex(c.rgba);
      if (px !== m.frameRgbaSha256[i]) fail('AUDIT_PIXEL_MISMATCH', `frame ${i}`, `pixel sha ${px} != render ${m.frameRgbaSha256[i]}`);
      rerendered.set(i, c.rgba);
    }
  } finally {
    await s.close();
  }

  // 5. MP4 so với RGBA gốc.
  const decoded = extractFrames(mp4, o.width, o.height, pick);
  const psnrDb: Record<number, number> = {};
  for (const i of pick) {
    const v = psnr(decoded.get(i)!, rerendered.get(i)!);
    psnrDb[i] = Math.round(v * 100) / 100;
    if (!(v >= cfg.minPsnrDb)) fail('AUDIT_PSNR', `frame ${i}`, `${v.toFixed(2)} dB < ${cfg.minPsnrDb} dB`);
  }
  return { status: 'PASS_TECHNICAL', manifest: manifestPath, seed, frames: pick, psnrDb, minPsnrDb: cfg.minPsnrDb };
}
