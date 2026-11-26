/**
 * Film — tọa độ thế giới: px tại 1080p, y hướng LÊN, gốc ở giữa sàn; góc độ, dương = ngược chiều kim đồng hồ.
 * physics (M3 đợt 1): chỉ THẢ TỰ DO (drop) — xem src/physics/drop.ts. Đặt có kiểm soát (bind.place) và trao tay không
 * dùng physics; mọi kết hợp mơ hồ bị từ chối (PHYSICS_CONFLICT, PHYSICS_NOT_FREE…).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { fail, parseWith, readJsonFile, StudioError } from '../core/errors.ts';
import { EASING_NAMES } from '../motion/easing.ts';
import { characterState, contactWorld } from '../motion/character.ts';
import { usesActive } from '../motion/timeline.ts';
import { checkHeldAboveSurface, checkLiftClearance, checkProps, propTimeline } from '../motion/props.ts';
import { validateAction, type ActionClip } from './action.ts';
import { checkPickups, dropBake, disposeWorld } from '../physics/drop.ts';
import { checkFallingProps } from '../physics/hits.ts';
import { AnchorName, loadArtPack, type ArtPack, type Asset } from './art-pack.ts';
import { BoneId, validateRig, type Rig } from './rig.ts';
import { Finite, Id, Semver, Sha256, firstDuplicate } from './common.ts';
import { convexHull, polygonArea } from '../core/hull.ts';

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
/**
 * Thả tự do (M3): mục timeline `release` phải chứa sự kiện release của NGƯỜI CẦM CUỐI CÙNG và không có bind.place.
 * Đơn vị: gravity m/s², pxPerMeter = px thế giới mỗi mét (tỷ lệ của cảnh), density kg/m² (2D), friction/restitution
 * không thứ nguyên (Rapier). Va chạm đợt 1: chỉ mặt đỡ `onto` (khối tĩnh trên [x0, x1], mặt trên tại y của mặt đỡ).
 */
/**
 * Hình va chạm của đạo cụ khi rơi (M3). Mặc định (bỏ trống) = `box`: khung art × scale — giống mọi phim trước đó.
 * `hull`: bao lồi của các điểm trong TỌA ĐỘ ART (px, gốc trên-trái, y xuống — như anchors), × scale của đạo cụ; dùng khi
 * khung art lệch xa hình thật (vd. đèn lồng: đáy hẹp, dây treo phía trên). Rapier tính khối tâm/mô-men từ chính hình này.
 */
const Collider = z.union([
  z.object({ type: z.literal('box') }).strict(),
  z.object({ type: z.literal('hull'), points: z.array(z.tuple([Finite, Finite])).min(3).max(64) }).strict(),
]);
export type ColliderSpec = z.output<typeof Collider>;
/** Diện tích bao lồi của các điểm 2D (bao lồi dùng chung với phép kiểm va chạm — src/core/hull.ts). */
export function convexHullArea(points: readonly (readonly [number, number])[]): number {
  return polygonArea(convexHull(points));
}
const Drop = z
  .object({
    id: Id,
    prop: Id,
    release: z.number().int().min(0),
    onto: Id,
    world: z.object({ gravity: z.number().finite().positive().max(100), pxPerMeter: z.number().finite().positive().max(10000) }).strict(),
    body: z
      .object({
        density: z.number().finite().positive(),
        friction: z.number().finite().min(0).max(2),
        restitution: z.number().finite().min(0).max(1),
        collider: Collider.optional(),
      })
      .strict(),
  })
  .strict();
export type DropSpec = z.output<typeof Drop>;
const Character = z
  .object({ id: Id, pack: Id, rig: Id, character: Id, x: Finite, scale: z.number().finite().positive().max(10), depth: Depth, facing: z.enum(['left', 'right']), on: Id })
  .strict();
