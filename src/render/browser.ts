import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { fail, StudioError } from '../core/errors.ts';
import type { DrawnFrame } from './types.ts';

/** Chromium lấy từ CHROMIUM_PATH; không tự dò đường dẫn khác. */
export function chromiumPath(): string {
  const p = process.env['CHROMIUM_PATH'];
  if (!p) return fail('ENV_CHROMIUM_MISSING', 'CHROMIUM_PATH', 'environment variable is not set');
  if (!existsSync(p)) return fail('ENV_CHROMIUM_MISSING', 'CHROMIUM_PATH', `${p} does not exist`);
  return p;
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: chromiumPath(),
    headless: true,
    // SwiftShader: WebGL bằng CPU → pixel không phụ thuộc GPU. --no-sandbox vì container chạy root;
    // trang chỉ nạp nội dung từ server allowlist 127.0.0.1 (mọi request khác bị chặn).
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars', '--mute-audio'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
}

export interface RenderPage {
  page: Page;
  blocked: string[];
}

/** Mở trang; chỉ cho phép request tới origin của server. */
export async function openPage(browser: Browser, origin: string, viewport: { width: number; height: number }): Promise<RenderPage> {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  const blocked: string[] = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith(origin + '/') || u.startsWith('blob:' + origin + '/')) void req.continue();
    else {
      blocked.push(u);
      void req.abort('blockedbyclient');
    }
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  return { page, blocked };
}

export type Readiness = { ready: true } | { ready: false; error: string | null };

export async function readiness(p: RenderPage): Promise<Readiness> {
  const r = await p.page.evaluate(() => {
    const s = (globalThis as unknown as { studio?: { ready: boolean; error: string | null }; __hf?: unknown }).studio;
    return { ready: s?.ready === true, error: s?.error ?? null, hf: typeof (globalThis as unknown as { __hf?: unknown }).__hf };
  });
  if (r.ready && r.hf !== 'object') fail('RENDER_PROTOCOL', 'window.__hf', 'ready=true but __hf missing');
  if (!r.ready && r.hf !== 'undefined') fail('RENDER_PROTOCOL', 'window.__hf', 'defined before ready');
  return r.ready ? { ready: true } : { ready: false, error: r.error };
}

/** Chờ sẵn sàng hoặc lỗi. Lỗi trang → StudioError với đúng mã trang báo. */
export async function waitReady(p: RenderPage, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const r = await readiness(p);
    if (r.ready) break;
    if (r.error) throw pageError(r.error);
    if (Date.now() - t0 > timeoutMs) fail('RENDER_NOT_READY', 'page', `not ready after ${timeoutMs} ms`);
    await new Promise((res) => setTimeout(res, 50));
  }
  if (p.blocked.length > 0) fail('RENDER_BLOCKED_REQUEST', 'page', `blocked non-allowlisted requests: ${p.blocked.join(', ')}`);
}

export function pageError(message: string): StudioError {
  const m = /^([A-Z][A-Z0-9_]+): ([\s\S]*)$/.exec(message);
  return m ? new StudioError(m[1]!, 'page', m[2]!) : new StudioError('PAGE_ERROR', 'page', message);
}

export async function capture(p: RenderPage, frame: number): Promise<{ state: DrawnFrame; rgba: Buffer }> {
  const r = await p.page.evaluate(async (f) => {
    const hf = (globalThis as unknown as { __hf: { seek(f: number): Promise<{ state: unknown; rgba: string }> } }).__hf;
    return hf.seek(f);
  }, frame);
  if (p.blocked.length > 0) fail('RENDER_BLOCKED_REQUEST', 'page', p.blocked.join(', '));
  return { state: r.state as DrawnFrame, rgba: Buffer.from(r.rgba, 'base64') };
}
