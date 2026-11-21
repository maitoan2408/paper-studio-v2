import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from '../core/errors.ts';
import type { SceneFrame } from '../scene/sample.ts';
import type { Film } from '../schema/film.ts';
import { route, type Route } from './server.ts';
import { shadowBlurArt } from './state.ts';
import type { PageAsset, PageConfig, PageShadow } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const THREE_BUILD = dirname(require.resolve('three'));
export const THREE_VERSION = (JSON.parse(readFileSync(join(THREE_BUILD, '..', 'package.json'), 'utf8')) as { version: string }).version;

/** Px texture trên mỗi px art: đủ nét ở scale lớn nhất của asset trong phim, không vượt 8192 px. */
export const MAX_TEXTURE = 8192;
function rasterFor(width: number, height: number, maxScale: number): number {
  const want = Math.max(1, Math.ceil(maxScale * 2) / 2);
  return Math.min(want, MAX_TEXTURE / Math.max(width, height));
}

/** Code trang: TypeScript của repo, bóc type bằng Node; specifier 'three' → bản vendor được phục vụ. */
function pageScript(): string {
  const ts = readFileSync(join(here, 'page', 'main.ts'), 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'strip' });
  if (/\bimport\s+[^;]*from\s+'(?!three')/.test(js)) fail('RENDER_PAGE', 'page/main.ts', 'only "three" may be imported at runtime');
  return js.replace("from 'three'", "from '/vendor/three.module.js'");
}

export function buildRoutes(film: Film, frames: SceneFrame[], assetTimeoutMs: number): { routes: Map<string, Route>; config: PageConfig } {
  const { width, height } = film.data.output;
  const maxScale = new Map<string, number>();
  const shadowKeys = new Map<string, PageShadow>();
  for (const f of frames) {
    for (const s of f.sprites) {
      maxScale.set(s.assetSha256, Math.max(maxScale.get(s.assetSha256) ?? 0, s.scale));
      if (s.shadow) {
        const blurArt = shadowBlurArt(s);
        shadowKeys.set(`${s.assetSha256}:${blurArt}`, { sha256: s.assetSha256, blurArt });
      }
    }
  }
  const routes = new Map<string, Route>();
  const assets: PageAsset[] = [];
  const bySha = new Map([...film.assets.values()].map((a) => [a.sha256, a]));
  for (const [sha, scale] of [...maxScale].sort(([a], [b]) => a.localeCompare(b))) {
    const a = bySha.get(sha);
    if (!a) fail('RENDER_CONFIG', sha, 'sprite references an asset not in the film');
    const url = `/asset/${sha}.svg`;
    const r = route(readFileSync(a.absPath), 'image/svg+xml');
    if (r.sha256 !== sha) fail('ART_HASH_MISMATCH', a.absPath, `file changed since validation (${r.sha256})`);
    routes.set(url, r);
    assets.push({ sha256: sha, url, width: a.width, height: a.height, pivot: a.pivot, raster: rasterFor(a.width, a.height, scale) });
  }
  const config: PageConfig = {
    width,
    height,
    assetTimeoutMs,
    assets,
    shadows: [...shadowKeys.values()].sort((p, q) => p.sha256.localeCompare(q.sha256) || p.blurArt - q.blurArt),
    frames,
  };
  routes.set('/', route(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style><canvas id="c" width="${width}" height="${height}"></canvas><script type="module" src="/page.js"></script>`, 'text/html; charset=utf-8'));
  routes.set('/page.js', route(pageScript(), 'text/javascript; charset=utf-8'));
  routes.set('/vendor/three.module.js', route(readFileSync(join(THREE_BUILD, 'three.module.js')), 'text/javascript; charset=utf-8'));
  routes.set('/vendor/three.core.js', route(readFileSync(join(THREE_BUILD, 'three.core.js')), 'text/javascript; charset=utf-8'));
  routes.set('/scene.json', route(JSON.stringify(config), 'application/json'));
  return { routes, config };
}
