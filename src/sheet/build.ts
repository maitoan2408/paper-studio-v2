/**
 * Dựng phim cho từng ô sheet — chỉ bằng dữ liệu đã qua validator của engine (không có đường vẽ riêng):
 *  - film: phim mẫu có sẵn, đổi skin theo `reskin`, thêm clip variant tổng hợp suốt phim ở lớp trên cùng;
 *  - pose: phim 1 frame, một nhân vật trên sàn, clip tổng hợp đặt góc khớp tuyệt đối + variant.
 * Pack nạp từ `assets/<id>` hoặc thư mục ghi đè (để render bản "trước" từ gói tham chiếu).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from '../core/errors.ts';
import { loadArtPack, type ArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { validateAction, type ActionClip } from '../schema/action.ts';
import { validateRig, type Rig } from '../schema/rig.ts';
import { activeItems } from '../motion/timeline.ts';
import { sampleFrame, spriteToScreen, type SceneFrame } from '../scene/sample.ts';
import type { SheetPanel } from './spec.ts';

/** Clip tổng hợp của sheet — tên không trùng clip thật (clip thật không có tiền tố "sheet-"). */
export const SHEET_CLIP = 'sheet-pose';
/** Lớp cao nhất schema cho phép (film.timeline.layer ≤ 7); phim mẫu dùng tối đa lớp 1. */
const SHEET_LAYER = 7;

export interface PackSet {
  packs: Map<string, ArtPack>;
  rigs: Map<string, Rig>;
  clips: Map<string, Map<string, ActionClip>>;
}

export function loadPacks(ids: Iterable<string>, overrides: ReadonlyMap<string, string>, assetsRoot = 'assets'): PackSet {
  const out: PackSet = { packs: new Map(), rigs: new Map(), clips: new Map() };
  for (const id of new Set(ids)) {
    const pack = loadArtPack(overrides.get(id) ?? join(assetsRoot, id));
    if (pack.id !== id) fail('SHEET_PACK', `pack ${id}`, `directory holds pack "${pack.id}"`);
    const m = loadPackMotion(pack);
    out.packs.set(id, pack);
    if (m.rig) out.rigs.set(id, m.rig);
    out.clips.set(id, m.clips);
  }
  return out;
}

const packRef = (p: ArtPack) => ({ id: p.id, version: p.version, manifestSha256: p.manifestSha256 });

/** Variant mà skin của nhân vật thực sự có (bản "trước" có thể thiếu) → dùng được / bị bỏ qua. */
export function splitVariants(rig: Rig, character: string, variants: Record<string, string>): { used: Record<string, string>; missing: string[] } {
  const ch = rig.data.characters.find((c) => c.id === character);
  if (!ch) return fail('SHEET_CHARACTER', character, `not in rig ${rig.data.id}`);
  const used: Record<string, string> = {};
  const missing: string[] = [];
  for (const [bone, v] of Object.entries(variants)) {
    if (v === 'default' || ch.skin[bone]?.variants?.[v]) used[bone] = v;
    else missing.push(`${bone}:${v}`);
  }
  return { used, missing };
}

/**
 * validateAction đòi MỌI nhân vật của rig có variant mà clip dùng. Variant mẫu M1a mới có cho một nhân vật (Tam),
 * nên riêng cho sheet: bản rig tạm trong bộ nhớ, nhân vật khác trỏ variant còn thiếu về asset default của CHÍNH họ.
 * Clip sheet chỉ gắn vào nhân vật được chụp, nên alias không bao giờ hiện ra. Engine/validator thật không đổi.
 */
function sheetRig(rig: Rig, pack: ArtPack, character: string, variants: Record<string, string>): Rig {
  const raw = structuredClone(rig.data) as { characters: { id: string; skin: Record<string, { default: string; variants?: Record<string, string> }> }[] };
  for (const c of raw.characters) {
    if (c.id === character) continue;
    for (const [bone, v] of Object.entries(variants)) {
      const skin = c.skin[bone];
      if (!skin || v === 'default' || skin.variants?.[v]) continue;
      skin.variants = { ...(skin.variants ?? {}), [v]: skin.default };
    }
  }
  return validateRig(raw, pack);
}