const CameraKey = z.object({ frame: Frame, x: Finite, y: Finite, zoom: z.number().finite().positive().max(20), ease: Ease.optional() }).strict();
const TimelineItem = z
  .object({
    character: Id, clip: Id, start: Frame, durationFrames: z.number().int().min(1),
    bind: z
      .object({
        active: z.enum(['l', 'r']).optional(),
        roles: z.record(Id, Id).optional(),
        /** Điểm thế giới cho kênh reach {point}. */
        points: z.record(Id, z.union([z.object({ x: Finite, y: Finite }).strict(), z.object({ use: Id }).strict()])).optional(),
        /** Nơi đặt đạo cụ khi thả mà không còn ai cầm. */
        place: z.object({ surface: Id, x: Finite }).strict().optional(),
      })
      .strict(),
    blendIn: z.number().int().min(0).optional(),
    blendOut: z.number().int().min(0).optional(),
    /** Lớp cộng dồn: chồng clip chỉ bị cấm trong cùng lớp. */
    layer: z.number().int().min(0).max(7).optional(),
    /** Số lần lặp clip trong durationFrames. */
    repeat: z.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Điểm tương tác giải theo neo + ràng buộc (src/motion/interaction.ts). */
const PointSpec = z
  .object({
    anchors: z
      .array(
        z.union([
          z.object({ character: Id, bone: BoneId, anchor: AnchorName, weight: z.number().finite().positive().optional() }).strict(),
          z.object({ prop: Id, anchor: AnchorName, weight: z.number().finite().positive().optional() }).strict(),
        ]),
      )
      .min(1),
    reach: z.array(z.object({ character: Id, contact: AnchorName, bend: z.enum(['rig', 'flip']).optional() }).strict()).min(1),
    clearance: z.array(z.object({ prop: Id, anchor: AnchorName }).strict()).optional(),
    frame: Frame.optional(),
  })
  .strict();

/** Quay tại chỗ: hướng tuyệt đối hoặc về phía nhân vật/đạo cụ (tính tại frame bắt đầu). */
const Turn = z
  .object({
    character: Id,
    start: Frame,
    durationFrames: z.number().int().min(2).optional(),
    face: z.union([z.enum(['left', 'right']), z.object({ character: Id }).strict(), z.object({ prop: Id }).strict()]),
  })
  .strict();

const Walk = z.object({ character: Id, start: Frame, durationFrames: z.number().int().min(2), toX: Finite }).strict();

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
    walks: z.array(Walk),
    turns: z.array(Turn).optional(),
    points: z.record(Id, PointSpec).optional(),
    physics: z.array(Drop),
  })
  .strict();

export type FilmData = z.output<typeof FilmSchema>;
export interface Film {
  data: FilmData;
  /** Asset đã phân giải (id → asset) cho layers và props. */
  assets: ReadonlyMap<string, Asset & { packId: string }>;
  packs: ReadonlyMap<string, ArtPack>;
  /** packId → rig của pack (nếu pack có rig.json). */
  rigs: ReadonlyMap<string, Rig>;
  /** packId → (clipId → clip). */
  clips: ReadonlyMap<string, ReadonlyMap<string, ActionClip>>;
}

/** Nạp rig.json và actions/*.json của một pack (nếu có). */
export function loadPackMotion(pack: ArtPack): { rig?: Rig; clips: Map<string, ActionClip> } {
  const rigFile = join(pack.dir, 'rig.json');
  const actionsDir = join(pack.dir, 'actions');
  const clips = new Map<string, ActionClip>();
  const files = existsSync(actionsDir) ? readdirSync(actionsDir).filter((f) => f.endsWith('.json')).sort() : [];
  if (!existsSync(rigFile)) {
    if (files.length > 0) fail('RIG_SCHEMA', rigFile, 'pack has actions but no rig.json');
    return { clips };
  }
  const rig = validateRig(readJsonFile(rigFile), pack);
  for (const f of files) {
    const clip = validateAction(readJsonFile(join(actionsDir, f)), rig);
    if (`${clip.id}.json` !== f) fail('ACTION_SCHEMA', join(actionsDir, f), `clip id "${clip.id}" must equal file name`);
    clips.set(clip.id, clip);
  }
  return { rig, clips };
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
  const rigs = new Map<string, Rig>();
  const clips = new Map<string, Map<string, ActionClip>>();
  for (const [id, pack] of packs) {
    const m = loadPackMotion(pack);
    if (m.rig) rigs.set(id, m.rig);
    clips.set(id, m.clips);
  }
  return validateFilm(raw, packs, rigs, clips);
}

