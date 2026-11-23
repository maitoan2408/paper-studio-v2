/**
 * Render sheet: mỗi ô = một frame render bằng ĐÚNG renderer của phim (openSession/capture), cắt quanh vùng cần xem,
 * ghép thành trang bằng Chromium (HTML do code này sinh, chữ đã escape — không chạy nội dung bên ngoài).
 * Xuất bản sạch (duyệt hình) và bản chẩn đoán (pivot, anchor, đoạn nối cha–con trên hình đã chiếu).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalSha256, sha256Hex } from '../core/hash.ts';
import { capture, launchBrowser } from '../render/browser.ts';
import { openSession } from '../render/render.ts';
import { buildPanel, diagMarks, panelCaption, sampled, viewCenter, type DiagMarks } from './build.ts';
import { cropRgba, encodePng } from './png.ts';
import type { SheetPanel, SheetSpec } from './spec.ts';

export interface Edition {
  /** Nhãn hiển thị, vd "trước — gói v2 @2e8e7b4". */
  label: string;
  /** packId → thư mục pack thay cho assets/<id>. */
  overrides: ReadonlyMap<string, string>;
}

interface Shot {
  png: Buffer;
  w: number;
  h: number;
  marks: DiagMarks;
  caption: ReturnType<typeof panelCaption>;
  sceneFrameSha256: string;
}

async function shoot(panel: SheetPanel, ed: Edition): Promise<Shot> {
  const b = buildPanel(panel, ed.overrides);
  const sf = sampled(b);
  const { width: W, height: H } = b.film.data.output;
  const s = await openSession(b.film, [{ ...sf, frame: 0 }]);
  let rgba: Buffer;
  try {
    rgba = (await capture(s.page, 0)).rgba;
  } finally {
    await s.close();
  }
  const [cx, cy] = viewCenter(b, sf, panel.view.around);
  const [w, h] = panel.view.size;
  const x0 = Math.round(cx + panel.view.offset[0] - w / 2);
  const y0 = Math.round(cy + panel.view.offset[1] - h / 2);
  const m = diagMarks(b, sf);
  const shift = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x - x0, y: p.y - y0 });
  return {
    png: encodePng(w, h, cropRgba(rgba, W, H, x0, y0, w, h)),
    w,
    h,
    marks: {
      pivots: m.pivots.map(shift),
      anchors: m.anchors.map(shift),
      links: m.links.map((l) => ({ x0: l.x0 - x0, y0: l.y0 - y0, x1: l.x1 - x0, y1: l.y1 - y0 })),
    },
    caption: panelCaption(b),
    sceneFrameSha256: canonicalSha256(sf),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function figure(shot: Shot, zoom: number, diag: boolean, head?: string): string {
  const W = Math.round(shot.w * zoom), H = Math.round(shot.h * zoom);
  const z = (v: number) => (v * zoom).toFixed(1);
  const overlay = diag
    ? `<svg class="ov" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      shot.marks.links.map((l) => `<line x1="${z(l.x0)}" y1="${z(l.y0)}" x2="${z(l.x1)}" y2="${z(l.y1)}" stroke="#ffd23f" stroke-width="2"/>`).join('') +
      shot.marks.anchors.map((a) => `<circle cx="${z(a.x)}" cy="${z(a.y)}" r="5" fill="none" stroke="#19d3c5" stroke-width="2"><title>${esc(a.name)}</title></circle>`).join('') +
      shot.marks.pivots.map((p) => `<circle cx="${z(p.x)}" cy="${z(p.y)}" r="4" fill="#fff" stroke="#222" stroke-width="1.5"/>`).join('') +
      `</svg>`
    : '';
  return `<div class="shot">${head ? `<div class="ed">${esc(head)}</div>` : ''}<div class="img" style="width:${W}px;height:${H}px"><img src="data:image/png;base64,${shot.png.toString('base64')}" width="${W}" height="${H}">${overlay}</div></div>`;
}

function caption(panel: SheetPanel, c: Shot['caption']): string {
  return `<figcaption><b>${esc(panel.label)}</b><br>${esc(c.who)} · skin ${esc(c.skin)}<br>action: ${esc(c.action)} · ${esc(c.source)}${panel.note ? `<br><i>${esc(panel.note)}</i>` : ''}</figcaption>`;
}

function page(spec: SheetSpec, cells: string[], subtitle: string, cellW: number): string {
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f3eee4;font:14px/1.35 "DejaVu Sans",sans-serif;color:#222}
h1{font-size:20px;margin:14px 16px 2px} .sub{margin:0 16px 10px;color:#555}
.grid{display:grid;grid-template-columns:repeat(${spec.columns},${cellW}px);gap:14px;padding:0 16px 16px}
figure{margin:0;background:#fff;border:1px solid #d8cfbf;padding:8px} .pair{display:flex;gap:8px}
.img{position:relative;overflow:hidden;background:#000} .img img{display:block} .ov{position:absolute;left:0;top:0}
.ed{font-weight:bold;font-size:13px;margin-bottom:4px} figcaption{margin-top:6px;font-size:12.5px}
</style><h1>${esc(spec.title)}</h1><div class="sub">${esc(subtitle)}</div><div class="grid">${cells.join('')}</div>`;
}

async function screenshot(html: string, width: number): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const p = await browser.newPage();
    await p.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await p.setJavaScriptEnabled(false);
    await p.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await p.screenshot({ fullPage: true, type: 'png' }));
  } finally {
    await browser.close();
  }
}