function sheetClip(rig: Rig, angles: Record<string, number>, variants: Record<string, string>): ActionClip {
  return validateAction(
    {
      schemaVersion: 1,
      id: SHEET_CLIP,
      rig: rig.data.id,
      channels: [
        ...Object.entries(angles).map(([bone, v]) => ({ bone, prop: 'rotation', mode: 'absolute', keys: [{ t: 0, v }] })),
        ...Object.entries(variants).map(([bone, v]) => ({ bone, prop: 'variant', mode: 'absolute', keys: [{ t: 0, v }] })),
      ],
      events: [],
      requires: {},
    },
    rig,
  );
}

export interface BuiltPanel {
  film: Film;
  frame: number;
  /** Nhân vật được chụp (id trong phim). */
  character: string;
  pack: string;
  variants: Record<string, string>;
  missing: string[];
  /** Nguồn cho nhãn: phim + frame hoặc "pose". */
  source: string;
}

export function buildPanel(panel: SheetPanel, overrides: ReadonlyMap<string, string>): BuiltPanel {
  if ('film' in panel.source) {
    const src = panel.source.film;
    const raw = JSON.parse(readFileSync(src.film, 'utf8'));
    const reskin = new Map(Object.entries(src.reskin));
    const packIds: string[] = raw.packs.map((p: { id: string }) => reskin.get(p.id) ?? p.id);
    const set = loadPacks(packIds, overrides);
    raw.packs = packIds.map((id) => packRef(set.packs.get(id)!));
    for (const c of raw.characters) c.pack = reskin.get(c.pack) ?? c.pack;
    const ch = raw.characters.find((c: { id: string }) => c.id === panel.character);
    if (!ch) fail('SHEET_CHARACTER', `${src.film}`, `no character "${panel.character}"`);
    if (src.frame >= raw.output.durationFrames) fail('SHEET_FRAME', src.film, `frame ${src.frame} >= ${raw.output.durationFrames}`);
    const { used, missing } = splitVariants(set.rigs.get(ch.pack)!, ch.character, panel.variants);
    if (Object.keys(used).length > 0) {
      const rig = sheetRig(set.rigs.get(ch.pack)!, set.packs.get(ch.pack)!, ch.character, used);
      set.rigs.set(ch.pack, rig);
      set.clips.get(ch.pack)!.set(SHEET_CLIP, sheetClip(rig, {}, used));
      // Variant áp SUỐT phim (không có frame chuyển): đổi variant thân/hông giữa chừng làm anchor vai/hông nhảy → IK
      // nhảy góc (ACTION_SPEED_EXCEEDED) — chuyển variant mượt là việc của M1b. Validator vì vậy kiểm luôn anchor mới
      // trên toàn bộ động tác M2 (tầm với, giới hạn khớp, tốc độ).
      raw.timeline.push({ character: ch.id, clip: SHEET_CLIP, start: 0, durationFrames: raw.output.durationFrames, bind: {}, layer: SHEET_LAYER });
    }
    const film = validateFilm(raw, set.packs, set.rigs, set.clips);
    return { film, frame: src.frame, character: ch.id, pack: ch.pack, variants: used, missing, source: `${src.film.replace('examples/films/', '')} f${src.frame}` };
  }
  const pose = panel.source.pose;
  const set = loadPacks(['sample-m0', pose.pack], overrides);
  const base = set.rigs.get(pose.pack);
  if (!base) return fail('SHEET_PACK', pose.pack, 'pack has no rig');
  const { used, missing } = splitVariants(base, panel.character, panel.variants);
  const rig = sheetRig(base, set.packs.get(pose.pack)!, panel.character, used);
  set.rigs.set(pose.pack, rig);
  set.clips.get(pose.pack)!.set(SHEET_CLIP, sheetClip(rig, pose.angles, used));
  const raw = {
    schemaVersion: 1,
    id: 'sheet-pose',
    output: { width: 1920, height: 1080, fps: 24, durationFrames: 1 },
    packs: [packRef(set.packs.get('sample-m0')!), packRef(set.packs.get(pose.pack)!)],
    stage: {
      layers: [
        { id: 'sky', asset: 'sky', x: 0, y: -260, scale: 1, rotation: 0, depth: 20 },
        { id: 'ground', asset: 'ground', x: 0, y: 0, scale: 1, rotation: 0, depth: 1 },
      ],
      surfaces: [{ id: 'floor', y: 0, x0: -1300, x1: 1300 }],
    },
    props: [],
    characters: [{ id: panel.character, pack: pose.pack, rig: rig.data.id, character: panel.character, x: 0, scale: pose.scale, depth: 1, facing: pose.facing, on: 'floor' }],
    camera: { keys: [{ frame: 0, x: 0, y: 300, zoom: 1.3 }] },
    timeline: [{ character: panel.character, clip: SHEET_CLIP, start: 0, durationFrames: 1, bind: {}, layer: SHEET_LAYER }],
    walks: [],
    physics: [],
  };
  const film = validateFilm(raw, set.packs, set.rigs, set.clips);
  const ang = Object.entries(pose.angles).map(([b, v]) => `${b} ${v}°`).join(', ');
  return { film, frame: 0, character: panel.character, pack: pose.pack, variants: used, missing, source: `pose${ang ? ` (${ang})` : ' nghỉ'}` };
}

