/**
 * Tự kiểm renderer (viết mới; đối chiếu repo cũ khi có quyền):
 * 6 ca texture — none (phải sẵn sàng), slow (CHƯA sẵn sàng khi đang tải, sau đó sẵn sàng),
 * 404 → ASSET_HTTP, hash sai → ASSET_HASH, file hỏng → ASSET_DECODE, quá hạn → ASSET_TIMEOUT
 * (4 ca lỗi không bao giờ sẵn sàng); và tua theo mọi thứ tự cho cùng hash pixel + state.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { sha256Hex } from '../core/hash.ts';
import { loadArtPack } from '../schema/art-pack.ts';
import { validateFilm, type Film } from '../schema/film.ts';
import { capture, launchBrowser, openPage, readiness, waitReady, type RenderPage } from './browser.ts';
import { buildRoutes } from './bundle.ts';
import { sampleAll, shuffledPick, stateSha } from './render.ts';
import { startServer, type Faults } from './server.ts';
import { compareState, expectedState } from './state.ts';

export interface CaseResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

const GOOD = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="${c}"/><circle cx="100" cy="60" r="40" fill="#fff"/></svg>`;
/** Hợp lệ với bộ kiểm SVG phía Node (không kiểm cấu trúc XML) nhưng XML hỏng → trình duyệt không decode được. */
const BROKEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><g><rect width="200" height="120" fill="#c00"/></svg>';

function fixture(): { film: (asset: string) => Film } {
  const root = mkdtempSync(join(tmpdir(), 'ps-check-'));
  const dir = join(root, 'check-pack');
  mkdirSync(dir);
  const files = { good: GOOD('#2a6'), other: GOOD('#36c'), broken: BROKEN };
  const assets = Object.entries(files).map(([id, svg]) => {
    writeFileSync(join(dir, `${id}.svg`), svg);
    return { id, file: `${id}.svg`, width: 200, height: 120, pivot: [100, 120], anchors: {}, category: 'prop', sha256: sha256Hex(svg) };
  });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'check-pack', version: '0.0.1', assets }));
  const pack = loadArtPack(dir);
  return {
    film: (asset) =>
      validateFilm(
        {
          schemaVersion: 1,
          id: 'check',
          output: { width: 1920, height: 1080, fps: 24, durationFrames: 12 },
          packs: [{ id: 'check-pack', version: '0.0.1', manifestSha256: pack.manifestSha256 }],
          stage: { layers: [{ id: 'bg', asset: 'other', x: 0, y: 0, scale: 12, rotation: 0, depth: 3 }], surfaces: [] },
          props: [{ id: 'p', asset, x: -300, y: 100, scale: 2, rotation: 10, depth: 0, shadow: { dx: 8, dy: -8, blur: 6, opacity: 0.4 } }],
          characters: [],
          camera: { keys: [{ frame: 0, x: 0, y: 300, zoom: 1, ease: 'linear' }, { frame: 11, x: 400, y: 340, zoom: 1.3 }] },
          timeline: [],
          walks: [],
          physics: [],
        },
        new Map([['check-pack', pack]]),
      ),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withPage<T>(browser: Browser, film: Film, faults: (assetUrl: string) => Faults, timeoutMs: number, fn: (p: RenderPage) => Promise<T>): Promise<T> {
  const frames = sampleAll(film);
  const { routes, config } = buildRoutes(film, frames, timeoutMs);
  const target = config.assets.find((a) => a.sha256 === film.assets.get(film.data.props[0]!.asset)!.sha256)!.url;
  const server = await startServer(routes, faults(target));
  const page = await openPage(browser, server.origin, film.data.output);
  try {
    return await fn(page);
  } finally {
    await page.page.close();
    await server.close();
  }
}

/** Chờ tới khi có lỗi; trong suốt thời gian đó và sau đó không bao giờ được sẵn sàng. */
async function expectError(p: RenderPage, code: string, withinMs: number): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const r = await readiness(p);
    if (r.ready) throw new Error(`became ready; expected ${code}`);
    if (r.error) {
      if (!r.error.startsWith(`${code}: `)) throw new Error(`error "${r.error}", expected ${code}`);
      await sleep(500);
      if ((await readiness(p)).ready) throw new Error('became ready after error');
      return r.error;
    }
    if (Date.now() - t0 > withinMs) throw new Error(`no error after ${withinMs} ms`);
    await sleep(50);
  }
}

