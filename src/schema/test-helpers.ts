import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { StudioError } from '../core/errors.ts';
import { sha256Hex } from '../core/hash.ts';

export const code = (c: string) => (e: unknown) => {
  if (!(e instanceof StudioError)) throw e;
  if (e.code !== c) throw new Error(`expected ${c}, got ${e.message}`);
  return true;
};

export const rectSvg = (w: number, h: number, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#c96"/>${extra}</svg>`;

export interface AssetSpec {
  id: string;
  w: number;
  h: number;
  pivot?: [number, number];
  anchors?: Record<string, [number, number]>;
  category?: string;
  svg?: string;
}

/** Dựng một art pack hợp lệ trong thư mục tạm; trả về thư mục và manifest để test sửa rồi ghi lại. */
export function makePack(specs: AssetSpec[], packId = 'test-pack') {
  const dir = mkdtempSync(join(tmpdir(), 'ps-pack-'));
  const manifest = {
    schemaVersion: 1,
    id: packId,
    version: '0.1.0',
    assets: specs.map((s) => {
      const svg = s.svg ?? rectSvg(s.w, s.h);
      const file = `${s.id}.svg`;
      writeFileSync(join(dir, file), svg);
      return {
        id: s.id,
        file,
        width: s.w,
        height: s.h,
        pivot: s.pivot ?? [s.w / 2, s.h],
        anchors: s.anchors ?? {},
        category: s.category ?? 'prop',
        sha256: sha256Hex(svg),
      };
    }),
  };
  const write = () => writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  write();
  return { dir, manifest, write };
}

export function writeFile(dir: string, rel: string, content: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}