export function validateFilm(
  raw: unknown,
  packs: ReadonlyMap<string, ArtPack>,
  rigs: ReadonlyMap<string, Rig> = new Map(),
  clips: ReadonlyMap<string, ReadonlyMap<string, ActionClip>> = new Map(),
): Film {
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

  // Nhân vật: pack có trong film, rig + nhân vật tồn tại, đứng trên mặt đỡ có thật.
  f.characters.forEach((c, i) => {
    const where = `film.characters[${i}]`;
    if (!f.packs.some((p) => p.id === c.pack)) fail('FILM_UNKNOWN_REF', `${where}.pack`, `pack "${c.pack}" not listed in film.packs`);
    const rig = rigs.get(c.pack);
    if (!rig || rig.data.id !== c.rig) fail('FILM_UNKNOWN_REF', `${where}.rig`, `rig "${c.rig}" not in pack ${c.pack}`);
    if (!rig.characters.has(c.character)) fail('FILM_UNKNOWN_REF', `${where}.character`, `character "${c.character}" not in rig ${c.rig}`);
    const s = surfaces.get(c.on);
    if (!s) fail('FILM_UNKNOWN_REF', `${where}.on`, `surface "${c.on}" does not exist`);
    if (c.x < s.x0 || c.x > s.x1) fail('FILM_NOT_ON_SURFACE', where, `x=${c.x} outside surface "${s.id}" [${s.x0}, ${s.x1}]`);
  });
  const chars = new Map(f.characters.map((c) => [c.id, c]));
  const props = new Map(f.props.map((p) => [p.id, p]));
  f.timeline.forEach((t, i) => {
    const where = `film.timeline[${i}]`;
    const c = chars.get(t.character);
    if (!c) fail('FILM_UNKNOWN_REF', `${where}.character`, `character "${t.character}" does not exist`);
    const clip = clips.get(c.pack)?.get(t.clip);
    if (!clip) fail('FILM_UNKNOWN_REF', `${where}.clip`, `clip "${t.clip}" not in pack ${c.pack}`);
    if (clip.rig !== c.rig) fail('FILM_UNKNOWN_REF', `${where}.clip`, `clip rig "${clip.rig}" != character rig "${c.rig}"`);
    const needsSide = usesActive(clip);
    if (needsSide && !t.bind.active) fail('ACTION_PRECONDITION', `${where}.bind.active`, `clip "${t.clip}" needs a hand (l|r)`);
    for (const need of clip.requires.props ?? []) {
      const propId = t.bind.roles?.[need.role];
      const p = propId === undefined ? undefined : props.get(propId);
      if (!p) fail('ACTION_PRECONDITION', `${where}.bind.roles.${need.role}`, `clip "${t.clip}" needs a prop for role "${need.role}"`);
      const a = assets.get(p.asset)!;
      for (const anchor of need.anchors) {
        if (!a.anchors[anchor]) fail('ACTION_PRECONDITION', `${where}.bind.roles.${need.role}`, `prop "${p.id}" (${a.id}) lacks anchor "${anchor}"`);
      }
    }
  });

  // Đi bộ: nhân vật có thật, trong thời lượng, không chồng nhau, điểm đến nằm trên mặt đỡ của nhân vật.
  const walkBy = new Map<string, { start: number; end: number; i: number }[]>();
  f.walks.forEach((w, i) => {
    const where = `film.walks[${i}]`;
    const c = chars.get(w.character);
    if (!c) fail('FILM_UNKNOWN_REF', `${where}.character`, `character "${w.character}" does not exist`);
    if (w.start + w.durationFrames > N) fail('FILM_FRAME_RANGE', where, `ends at ${w.start + w.durationFrames} > durationFrames ${N}`);
    const s = surfaces.get(c.on)!;
    if (w.toX < s.x0 || w.toX > s.x1) fail('FILM_NOT_ON_SURFACE', `${where}.toX`, `${w.toX} outside surface "${s.id}" [${s.x0}, ${s.x1}]`);
    walkBy.set(w.character, [...(walkBy.get(w.character) ?? []), { start: w.start, end: w.start + w.durationFrames, i }]);
  });
  // Quay tại chỗ: cùng chuỗi locomotion với đi bộ — không chồng nhau trên cùng nhân vật.
  (f.turns ?? []).forEach((t, k) => {
    const where = `film.turns[${k}]`;
    if (!chars.has(t.character)) fail('FILM_UNKNOWN_REF', `${where}.character`, `character "${t.character}" does not exist`);
    if (typeof t.face === 'object' && ('character' in t.face ? !chars.has(t.face.character) : !props.has(t.face.prop))) {
      fail('FILM_UNKNOWN_REF', `${where}.face`, 'face target does not exist');
    }
    const c = chars.get(t.character)!;
    const dur = t.durationFrames ?? rigs.get(c.pack)?.data.gait?.turnFrames;
    if (dur === undefined) fail('ACTION_PRECONDITION', where, `rig of "${t.character}" has no gait; set durationFrames`);
    if (t.start + dur > N) fail('FILM_FRAME_RANGE', where, `ends at ${t.start + dur} > durationFrames ${N}`);
    walkBy.set(t.character, [...(walkBy.get(t.character) ?? []), { start: t.start, end: t.start + dur, i: 1000 + k }]);
  });
  for (const list of walkBy.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let j = 1; j < list.length; j++) {
      const name = (i: number) => (i >= 1000 ? `turns[${i - 1000}]` : `walks[${i}]`);
      if (list[j]!.start < list[j - 1]!.end) fail('FILM_TIMELINE_OVERLAP', `film.${name(list[j]!.i)}`, `overlaps ${name(list[j - 1]!.i)}`);
    }
  }

  // Điểm tương tác: tham chiếu `use` và đặc tả phải trỏ tới thứ có thật (giải chi tiết khi lấy mẫu).
  const pointIds = new Set(Object.keys(f.points ?? {}));
  f.timeline.forEach((t, i) => {
    for (const [name, p] of Object.entries(t.bind.points ?? {})) {
      if ('use' in p && !pointIds.has(p.use)) fail('FILM_UNKNOWN_REF', `film.timeline[${i}].bind.points.${name}`, `interaction point "${p.use}" is not defined in film.points`);
    }
  });
  for (const [id, sp] of Object.entries(f.points ?? {})) {
    for (const a of sp.anchors) {
      if ('character' in a ? !chars.has(a.character) : !props.has(a.prop)) fail('FILM_UNKNOWN_REF', `film.points.${id}.anchors`, `unknown ${'character' in a ? `character "${a.character}"` : `prop "${a.prop}"`}`);
    }
    for (const r of sp.reach) if (!chars.has(r.character)) fail('FILM_UNKNOWN_REF', `film.points.${id}.reach`, `unknown character "${r.character}"`);
    for (const c of sp.clearance ?? []) if (!props.has(c.prop)) fail('FILM_UNKNOWN_REF', `film.points.${id}.clearance`, `unknown prop "${c.prop}"`);
    if (sp.frame !== undefined && sp.frame >= N) fail('FILM_FRAME_RANGE', `film.points.${id}.frame`, `${sp.frame} >= durationFrames ${N}`);
  }

  // Timeline: kiểm thời gian; chồng clip chỉ bị cấm trong cùng (nhân vật, lớp).
  const byChar = new Map<string, { start: number; end: number; i: number }[]>();
  f.timeline.forEach((t, i) => {
    const end = t.start + t.durationFrames;
    if (end > N) fail('FILM_FRAME_RANGE', `film.timeline[${i}]`, `ends at ${end} > durationFrames ${N}`);
    if ((t.blendIn ?? 0) > t.durationFrames) fail('FILM_FRAME_RANGE', `film.timeline[${i}].blendIn`, 'longer than the clip');
    const key = `${t.character}#${t.layer ?? 0}`;
    byChar.set(key, [...(byChar.get(key) ?? []), { start: t.start, end, i }]);
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

  // Thả tự do: tham chiếu hợp lệ, không trùng, không lẫn với đặt có kiểm soát (phần "người cầm cuối" kiểm trong propTimeline).
  const dropIds = firstDuplicate(f.physics.map((d) => d.id));
  if (dropIds) fail('FILM_DUP_ID', 'film.physics', `drop id "${dropIds}" is used more than once`);
  const dropItems = firstDuplicate(f.physics.map((d) => String(d.release)));
  if (dropItems) fail('PHYSICS_CONFLICT', 'film.physics', `timeline[${dropItems}] is referenced by two drops`);
  // Mọi drop chung MỘT thế giới Rapier (src/physics/drop.ts simulateWorld) ⇒ chung trọng lực và tỷ lệ px/m.
  f.physics.forEach((d, i) => {
    const w0 = f.physics[0]!.world;
    if (d.world.gravity !== w0.gravity || d.world.pxPerMeter !== w0.pxPerMeter) {
      fail('PHYSICS_CONFLICT', `film.physics[${i}].world`, `all drops share one world: gravity ${d.world.gravity} / pxPerMeter ${d.world.pxPerMeter} differ from film.physics[0] (${w0.gravity} / ${w0.pxPerMeter})`);
    }
  });
  f.physics.forEach((d, i) => {
    const where = `film.physics[${i}]`;
    if (!props.has(d.prop)) fail('FILM_UNKNOWN_REF', `${where}.prop`, `prop "${d.prop}" does not exist`);
    if (!surfaces.has(d.onto)) fail('FILM_UNKNOWN_REF', `${where}.onto`, `surface "${d.onto}" does not exist`);
    const it = f.timeline[d.release];
    if (!it) fail('FILM_UNKNOWN_REF', `${where}.release`, `timeline[${d.release}] does not exist`);
    const c = f.characters.find((x) => x.id === it.character)!;
    const clip = clips.get(c.pack)?.get(it.clip);
    if (!clip || !clip.events.some((e) => e.type === 'release')) fail('PHYSICS_NO_RELEASE', `${where}.release`, `timeline[${d.release}] (${it.clip}) has no release event`);
    if (it.bind.place) fail('PHYSICS_CONFLICT', `${where}.release`, `timeline[${d.release}] (${it.clip}) is a controlled place (bind.place); a drop must not set it`);
    const col = d.body.collider;
    if (col?.type === 'hull') {
      const a = assets.get(f.props.find((x) => x.id === d.prop)!.asset)!;
      col.points.forEach(([x, y], k) => {
        if (x < 0 || x > a.width || y < 0 || y > a.height) fail('PHYSICS_COLLIDER', `${where}.body.collider.points[${k}]`, `(${x}, ${y}) is outside the art frame ${a.width}×${a.height} of "${a.id}"`);
      });
      // Bao suy biến (thẳng hàng/trùng điểm) phải bị chặn TẠI ĐÂY: Rapier 0.21 không trả null như tài liệu mà panic trong
      // WASM ("unreachable"). Diện tích bao lồi (chuỗi đơn điệu Andrew) phải ≥ 1 px² art.
      const area = convexHullArea(col.points);
      if (area < 1) fail('PHYSICS_COLLIDER', `${where}.body.collider`, `hull of ${col.points.length} points has area ${area.toFixed(3)} px² (collinear or repeated points)`);
    }
  });

  const film: Film = { data: f, assets, packs, rigs, clips };
  try {
    return checkFilm(film, f, N);
  } catch (e) {
    // Film bị từ chối: thu hồi world vật lý đang mô phỏng dở (nếu có) trước khi ném lỗi.
    disposeWorld(film);
    throw e;
  }
}

/** Các kiểm tra cần film đã dựng (chuyển động, đạo cụ, vật lý) — tách ra để validateFilm thu hồi world khi có lỗi. */
function checkFilm(film: Film, f: Film['data'], N: number): Film {
  propTimeline(film); // phát lại grip/release: HAND_BUSY, PROP_FLOATING, ACTION_EVENT_ORDER… báo sớm
  checkPickups(film); // nhặt lại sau rơi tự do: vật phải đang nằm yên và được đỡ ở frame trước grip (M3 việc 6)
  // Giới hạn khớp + tốc độ xoay (ngưỡng riêng từng xương trong rig): lấy mẫu mọi frame của mọi nhân vật.
  // Lỗi do quá ngắn (WALK_TOO_SHORT, ACTION_SPEED_EXCEEDED) kèm số frame tối thiểu của mục gây lỗi (E3).
  f.characters.forEach((c, ci) => {
    const bad = motionFault(film, ci, 0, N);
    if (!bad) return;
    if (bad.code === 'WALK_TOO_SHORT') {
      const wi = f.walks.findIndex((w) => bad.path === `film.walks(${c.id}@${w.start})`);
      fail(bad.code, bad.path, `${bad.detail}${wi < 0 ? '' : hint(film, ci, 'walks', wi)}`);
    }
    if (bad.code === 'ACTION_SPEED_EXCEEDED') {
      const fr = bad.frame;
      const cands: string[] = [];
      f.walks.forEach((w, i) => { if (w.character === c.id && fr >= w.start && fr <= w.start + w.durationFrames) cands.push(hint(film, ci, 'walks', i)); });
      f.timeline.forEach((t, i) => { if (t.character === c.id && fr >= t.start && fr <= t.start + t.durationFrames) cands.push(hint(film, ci, 'timeline', i)); });
      fail(bad.code, bad.path, `${bad.detail}${cands.filter(Boolean).join(';') || '; no single item can be lengthened to fix this'}`);
    }
    fail(bad.code, bad.path, bad.detail);
  });
  for (let fr = 0; fr < N; fr++) checkHeldAboveSurface(film, fr, (ci, contact) => contactWorld(film, ci, fr, contact));
  checkLiftClearance(film, (ci, contact, f) => contactWorld(film, ci, f, contact));
  checkProps(film, (ci, contact, fr) => contactWorld(film, ci, fr, contact));
  // Thả tự do: bake ngay khi dựng film (fail closed: PHYSICS_NOT_AT_REST, PHYSICS_NO_LANDING, PHYSICS_RELEASE_TOO_EARLY…).
  for (const d of f.physics) dropBake(film, d.id);
  // Vật đang rơi trúng nhân vật (M3 việc 5) — theo collider + quỹ đạo bake và vùng cơ thể theo pose rig.
  checkFallingProps(film);
  return film;
}

interface MotionFault { code: string; path: string; detail: string; frame: number }

/** Lỗi chuyển động đầu tiên của nhân vật trong [from, to): giới hạn khớp, tốc độ xoay, hoặc lỗi dựng (vd. WALK_TOO_SHORT). */
function motionFault(film: Film, ci: number, from: number, to: number): MotionFault | undefined {
  const c = film.data.characters[ci]!;
  const rig = film.rigs.get(c.pack)!;
  let prev: Map<string, number> | undefined;
  for (let fr = Math.max(0, from); fr < to; fr++) {
    let angles: Map<string, number>;
    try {
      angles = characterState(film, ci, fr).angles;
    } catch (e) {
      if (e instanceof StudioError) return { code: e.code, path: e.path, detail: e.detail, frame: fr };
      throw e;
    }
    const at = `film.characters[${ci}](${c.id}) frame ${fr}`;
    for (const b of rig.order) {
      const a = angles.get(b.id)!;
      if (a < b.limits.min - 1e-9 || a > b.limits.max + 1e-9) {
        return { code: 'ACTION_LIMIT_EXCEEDED', path: at, detail: `${b.id} = ${a.toFixed(2)}° outside [${b.limits.min}, ${b.limits.max}]`, frame: fr };
      }
      const d = prev ? Math.abs(a - prev.get(b.id)!) : 0;
      if (d > b.maxDegPerFrame + 1e-9) return { code: 'ACTION_SPEED_EXCEEDED', path: at, detail: `${b.id} turns ${d.toFixed(2)}°/frame > ${b.maxDegPerFrame}`, frame: fr };
    }
    prev = angles;
  }
  return undefined;
}

/**
 * Số frame tối thiểu của một lần đi / một mục timeline để chuyển động của nhân vật trong đoạn đó qua được ràng buộc
 * của gait (số bước, lật hướng) và ngưỡng xương (giới hạn + tốc độ) — các mục khác giữ nguyên. Tìm nhị phân trên chính
 * bộ kiểm (không công thức xấp xỉ); trả '' nếu kéo dài tới max(4×, +10 s) vẫn không đủ (lỗi không do mục này).
 */
function hint(film: Film, ci: number, kind: 'walks' | 'timeline', index: number): string {
  const item = film.data[kind][index]!;
  const cur = item.durationFrames;
  const ok = (D: number) => {
    const data = {
      ...film.data,
      output: { ...film.data.output, durationFrames: Math.max(film.data.output.durationFrames, item.start + D + 2) },
      [kind]: film.data[kind].map((x, i) => (i === index ? { ...x, durationFrames: D } : x)),
    };
    const tmp: Film = { ...film, data };
    try {
      return !motionFault(tmp, ci, item.start - 1, item.start + D + 2);
    } finally {
      disposeWorld(tmp); // film tạm: world (nếu kiểm chuyển động cần pose đạo cụ đã thả) không sống quá phép thử
    }
  };
  let lo = cur;
  let hi = cur;
  do {
    lo = hi;
    hi = Math.ceil(hi * 1.25) + 1;
    if (hi > Math.max(4 * cur, cur + 10 * film.data.output.fps)) return '';
  } while (!ok(hi));
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  const what = kind === 'walks' ? `film.walks[${index}]` : `film.timeline[${index}] (${(item as { clip: string }).clip})`;
  return `; ${what} minimum ${hi} frames (now ${cur}) at gait + bone limits`;
}