export async function checkRenderer(): Promise<CaseResult[]> {
  const fx = fixture();
  const good = fx.film('good');
  const results: CaseResult[] = [];
  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push({ name, status: 'PASS', detail: await fn() });
    } catch (e) {
      results.push({ name, status: 'FAIL', detail: e instanceof Error ? e.message : String(e) });
    }
    console.log(`${results.at(-1)!.status} ${name}: ${results.at(-1)!.detail}`);
  };

  const ref: { px: string; st: string }[] = [];
  const browser = await launchBrowser();
  try {
    await run('texture:none', () =>
      withPage(browser, good, () => ({}), 10_000, async (p) => {
        await waitReady(p, 30_000);
        return 'ready';
      }),
    );
    await run('texture:slow', () =>
      withPage(browser, good, (u) => ({ delayMs: new Map([[u, 2500]]) }), 15_000, async (p) => {
        const t0 = Date.now();
        await sleep(800);
        const mid = await readiness(p);
        if (mid.ready || mid.error) throw new Error(`while loading: ready=${mid.ready} error=${mid.ready ? '' : mid.error}`);
        await waitReady(p, 30_000);
        const ms = Date.now() - t0;
        if (ms < 2400) throw new Error(`ready after ${ms} ms, before the slow texture arrived`);
        return `not ready at 800 ms, ready after ${ms} ms`;
      }),
    );
    await run('texture:404', () => withPage(browser, good, (u) => ({ notFound: new Set([u]) }), 10_000, (p) => expectError(p, 'ASSET_HTTP', 20_000)));
    await run('texture:hash', () => withPage(browser, good, (u) => ({ tamper: new Set([u]) }), 10_000, (p) => expectError(p, 'ASSET_HASH', 20_000)));
    await run('texture:decode', () => withPage(browser, fx.film('broken'), () => ({}), 10_000, (p) => expectError(p, 'ASSET_DECODE', 20_000)));
    await run('texture:timeout', () =>
      withPage(browser, good, (u) => ({ delayMs: new Map([[u, 5000]]) }), 800, (p) => expectError(p, 'ASSET_TIMEOUT', 20_000)),
    );

    await run('seek:all-orders', () =>
      withPage(browser, good, () => ({}), 10_000, async (p) => {
        await waitReady(p, 30_000);
        const frames = sampleAll(good);
        const n = frames.length;
        ref.length = 0;
        for (let i = 0; i < n; i++) {
          const c = await capture(p, i);
          compareState(expectedState(frames[i]!), c.state);
          ref.push({ px: sha256Hex(c.rgba), st: stateSha(c.state) });
        }
        if (new Set(ref.map((r) => r.px)).size < n) throw new Error('frames are not all distinct; seek test would be vacuous');
        const orders: Record<string, number[]> = {
          reverse: [...Array(n).keys()].reverse(),
          shuffled: shuffledPick(n, n, 'c0ffee00'),
          repeat: [5, 5, 0, 11, 0, 5],
        };
        for (const [label, order] of Object.entries(orders)) {
          for (const i of order) {
            const c = await capture(p, i);
            if (sha256Hex(c.rgba) !== ref[i]!.px || stateSha(c.state) !== ref[i]!.st) throw new Error(`${label}: frame ${i} differs from forward pass`);
          }
        }
        return `${n} frames identical across forward/reverse/shuffled/repeat`;
      }),
    );
  } finally {
    await browser.close();
  }

  await run('seek:new-session', async () => {
    if (ref.length === 0) throw new Error('no reference from seek:all-orders');
    const fresh = await launchBrowser();
    try {
      return await withPage(fresh, good, () => ({}), 10_000, async (p) => {
        await waitReady(p, 30_000);
        const order = shuffledPick(ref.length, ref.length, '5eed5eed');
        for (const i of order) {
          const c = await capture(p, i);
          if (sha256Hex(c.rgba) !== ref[i]!.px || stateSha(c.state) !== ref[i]!.st) throw new Error(`frame ${i} differs in a new browser session`);
        }
        return `${order.length} frames (shuffled) identical in a new browser session`;
      });
    } finally {
      await fresh.close();
    }
  });
  return results;
}