export interface SheetResult {
  files: string[];
  manifest: unknown;
}

/** Render sheet. Một edition → lưới ô; hai edition (trước, sau) → mỗi ô là cặp ảnh cùng camera/frame. */
export async function renderSheet(spec: SheetSpec, editions: Edition[], outDir: string, specSha256: string): Promise<SheetResult> {
  mkdirSync(join(outDir, 'panels'), { recursive: true });
  const shots: Shot[][] = [];
  for (const [i, panel] of spec.panels.entries()) {
    const row: Shot[] = [];
    for (const [k, ed] of editions.entries()) {
      const s = await shoot(panel, ed);
      writeFileSync(join(outDir, 'panels', `${String(i + 1).padStart(2, '0')}${editions.length > 1 ? `-${k === 0 ? 'truoc' : 'sau'}` : ''}.png`), s.png);
      row.push(s);
    }
    shots.push(row);
  }
  const files: string[] = [];
  const maxW = Math.max(...spec.panels.map((p, i) => editions.length * Math.round(shots[i]![0]!.w * p.view.zoom) + (editions.length - 1) * 8));
  const cellW = maxW + 18;
  const sub = editions.length > 1 ? `Mỗi ô: ${editions.map((e) => e.label).join(' | ')} — cùng phim, frame, camera, vùng cắt.` : `Skin: ${editions[0]!.label}.`;
  for (const diag of [false, true]) {
    const cells = spec.panels.map((p, i) => {
      const imgs = shots[i]!.map((s, k) => figure(s, p.view.zoom, diag, editions.length > 1 ? editions[k]!.label : undefined)).join('');
      return `<figure><div class="pair">${imgs}</div>${caption(p, shots[i]![shots[i]!.length - 1]!.caption)}</figure>`;
    });
    const legend = diag ? ' Chẩn đoán: chấm trắng = pivot xương, vòng xanh ngọc = anchor (khớp/contact/carry), đường vàng = nối pivot cha–con; tính trên hình đã chiếu.' : '';
    const png = await screenshot(page(spec, cells, sub + legend, cellW), 32 + spec.columns * cellW + (spec.columns - 1) * 14);
    const f = join(outDir, diag ? 'sheet-chan-doan.png' : 'sheet.png');
    writeFileSync(f, png);
    files.push(f);
  }
  const manifest = {
    sheet: spec.id,
    specSha256,
    editions: editions.map((e) => ({ label: e.label, overrides: Object.fromEntries(e.overrides) })),
    panels: spec.panels.map((p, i) => ({
      label: p.label,
      shots: shots[i]!.map((s, k) => ({ edition: editions[k]!.label, caption: s.caption, sceneFrameSha256: s.sceneFrameSha256, pngSha256: sha256Hex(s.png) })),
    })),
  };
  writeFileSync(join(outDir, 'sheet.json'), JSON.stringify(manifest, null, 2) + '\n');
  files.push(join(outDir, 'sheet.json'));
  return { files, manifest };
}
