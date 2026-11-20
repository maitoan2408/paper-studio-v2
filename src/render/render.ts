import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { fail } from '../core/errors.ts';
import { canonicalSha256, sha256Hex } from '../core/hash.ts';
import { sampleFrame, type SceneFrame } from '../scene/sample.ts';
import { loadFilm, type Film } from '../schema/film.ts';
import { capture, launchBrowser, openPage, waitReady, type RenderPage } from './browser.ts';
import { buildRoutes, THREE_VERSION } from './bundle.ts';
import { checkProbe, decodeAll, reviewCopies, startEncoder, toolVersion } from './ffmpeg.ts';
import { startServer, type RunningServer } from './server.ts';
import { compareState, expectedState } from './state.ts';
import type { DrawnFrame } from './types.ts';

export const RENDERER_VERSION = 'paper-studio-renderer/0.1.0';
export const READY_TIMEOUT_MS = 120_000;

export interface RenderManifest {
  schemaVersion: 1;
  renderer: string;
  film: { id: string; path: string; sha256: string };
  packs: { id: string; version: string; manifestSha256: string }[];
  output: { width: number; height: number; fps: number; frames: number };
  tools: { chromium: string; ffmpeg: string; three: string };
  sceneFrameSha256: string[];
  drawnStateSha256: string[];
  frameRgbaSha256: string[];
  mp4: { file: string; sha256: string };
  rechecks: { sameSession: number[]; newSession: number[] };
  review: { halfSpeed: string; contactSheet: string; audited: false };
}

/** -0 → 0 và chuẩn hóa kiểu dữ liệu trình duyệt trả về trước khi băm. */
export const stateSha = (s: DrawnFrame) => canonicalSha256(JSON.parse(JSON.stringify(s)));

/** Hash gộp của mọi SceneFrame — mức tất định 1: phải giống hệt trên mọi máy. */
export function sceneFramesSha256(frames: SceneFrame[]): string {
  return canonicalSha256(frames.map((f) => canonicalSha256(f)));
}

export function sampleAll(film: Film): SceneFrame[] {
  return Array.from({ length: film.data.output.durationFrames }, (_, i) => sampleFrame(film, i));
}

/** Hoán vị tất định từ seed (mulberry32), luôn gồm frame đầu và cuối. */
export function shuffledPick(n: number, k: number, seedHex: string): number[] {
  let a = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const all = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const chosen = new Set([0, n - 1, ...all.filter((i) => i !== 0 && i !== n - 1).slice(0, Math.max(0, k - 2))]);
  return all.filter((i) => chosen.has(i)); // giữ thứ tự đã xáo
}

export interface Session {
  browser: Browser;
  server: RunningServer;
  page: RenderPage;
  close(): Promise<void>;
}

export async function openSession(film: Film, frames: SceneFrame[], assetTimeoutMs = 30_000): Promise<Session> {
  const { routes } = buildRoutes(film, frames, assetTimeoutMs);
  const server = await startServer(routes);
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await openPage(browser, server.origin, film.data.output);
    await waitReady(page, READY_TIMEOUT_MS);
    const b = browser;
    return { browser: b, server, page, close: async () => { await b.close(); await server.close(); } };
  } catch (e) {
    await browser?.close();
    await server.close();
    throw e;
  }
}

/** Chụp lại các frame theo thứ tự cho trước; hash pixel và hash state phải trùng lần đầu. */
export async function recheck(s: Session, order: number[], rgbaSha: string[], drawnSha: string[], label: string): Promise<void> {
  for (const i of order) {
    const c = await capture(s.page, i);
    const ps = sha256Hex(c.rgba);
    const ss = stateSha(c.state);
    if (ps !== rgbaSha[i]) fail('RENDER_NONDETERMINISTIC', `${label} frame ${i}`, `pixel sha ${ps} != first pass ${rgbaSha[i]}`);
    if (ss !== drawnSha[i]) fail('RENDER_NONDETERMINISTIC', `${label} frame ${i}`, `state sha ${ss} != first pass ${drawnSha[i]}`);
  }
}

export async function renderFilm(filmPath: string, assetsRoot: string, outDir: string, recheckCount = 8): Promise<RenderManifest> {
  const film = loadFilm(filmPath, assetsRoot);
  const { width, height, fps, durationFrames: N } = film.data.output;
  const frames = sampleAll(film);
  const filmSha = canonicalSha256(film.data);
  const tools = { chromium: '', ffmpeg: toolVersion('ffmpeg'), three: THREE_VERSION };
  toolVersion('ffprobe');
  mkdirSync(outDir, { recursive: true });
  const mp4 = join(outDir, 'film.mp4');

  const rgbaSha: string[] = [];
  const drawnSha: string[] = [];
  let sameOrder: number[] = [];
  const session = await openSession(film, frames);
  try {
    tools.chromium = await session.browser.version();
    const enc = startEncoder(width, height, fps, mp4);
    for (let i = 0; i < N; i++) {
      const c = await capture(session.page, i);
      compareState(expectedState(frames[i]!), c.state);
      rgbaSha.push(sha256Hex(c.rgba));
      drawnSha.push(stateSha(c.state));
      await enc.write(c.rgba);
      if (i % 24 === 0 || i === N - 1) process.stderr.write(`render ${i + 1}/${N}\n`);
    }
    await enc.finish();
    checkProbe(mp4, { width, height, fps, frames: N });
    decodeAll(mp4);
    sameOrder = shuffledPick(N, Math.min(recheckCount, N), filmSha);
    await recheck(session, sameOrder, rgbaSha, drawnSha, 'same-session');
  } finally {
    await session.close();
  }
  const newOrder = shuffledPick(N, Math.min(recheckCount, N), sha256Hex(filmSha));
  const fresh = await openSession(film, frames);
  try {
    if ((await fresh.browser.version()) !== tools.chromium) fail('RENDER_NONDETERMINISTIC', 'chromium', 'browser version changed between sessions');
    await recheck(fresh, newOrder, rgbaSha, drawnSha, 'new-session');
  } finally {
    await fresh.close();
  }

  reviewCopies(mp4, N, join(outDir, 'film-0.5x.mp4'), join(outDir, 'contact.png'));
  const packs = film.data.packs.map((p) => ({ id: p.id, version: p.version, manifestSha256: p.manifestSha256 }));
  const manifest: RenderManifest = {
    schemaVersion: 1,
    renderer: RENDERER_VERSION,
    film: { id: film.data.id, path: filmPath, sha256: filmSha },
    packs,
    output: { width, height, fps, frames: N },
    tools,
    sceneFrameSha256: frames.map((f) => canonicalSha256(f)),
    drawnStateSha256: drawnSha,
    frameRgbaSha256: rgbaSha,
    mp4: { file: 'film.mp4', sha256: sha256Hex(readFileSync(mp4)) },
    rechecks: { sameSession: sameOrder, newSession: newOrder },
    review: { halfSpeed: 'film-0.5x.mp4', contactSheet: 'contact.png', audited: false },
  };
  writeFileSync(join(outDir, 'render-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