/** Nhãn dưới ô: nhân vật, skin (pack + variant), action đang chạy, nguồn/frame. */
export function panelCaption(b: BuiltPanel): { who: string; skin: string; action: string; source: string } {
  const ci = b.film.data.characters.findIndex((c) => c.id === b.character);
  const c = b.film.data.characters[ci]!;
  const acts = activeItems(b.film, ci, b.frame)
    .filter((a) => a.item.clip !== SHEET_CLIP)
    .map((a) => `${a.item.clip}${a.side ? `.${a.side}` : ''} t=${a.t.toFixed(2)}`);
  const walking = (b.film.data.walks ?? []).some((w) => w.character === c.id && b.frame >= w.start && b.frame < w.start + w.durationFrames);
  const turning = (b.film.data.turns ?? []).some((t) => t.character === c.id && b.frame >= t.start);
  const v = Object.entries(b.variants).map(([k, x]) => `${k}=${x}`);
  return {
    who: `${c.character} (${c.id})`,
    skin: `${b.pack}${v.length ? ` · ${v.join(', ')}` : ' · default'}${b.missing.length ? ` · thiếu: ${b.missing.join(', ')}` : ''}`,
    action: [...acts, ...(walking ? ['walk'] : []), ...(turning && !walking ? [] : [])].join(' + ') || '—',
    source: b.source,
  };
}

export interface DiagMarks {
  pivots: { x: number; y: number }[];
  anchors: { x: number; y: number; name: string }[];
  links: { x0: number; y0: number; x1: number; y1: number }[];
}

/** Pivot, anchor và đoạn nối cha–con của nhân vật trên HÌNH ĐÃ CHIẾU (spriteToScreen), px màn hình. */
export function diagMarks(b: BuiltPanel, sf: SceneFrame): DiagMarks {
  const c = b.film.data.characters.find((x) => x.id === b.character)!;
  const rig = b.film.rigs.get(c.pack)!;
  const pack = b.film.packs.get(c.pack)!;
  const sp = (bone: string) => sf.sprites.find((s) => s.id === `${c.id}/${bone}`);
  const out: DiagMarks = { pivots: [], anchors: [], links: [] };
  for (const bone of rig.order) {
    const s = sp(bone.id);
    if (!s) continue;
    out.pivots.push({ x: s.x, y: s.y });
    const asset = pack.assets.get(s.asset)!;
    for (const [name, a] of Object.entries(asset.anchors)) {
      const [x, y] = spriteToScreen(s, a);
      out.anchors.push({ x, y, name });
    }
    if (bone.parent) {
      const p = sp(bone.parent);
      if (p) out.links.push({ x0: p.x, y0: p.y, x1: s.x, y1: s.y });
    }
  }
  return out;
}

/** Khung bao toàn thân trên hình đã chiếu: 4 góc của mọi sprite xương nhân vật (px màn hình). */
export function bodyBox(b: BuiltPanel, sf: SceneFrame): { x0: number; y0: number; x1: number; y1: number } {
  const pts = sf.sprites
    .filter((s) => s.id.startsWith(`${b.character}/`))
    .flatMap((s) => [[0, 0], [s.width, 0], [0, s.height], [s.width, s.height]].map((c) => spriteToScreen(s, c as [number, number])));
  if (pts.length === 0) return fail('SHEET_VIEW', b.character, 'character has no sprites');
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Tâm vùng cắt: pivot của sprite xương, hoặc tâm khung bao toàn thân. */
export function viewCenter(b: BuiltPanel, sf: SceneFrame, around: string): [number, number] {
  if (around !== 'body') {
    const s = sf.sprites.find((x) => x.id === `${b.character}/${around}`);
    if (!s) return fail('SHEET_VIEW', around, `bone sprite not found for ${b.character}`);
    return [s.x, s.y];
  }
  const k = bodyBox(b, sf);
  return [(k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2];
}

export function sampled(b: BuiltPanel): SceneFrame {
  return sampleFrame(b.film, b.frame);
}
