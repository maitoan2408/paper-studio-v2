/**
 * Film — tọa độ thế giới: px tại 1080p, y hướng LÊN, gốc ở giữa sàn; góc độ, dương = ngược chiều kim đồng hồ.
 * Ở M0 chưa bật: characters, timeline, physics (phải rỗng → FILM_FEATURE_NOT_ENABLED).
 */
import { join } from 'node:path';
import { z } from 'zod';
import { fail, parseWith, readJsonFile } from '../core/errors.ts';
import { EASING_NAMES } from '../motion/easing.ts';
import { loadArtPack, type ArtPack, type Asset } from './art-pack.ts';
import { Finite, Id, Semver, Sha256, firstDuplicate } from './common.ts';

export const MAX_FRAMES = 24 * 600;
const Frame = z.number().int().min(0);
const Depth = z.number().finite().min(0).max(1000);
const Ease = z.enum(EASING_NAMES);

const Shadow = z
  .object({ dx: Finite, dy: Finite, blur: z.number().finite().min(0).max(100), opacity: z.number().finite().min(0).max(1) })
  .strict();

const Layer = z
  .object({ id: Id, asset: Id, x: Finite, y: Finite, scale: z.number().finite().positive(), rotation: Finite, depth: Depth, shadow: Shadow.optional() })
  .strict();
const Surface = z.object({ id: Id, y: Finite, x0: Finite, x1: Finite }).strict();
const Prop = z
  .object({
    id: Id, asset: Id, x: Finite, y: Finite, scale: z.number().finite().positive(), rotation: Finite, depth: Depth,
    on: Id.optional(), shadow: Shadow.optional(),
  })
  .strict();
const Character = z
  .object({ id: Id, pack: Id, rig: Id, character: Id, x: Finite, depth: Depth, facing: z.enum(['left', 'right']), on: Id })
  .strict();
const CameraKey = z.object({ frame: Frame, x: Finite, y: Finite, zoom: z.number().finite().positive().max(20), ease: Ease.optional() }).strict();
const TimelineItem = z
  .object({
    character: Id, clip: Id, start: Frame, durationFrames: z.number().int().min(1),
    bind: z.object({ active: z.enum(['l', 'r']).optional(), roles: z.record(Id, Id).optional() }).strict(),
    blendIn: z.number().int().min(0).optional(),
  })
  .strict();

const FilmSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    output: z.object({ width: z.literal(1920), height: z.literal(1080), fps: z.literal(24), durationFrames: z.number().int().min(1).max(MAX_FRAMES) }).strict(),
    packs: z.array(z.object({ id: Id, version: Semver, manifestSha256: Sha256 }).strict()).min(1),
    stage: z.object({ layers: z.array(Layer), surfaces: z.array(Surface) }).strict(),
    props: z.array(Prop),
    characters: z.array(Character),
    camera: z.object({ keys: z.array(CameraKey).min(1) }).strict(),
    timeline: z.array(TimelineItem),
    physics: z.array(z.unknown()),
  })
  .strict();

export type FilmData = z.output<typeof FilmSchema>;
export interface Film {
  data: FilmData;
  /** Asset đã phân giải (id → asset) cho layers và props. */
  assets: ReadonlyMap<string, Asset & { packId: string }>;
}

/** Đọc film và nạp các art pack nó tham chiếu từ `assetsRoot/<packId>`. */
export function loadFilm(file: string, assetsRoot: string): Film {
  const raw = readJsonFile(file);
  const ids = parseWith(z.object({ packs: z.array(z.object({ id: Id }).loose()) }).loose(), raw, 'FILM_SCHEMA', 'film');
  const packs = new Map<string, ArtPack>();
  for (const p of ids.packs) {
    try {
      packs.set(p.id, loadArtPack(join(assetsRoot, p.id)));
    } catch (e) {
      if ((e as { code?: string }).code === 'JSON_FILE_MISSING') fail('FILM_PACK_NOT_FOUND', `film.packs.${p.id}`, `no pack at ${join(assetsRoot, p.id)}`);
      throw e;
    }
  }
  return validateFilm(raw, packs);
}

