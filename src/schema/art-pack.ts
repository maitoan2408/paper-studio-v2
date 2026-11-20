import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { fail, parseWith, readJsonFile } from '../core/errors.ts';
import { canonicalSha256, sha256Hex } from '../core/hash.ts';
import { Id, Semver, Sha256, Vec2, firstDuplicate } from './common.ts';
import { checkSvg } from './svg.ts';

export const MAX_SVG_BYTES = 2 * 1024 * 1024;
export const AnchorName = z.string().regex(/^[a-z][a-z0-9-]*(\.[lr])?$/, 'anchor name must match ^[a-z][a-z0-9-]*(\\.[lr])?$');
export const Category = z.enum(['background', 'surface', 'prop', 'body', 'hand', 'head', 'fx']);

const AssetSchema = z
  .object({
    id: Id,
    file: z.string().min(1).max(256),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    pivot: Vec2,
    anchors: z.record(AnchorName, Vec2),
    category: Category,
    sha256: Sha256,
  })
  .strict();

const ManifestSchema = z
  .object({ schemaVersion: z.literal(1), id: Id, version: Semver, assets: z.array(AssetSchema).min(1) })
  .strict();

export type Asset = z.output<typeof AssetSchema> & { absPath: string };
export interface ArtPack {
  id: string;
  version: string;
  dir: string;
  /** SHA-256 của manifest dạng JSON canonical (đã gồm sha256 của từng file art). */
  manifestSha256: string;
  assets: ReadonlyMap<string, Asset>;
}

/** Validate manifest + mọi file art. Lỗi đầu tiên → StudioError, không bỏ qua asset nào. */
export function loadArtPack(dir: string): ArtPack {
  const raw = readJsonFile(join(dir, 'manifest.json'));
  const m = parseWith(ManifestSchema, raw, 'ART_SCHEMA', 'manifest');
  const dup = firstDuplicate(m.assets.map((a) => a.id));
  if (dup) fail('ART_DUPLICATE_ID', `manifest.assets`, `duplicate asset id "${dup}"`);

  const root = realpathSync(dir);
  const assets = new Map<string, Asset>();
  m.assets.forEach((a, i) => {
    const where = `manifest.assets[${i}](${a.id})`;
    const absPath = safeAssetPath(root, a.file, where);
    const bytes = readFileSync(absPath);
    const actual = sha256Hex(bytes);
    if (actual !== a.sha256) fail('ART_HASH_MISMATCH', where, `file ${a.file} has sha256 ${actual}, manifest says ${a.sha256}`);

    const { viewBox } = checkSvg(bytes.toString('utf8'), `${where}.file`);
    const [vx, vy, vw, vh] = viewBox;
    if (vx !== 0 || vy !== 0 || vw !== a.width || vh !== a.height) {
      fail('ART_SIZE_MISMATCH', where, `viewBox "${viewBox.join(' ')}" != "0 0 ${a.width} ${a.height}"`);
    }
    const inBounds = ([x, y]: readonly [number, number]) => x >= 0 && y >= 0 && x <= a.width && y <= a.height;
    if (!inBounds(a.pivot)) fail('ART_ANCHOR_OUT_OF_BOUNDS', `${where}.pivot`, `[${a.pivot}] outside ${a.width}x${a.height}`);
    for (const [name, p] of Object.entries(a.anchors)) {
      if (!inBounds(p)) fail('ART_ANCHOR_OUT_OF_BOUNDS', `${where}.anchors.${name}`, `[${p}] outside ${a.width}x${a.height}`);
    }
    assets.set(a.id, { ...a, absPath });
  });

  return { id: m.id, version: m.version, dir: root, manifestSha256: canonicalSha256(m), assets };
}

function safeAssetPath(root: string, file: string, where: string): string {
  const unsafe = (d: string): never => fail('ART_PATH_UNSAFE', `${where}.file`, `"${file}": ${d}`);
  if (isAbsolute(file) || file.includes('\\') || file.includes('\0')) unsafe('must be a relative POSIX path');
  if (file.split('/').some((p) => p === '..' || p === '.' || p === '')) unsafe('must not contain "..", "." or empty segments');
  if (!file.endsWith('.svg')) unsafe('only .svg files are allowed');
  const abs = join(root, file);
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return fail('ART_FILE_MISSING', `${where}.file`, `"${file}" does not exist`);
  }
  if (!st.isFile()) unsafe('must be a regular file (no symlink/dir)');
  const rel = relative(root, realpathSync(abs));
  if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) unsafe('resolves outside the pack');
  if (st.size > MAX_SVG_BYTES) unsafe(`file is ${st.size} bytes > ${MAX_SVG_BYTES}`);
  return abs;
}
