/**
 * Trang render (chạy trong Chromium). Code này là của repo; dữ liệu lấy từ /scene.json.
 * Chỉ đặt window.studio.ready = true và định nghĩa window.__hf SAU KHI: mọi texture đã tải,
 * khớp SHA-256, decode xong, upload lên GPU và shader đã warm-up. Lỗi → window.studio.error = "CODE: chi tiết".
 */
import * as THREE from 'three';
import type { DrawnFrame, DrawnSprite, PageAsset, PageConfig, PageShadow } from '../types.ts';
import type { SceneFrame, Sprite } from '../../scene/sample.ts';

interface Hf {
  frameCount: number;
  seek(frame: number): Promise<{ state: DrawnFrame; rgba: string }>;
}
const w = window as unknown as Window & { studio: { ready: boolean; error: string | null }; __hf?: Hf };
w.studio = { ready: false, error: null };

class PageError extends Error {}
const err = (code: string, detail: string) => new PageError(`${code}: ${detail}`);

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchVerified(url: string, sha: string, timeoutMs: number): Promise<ArrayBuffer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let body: ArrayBuffer;
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw err('ASSET_HTTP', `${url} → HTTP ${r.status}`);
    body = await r.arrayBuffer();
  } catch (e) {
    if (e instanceof PageError) throw e;
    if (ctl.signal.aborted) throw err('ASSET_TIMEOUT', `${url} not loaded within ${timeoutMs} ms`);
    throw err('ASSET_HTTP', `${url}: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  const actual = hex(await crypto.subtle.digest('SHA-256', body));
  if (actual !== sha) throw err('ASSET_HASH', `${url} has sha256 ${actual}, expected ${sha}`);
  return body;
}

async function decodeSvg(bytes: ArrayBuffer, a: PageAsset): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      throw err('ASSET_DECODE', `${a.url}: ${String(e)}`);
    }
    if (img.naturalWidth === 0 || img.naturalHeight === 0) throw err('ASSET_DECODE', `${a.url}: zero-size image`);
    const c = document.createElement('canvas');
    c.width = Math.round(a.width * a.raster);
    c.height = Math.round(a.height * a.raster);
    const ctx = c.getContext('2d');
    if (!ctx) throw err('ASSET_DECODE', 'no 2d context');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeTexture(canvas: HTMLCanvasElement, userData: Record<string, unknown>): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false; // hàng 0 của canvas = đỉnh art = y nhỏ trong không gian màn hình y-xuống
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.userData = userData;
  return t;
}

/** Bóng: hình bóng đen của art, blur bằng canvas filter, có viền đệm. */
function makeShadow(src: HTMLCanvasElement, a: PageAsset, s: PageShadow) {
  const blurPx = s.blurArt * a.raster;
  const pad = Math.ceil(blurPx * 3);
  const sil = document.createElement('canvas');
  sil.width = src.width;
  sil.height = src.height;
  const sctx = sil.getContext('2d')!;
  sctx.drawImage(src, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, sil.width, sil.height);
  const c = document.createElement('canvas');
  c.width = src.width + 2 * pad;
  c.height = src.height + 2 * pad;
  const ctx = c.getContext('2d')!;
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  ctx.drawImage(sil, pad, pad);
  const padArt = pad / a.raster;
  const geometry = planeAt(a.width + 2 * padArt, a.height + 2 * padArt, a.pivot[0] + padArt, a.pivot[1] + padArt);
  return { texture: makeTexture(c, { sha256: s.sha256, blurArt: s.blurArt }), geometry };
}

/** Mặt phẳng w×h px art, pivot (px,py) ở gốc tọa độ (không gian y-xuống). */
function planeAt(w: number, h: number, px: number, py: number): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(w, h).translate(w / 2 - px, h / 2 - py, 0) as THREE.PlaneGeometry;
}

async function init(): Promise<void> {
  const cfgRes = await fetch('/scene.json', { cache: 'no-store' });
  if (!cfgRes.ok) throw err('RENDER_CONFIG', `/scene.json → HTTP ${cfgRes.status}`);
  const cfg = (await cfgRes.json()) as PageConfig;

  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cfg.width, cfg.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  // top=0, bottom=H: camera y-xuống, khớp SceneFrame. Lật trục → mặt sau hiện ra, nên dùng DoubleSide.
  const camera = new THREE.OrthographicCamera(0, cfg.width, 0, cfg.height, -1, 1);

  // Tải song song; lỗi đầu tiên thắng.
  const loaded = await Promise.all(
    cfg.assets.map(async (a) => ({ a, canvas: await decodeSvg(await fetchVerified(a.url, a.sha256, cfg.assetTimeoutMs), a) })),
  );
  const tex = new Map<string, { texture: THREE.Texture; geometry: THREE.PlaneGeometry }>();
  const canvases = new Map<string, HTMLCanvasElement>();
  for (const { a, canvas: c } of loaded) {
    tex.set(a.sha256, { texture: makeTexture(c, { sha256: a.sha256 }), geometry: planeAt(a.width, a.height, a.pivot[0], a.pivot[1]) });
    canvases.set(a.sha256, c);
  }
  const assetBySha = new Map(cfg.assets.map((a) => [a.sha256, a]));
  const shadows = new Map<string, { texture: THREE.Texture; geometry: THREE.PlaneGeometry }>();
  for (const s of cfg.shadows) {
    const a = assetBySha.get(s.sha256);
    const c = canvases.get(s.sha256);
    if (!a || !c) throw err('RENDER_CONFIG', `shadow for unknown asset ${s.sha256}`);
    shadows.set(`${s.sha256}:${s.blurArt}`, makeShadow(c, a, s));
  }
  for (const t of [...tex.values(), ...shadows.values()]) renderer.initTexture(t.texture);

  const draw = (f: SceneFrame): THREE.Scene => {
    const scene = new THREE.Scene();
    let order = 0;
    const mesh = (t: { texture: THREE.Texture; geometry: THREE.PlaneGeometry }, s: Sprite, opacity: number, color: number) => {
      const m = new THREE.Mesh(
        t.geometry,
        new THREE.MeshBasicMaterial({ map: t.texture, color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.renderOrder = order++;
      m.rotation.z = (s.rot * Math.PI) / 180;
      m.scale.set(s.flipX ? -s.scale : s.scale, s.scale, 1);
      return m;
    };
    for (const s of f.sprites) {
      const t = tex.get(s.assetSha256);
      if (!t) throw err('RENDER_CONFIG', `frame ${f.frame}: texture ${s.assetSha256} not loaded`);
      const main = mesh(t, s, s.opacity, 0xffffff);
      main.position.set(s.x, s.y, 0);
      main.userData = { id: s.id };
      if (s.shadow) {
        const blurArt = Math.round(s.shadow.blur / s.scale);
        const st = shadows.get(`${s.assetSha256}:${blurArt}`);
        if (!st) throw err('RENDER_CONFIG', `frame ${f.frame}: shadow ${s.assetSha256}:${blurArt} not prepared`);
        const sh = mesh(st, s, s.shadow.opacity, 0x000000);
        sh.position.set(s.x + s.shadow.dx, s.y + s.shadow.dy, 0);
        main.userData.shadow = sh;
        scene.add(sh);
      }
      scene.add(main);
    }
    return scene;
  };

  /** Đọc state từ chính các đối tượng Three.js đã vẽ. */
  const readBack = (frame: number, scene: THREE.Scene): DrawnFrame => {
    const sprites: DrawnSprite[] = [];
    const meshes = (scene.children as THREE.Mesh[]).filter((m) => m.userData.id !== undefined).sort((p, q) => p.renderOrder - q.renderOrder);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const sh = m.userData.shadow as THREE.Mesh | undefined;
      const shMat = sh?.material as THREE.MeshBasicMaterial | undefined;
      sprites.push({
        id: m.userData.id as string,
        sha256: mat.map!.userData.sha256 as string,
        x: m.position.x,
        y: m.position.y,
        rot: (m.rotation.z * 180) / Math.PI,
        scale: Math.abs(m.scale.y),
        flipX: m.scale.x < 0,
        opacity: mat.opacity,
        shadow:
          sh && shMat
            ? { dx: sh.position.x - m.position.x, dy: sh.position.y - m.position.y, blurArt: shMat.map!.userData.blurArt as number, opacity: shMat.opacity }
            : null,
      });
    }
    return { frame, sprites };
  };

  const gl = renderer.getContext();
  const pixels = new Uint8Array(cfg.width * cfg.height * 4);
  const flipped = new Uint8Array(pixels.length);
  const render = (frame: number) => {
    const f = cfg.frames[frame];
    if (!f || f.frame !== frame) throw err('RENDER_SEEK', `frame ${frame} not in 0..${cfg.frames.length - 1}`);
    const scene = draw(f);
    renderer.render(scene, camera);
    const state = readBack(frame, scene);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
    return state;
  };

  // Warm-up: biên dịch shader và vẽ thử frame 0 trước khi báo sẵn sàng.
  const warm = draw(cfg.frames[0]!);
  renderer.compile(warm, camera);
  renderer.render(warm, camera);

  w.__hf = {
    frameCount: cfg.frames.length,
    async seek(frame: number) {
      const state = render(frame);
      gl.readPixels(0, 0, cfg.width, cfg.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const row = cfg.width * 4;
      for (let y = 0; y < cfg.height; y++) flipped.set(pixels.subarray((cfg.height - 1 - y) * row, (cfg.height - y) * row), y * row);
      return { state, rgba: toBase64(flipped) };
    },
  };
  w.studio.ready = true;
}

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (native) return native.call(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.addEventListener('error', (e) => {
  if (!w.studio.ready && !w.studio.error) w.studio.error = `PAGE_ERROR: ${e.message}`;
});
init().catch((e: unknown) => {
  w.studio.error = e instanceof PageError ? e.message : `PAGE_ERROR: ${String(e)}`;
});