export function validateFilm(raw: unknown, packs: ReadonlyMap<string, ArtPack>): Film {
  const f = parseWith(FilmSchema, raw, 'FILM_SCHEMA', 'film');
  const N = f.output.durationFrames;

  const dup = firstDuplicate([
    ...f.stage.layers.map((x) => x.id), ...f.stage.surfaces.map((x) => x.id), ...f.props.map((x) => x.id), ...f.characters.map((x) => x.id),
  ]);
  if (dup) fail('FILM_DUP_ID', 'film', `id "${dup}" is used more than once`);
  const dupPack = firstDuplicate(f.packs.map((p) => p.id));
  if (dupPack) fail('FILM_DUP_ID', 'film.packs', `pack "${dupPack}" listed twice`);

  // Pack: đúng version, đúng hash.
  const assets = new Map<string, Asset & { packId: string }>();
  const owner = new Map<string, string[]>();
  for (const ref of f.packs) {
    const p = packs.get(ref.id);
    if (!p) fail('FILM_PACK_NOT_FOUND', `film.packs.${ref.id}`, 'pack not loaded');
    if (p.version !== ref.version) fail('FILM_PACK_NOT_FOUND', `film.packs.${ref.id}`, `film wants ${ref.version}, pack is ${p.version}`);
    if (p.manifestSha256 !== ref.manifestSha256) {
      fail('FILM_PACK_HASH', `film.packs.${ref.id}`, `manifest sha256 is ${p.manifestSha256}, film pins ${ref.manifestSha256}`);
    }
    for (const a of p.assets.values()) owner.set(a.id, [...(owner.get(a.id) ?? []), p.id]);
    for (const a of p.assets.values()) assets.set(a.id, { ...a, packId: p.id });
  }
  const needAsset = (id: string, where: string) => {
    const o = owner.get(id);
    if (!o) fail('FILM_UNKNOWN_REF', where, `asset "${id}" not in any listed pack`);
    if (o.length > 1) fail('FILM_UNKNOWN_REF', where, `asset "${id}" is ambiguous (packs: ${o.join(', ')})`);
  };
  f.stage.layers.forEach((l, i) => needAsset(l.asset, `film.stage.layers[${i}].asset`));
  f.props.forEach((p, i) => needAsset(p.asset, `film.props[${i}].asset`));

  const surfaces = new Map(f.stage.surfaces.map((s) => [s.id, s]));
  f.stage.surfaces.forEach((s, i) => {
    if (!(s.x0 < s.x1)) fail('FILM_SCHEMA', `film.stage.surfaces[${i}]`, `x0 ${s.x0} must be < x1 ${s.x1}`);
  });
  f.props.forEach((p, i) => {
    if (p.on === undefined) return;
    const s = surfaces.get(p.on);
    if (!s) fail('FILM_UNKNOWN_REF', `film.props[${i}].on`, `surface "${p.on}" does not exist`);
    if (p.y !== s.y || p.x < s.x0 || p.x > s.x1) {
      fail('FILM_NOT_ON_SURFACE', `film.props[${i}]`, `pivot (${p.x}, ${p.y}) is not on surface "${s.id}" (y=${s.y}, x∈[${s.x0}, ${s.x1}])`);
    }
  });

  // Camera: key đầu ở frame 0, tăng nghiêm ngặt, trong thời lượng; ease trên mọi key trừ key cuối.
  const keys = f.camera.keys;
  keys.forEach((k, i) => {
    const where = `film.camera.keys[${i}]`;
    if (i === 0 && k.frame !== 0) fail('FILM_FRAME_RANGE', where, 'first camera key must be at frame 0');
    if (i > 0 && !(k.frame > keys[i - 1]!.frame)) fail('FILM_FRAME_RANGE', where, `frame ${k.frame} must be > previous`);
    if (k.frame >= N) fail('FILM_FRAME_RANGE', where, `frame ${k.frame} >= durationFrames ${N}`);
    if (i < keys.length - 1 && k.ease === undefined) fail('FILM_SCHEMA', `${where}.ease`, 'ease is required on every key except the last');
  });

  // Timeline: kiểm thời gian ngay cả khi chưa bật, để lỗi dàn cảnh được báo sớm.
  const byChar = new Map<string, { start: number; end: number; i: number }[]>();
  f.timeline.forEach((t, i) => {
    const end = t.start + t.durationFrames;
    if (end > N) fail('FILM_FRAME_RANGE', `film.timeline[${i}]`, `ends at ${end} > durationFrames ${N}`);
    if ((t.blendIn ?? 0) > t.durationFrames) fail('FILM_FRAME_RANGE', `film.timeline[${i}].blendIn`, 'longer than the clip');
    byChar.set(t.character, [...(byChar.get(t.character) ?? []), { start: t.start, end, i }]);
  });
  for (const list of byChar.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let j = 1; j < list.length; j++) {
      const prev = list[j - 1]!;
      const cur = list[j]!;
      const blend = f.timeline[cur.i]!.blendIn ?? 0;
      if (cur.start < prev.end - blend) fail('FILM_TIMELINE_OVERLAP', `film.timeline[${cur.i}]`, `overlaps timeline[${prev.i}] by more than blendIn ${blend}`);
    }
  }

  for (const k of ['characters', 'timeline', 'physics'] as const) {
    if (f[k].length > 0) fail('FILM_FEATURE_NOT_ENABLED', `film.${k}`, `${k} is not enabled in M0`);
  }
  return { data: f, assets };
}
