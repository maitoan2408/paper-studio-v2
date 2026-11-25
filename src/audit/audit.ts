/**
 * Audit độc lập sau render (process riêng, phiên trình duyệt mới). Dừng ở kiểm tra sai đầu tiên.
 * 1. Film/pack còn đúng như lúc render (hash).  2. SceneFrame tính lại trùng hash.
 * 3. MP4: sha256, ffprobe (1920x1080, 24/1, yuv420p, h264, số frame), decode toàn bộ (-xerror).
 * 4. Render lại K frame ngẫu nhiên (seed in ra để tái lập) → hash pixel + state trùng manifest.
 * 5. Frame decode từ MP4 so với RGBA render lại: PSNR ≥ ngưỡng trong config/audit.json.
 * Vật lý (manifest v2, film có physics — chạy ngay sau bước 1, trước SceneFrame): đọc bake, kiểm SHA, định dạng,
 * engine, cấu hình, nguồn đầu vào; rồi so từng trường với một lượt MÔ PHỎNG LẠI từ film + asset đã xác minh (loadFilm
 * của chính process audit) ⇒ bake bị sửa rồi băm lại vẫn bị bắt (AUDIT_BAKE_MISMATCH + đường dẫn trường lệch đầu tiên).
 * Tương thích: manifest v1 (trước M3 việc 4, không có trường physics) chỉ hợp lệ cho film KHÔNG có physics; film có
 * physics cần manifest v2 có physics.bake — bỏ trường hay hạ về v1 đều bị AUDIT_BAKE_MISSING.
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
import { BAKE_FORMAT, BAKE_FORMAT_VERSION, bakeSha256, currentConfig, filmInputs, firstDifference, physicsBakeRecord, RAPIER_PACKAGE } from '../physics/bake.ts';
import { RAPIER_VERSION } from '../physics/rapier.ts';
import type { Film } from '../schema/film.ts';

const ManifestFields = {
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
};
const BakeRef = z.object({ bake: z.object({ file: z.string().regex(/^[\w.-]+\.json$/), formatVersion: z.number().int(), sha256: Sha256 }).strict() }).strict();
const ManifestSchema = z.discriminatedUnion('schemaVersion', [
  z.object({ schemaVersion: z.literal(1), ...ManifestFields }).strict(),
  z.object({ schemaVersion: z.literal(2), ...ManifestFields, physics: BakeRef.nullable() }).strict(),
]);
type Manifest = z.output<typeof ManifestSchema>;

/** Kiểm bake vật lý (xem đầu file). Trả SHA bake đã xác minh, null nếu film không có physics. */
export function verifyPhysicsBake(manifestPath: string, m: Manifest, film: Film): string | null {
  const hasPhysics = film.data.physics.length > 0;
  const ref = m.schemaVersion === 2 ? m.physics : null;
  if (!hasPhysics) {
    if (ref) fail('AUDIT_MANIFEST', `${manifestPath}.physics`, 'film has no physics but the manifest references a bake');
    return null;
  }
  if (!ref) fail('AUDIT_BAKE_MISSING', `${manifestPath}.physics`, `film "${film.data.id}" has ${film.data.physics.length} drop(s); a schemaVersion 2 manifest with physics.bake is required (manifest v${m.schemaVersion}${m.schemaVersion === 2 ? ' has physics: null' : ''})`);
  const file = join(dirname(manifestPath), ref.bake.file);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return fail('AUDIT_BAKE_FILE', file, 'bake file is missing or unreadable');
  }
  let disk: unknown;
  try {
    disk = JSON.parse(text);
  } catch (e) {
    return fail('AUDIT_BAKE_FILE', file, `not valid JSON (${(e as Error).message})`);
  }
  const sha = bakeSha256(disk);
  if (sha !== ref.bake.sha256) fail('AUDIT_BAKE_HASH', file, `sha256 ${sha} != manifest ${ref.bake.sha256}`);
  // JSON hợp lệ, SHA đúng nhưng gốc không phải object (null, số, chuỗi, mảng) ⇒ sai định dạng, không phải TypeError.
  if (disk === null || typeof disk !== 'object' || Array.isArray(disk)) {
    fail('AUDIT_BAKE_FORMAT', `${file} $`, `bake root must be a JSON object, got ${disk === null ? 'null' : Array.isArray(disk) ? 'an array' : typeof disk}`);
  }
  const r = disk as Record<string, any>;
  if (r.format !== BAKE_FORMAT) fail('AUDIT_BAKE_FORMAT', `${file} $.format`, `${JSON.stringify(r.format)} != ${BAKE_FORMAT}`);
  if (r.formatVersion !== BAKE_FORMAT_VERSION || ref.bake.formatVersion !== BAKE_FORMAT_VERSION) {
    // v1 (trước inputs.motion) không chứng minh được nguồn rig/action ⇒ không chấp nhận; render lại để có bake v2.
    fail('AUDIT_BAKE_FORMAT', `${file} $.formatVersion`, `bake v${r.formatVersion} (manifest v${ref.bake.formatVersion}); expected v${BAKE_FORMAT_VERSION}${r.formatVersion === 1 ? ' — v1 has no motion inputs (rig/action SHA); re-render the film' : ''}`);
  }
  if (r.engine?.package !== RAPIER_PACKAGE || r.engine?.version !== RAPIER_VERSION) fail('AUDIT_BAKE_ENGINE', `${file}.engine`, `${r.engine?.package}@${r.engine?.version} != pinned ${RAPIER_PACKAGE}@${RAPIER_VERSION}`);
  const cfg = firstDifference(currentConfig(film), r.config, '$.config');
  if (cfg) fail('AUDIT_BAKE_CONFIG', `${file} ${cfg.path}`, `bake ${JSON.stringify(cfg.got)} != current ${JSON.stringify(cfg.expected)}`);
  const inp = firstDifference(filmInputs(film), r.inputs, '$.inputs');
  if (inp) fail('AUDIT_BAKE_STALE', `${file} ${inp.path}`, `bake was made from other inputs: ${JSON.stringify(inp.got)} != verified film/assets ${JSON.stringify(inp.expected)}`);
  // Mô phỏng lại: film + asset của chính process này (đã kiểm hash ở bước 1) ⇒ bản ghi mới, so từng trường.
  const fresh = physicsBakeRecord(film)!;
  const diff = firstDifference(fresh, disk);
  if (diff) fail('AUDIT_BAKE_MISMATCH', `${file} ${diff.path}`, `re-simulation gives ${JSON.stringify(diff.expected)}, bake has ${JSON.stringify(diff.got)}`);
  return sha;
}

const AuditConfig = z.object({ schemaVersion: z.literal(1), sampleFrames: z.number().int().min(2).max(64), minPsnrDb: z.number().positive() }).strict();

export interface AuditReport {
  status: 'PASS_TECHNICAL';
  manifest: string;
  seed: string;
  frames: number[];
  psnrDb: Record<number, number>;
  minPsnrDb: number;
  /** SHA bake vật lý đã xác minh bằng mô phỏng lại (null: film không có physics). */
  bakeSha256: string | null;
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

  // 1b. Bake vật lý: SHA + nguồn + mô phỏng lại.
  const bakeSha = verifyPhysicsBake(manifestPath, m, film);

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
  return { status: 'PASS_TECHNICAL', manifest: manifestPath, seed, frames: pick, psnrDb, minPsnrDb: cfg.minPsnrDb, bakeSha256: bakeSha };
}
