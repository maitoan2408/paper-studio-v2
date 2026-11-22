/**
 * Lật hướng (M2/E4: `turns` tại chỗ và `walks` đổi chiều dùng chung một cơ chế).
 *
 * Kiểm trên SceneFrame — đúng phép biến đổi sprite mà renderer vẽ (`spriteToScreen`), không trên số liệu nội bộ:
 *  1. Không mất hình: mọi sprite của nhân vật có bề ngang > 0 ở mọi frame lật; frame mỏng nhất không mỏng hơn
 *     hình cách điểm đổi mặt nửa frame (điểm đổi mặt rơi GIỮA hai frame, không bao giờ được lấy mẫu).
 *  2. Phép chiếu nhất quán: pivot xương con nằm đúng anchor khớp trên hình đã chiếu của xương cha; đạo cụ đang
 *     cầm có anchor nắm trùng anchor grip trên hình đã chiếu của bàn tay; contact (sole, grip) của motion trùng
 *     anchor trên hình đã chiếu.
 * Ma trận: thời lượng lật chẵn/lẻ × 2 hướng × 2 nhân vật × turn/walk đổi chiều × có/không cầm đồ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadArtPack, type ArtPack } from '../schema/art-pack.ts';
import { loadPackMotion, validateFilm, type Film } from '../schema/film.ts';
import { validateRig } from '../schema/rig.ts';
import { ease } from '../motion/easing.ts';
import { characterState, contactWorld } from '../motion/character.ts';
import { segmentAt } from '../motion/props.ts';
import { sampleFrame, spriteToScreen, type SceneFrame, type Sprite } from './sample.ts';

const packs = new Map(['sample-m0', 'demo-cast'].map((x) => [x, loadArtPack(`assets/${x}`)]));
const cast: ArtPack = packs.get('demo-cast')!;
const motion = loadPackMotion(cast);
const rigRaw = JSON.parse(readFileSync('assets/demo-cast/rig.json', 'utf8'));
/** Rig gốc, hoặc bản sao chỉ khác gait.turnFrames (để thử walk đổi chiều với thời lượng lật lẻ). */
const rigWith = (turnFrames?: number) =>
  turnFrames === undefined ? motion.rig! : validateRig({ ...rigRaw, gait: { ...rigRaw.gait, turnFrames } }, cast);
const build = (data: unknown, turnFrames?: number): Film =>
  validateFilm(data, packs, new Map([['demo-cast', rigWith(turnFrames)]]), new Map([['demo-cast', motion.clips], ['sample-m0', new Map()]]));
const raw = (id: string) => JSON.parse(readFileSync(`examples/films/${id}.json`, 'utf8'));

/** Gương toàn cảnh qua x = 0: mọi hướng nhìn và hướng đi đảo chiều, hình học giữ nguyên. */
function mirror(f: any): any {
  const g = structuredClone(f);
  for (const l of g.stage.layers) l.x = -l.x;
  for (const s of g.stage.surfaces) [s.x0, s.x1] = [-s.x1, -s.x0];
  for (const p of g.props) p.x = -p.x;
  for (const c of g.characters) {
    c.x = -c.x;
    c.facing = c.facing === 'right' ? 'left' : 'right';
  }
  for (const k of g.camera.keys) k.x = -k.x;
  for (const w of g.walks ?? []) w.toX = -w.toX;
  for (const t of g.timeline) if (t.bind?.place) t.bind.place.x = -t.bind.place.x;
  for (const t of g.turns ?? []) if (t.face === 'left' || t.face === 'right') t.face = t.face === 'left' ? 'right' : 'left';
  for (const p of Object.values<any>(g.points ?? {})) if ('x' in p) p.x = -p.x;
  return g;
}

/** Phim không cầm đồ: tam (a) đi phải rồi đổi chiều sang trái; lan (b) đổi chiều ngay khi đi; sau đó cả hai quay tại chỗ. */
function bare(turnDur?: number): any {
  return {
    schemaVersion: 1, id: 'flip-test',
    output: { width: 1920, height: 1080, fps: 24, durationFrames: 260 },
    packs: ['sample-m0', 'demo-cast'].map((id) => ({ id, version: '0.1.0', manifestSha256: packs.get(id)!.manifestSha256 })),
    stage: { layers: [], surfaces: [{ id: 'floor', y: 0, x0: -1200, x1: 1200 }] },
    props: [],
    characters: [
      { id: 'a', pack: 'demo-cast', rig: 'biped-demo', character: 'tam', x: -500, scale: 1, depth: 1, facing: 'right', on: 'floor' },
      { id: 'b', pack: 'demo-cast', rig: 'biped-demo', character: 'lan', x: 500, scale: 1.1, depth: 1, facing: 'right', on: 'floor' },
    ],
    camera: { keys: [{ frame: 0, x: 0, y: 400, zoom: 1 }] },
    timeline: [],
    walks: [
      { character: 'a', start: 10, durationFrames: 110, toX: -300 },
      { character: 'a', start: 130, durationFrames: 75, toX: -420 },
      { character: 'b', start: 20, durationFrames: 150, toX: 80 },
    ],
    turns: [
      { character: 'a', start: 215, face: 'right', ...(turnDur ? { durationFrames: turnDur } : {}) },
      { character: 'b', start: 180, face: 'right', ...(turnDur ? { durationFrames: turnDur } : {}) },
    ],
    physics: [],
  };
}

/** m2-handover: lan quay tại chỗ (đang cầm đèn), tam đi đổi chiều (đang cầm đèn). turnDur ghi đè thời lượng quay. */
function handover(turnDur?: number): any {
  const f = raw('m2-handover');
  if (turnDur) for (const t of f.turns) t.durationFrames = turnDur;
  return f;
}

interface Case { name: string; film: Film }
const cases: Case[] = [];
for (const [dur, label] of [[undefined, 'even (rig 14)'], [13, 'odd 13']] as const) {
  // Walk đổi chiều dùng gait.turnFrames → thời lượng lẻ cần rig có turnFrames lẻ (cùng cơ chế, chỉ khác dữ liệu).
  cases.push({ name: `handover ${label}`, film: build(handover(dur), dur) });
  cases.push({ name: `handover mirrored ${label}`, film: build(mirror(handover(dur)), dur) });
  cases.push({ name: `bare ${label}`, film: build(bare(dur), dur) });
  cases.push({ name: `bare mirrored ${label}`, film: build(mirror(bare(dur)), dur) });
}

/** Mọi frame lật (|fx| < 1) của từng nhân vật, kèm frame ngay trước/sau và hướng lật. */
function flips(f: Film): { ci: number; frames: number[]; from: number }[] {
  const out: { ci: number; frames: number[]; from: number }[] = [];
  f.data.characters.forEach((_, ci) => {
    let cur: number[] = [];
    for (let fr = 0; fr < f.data.output.durationFrames; fr++) {
      if (Math.abs(characterState(f, ci, fr).fx) < 1) cur.push(fr);
      else if (cur.length) {
        out.push({ ci, frames: cur, from: characterState(f, ci, cur[0]! - 1).fx });
        cur = [];
      }
    }
    if (cur.length) out.push({ ci, frames: cur, from: characterState(f, ci, cur[0]! - 1).fx });
  });
  return out;
}

/** Thời lượng lật T theo DỮ LIỆU: turn.durationFrames ?? gait.turnFrames; walk đổi chiều: gait.turnFrames. */
function flipLength(f: Film, ci: number, start: number): number {
  const c = f.data.characters[ci]!;
  const gaitT = f.rigs.get(c.pack)!.data.gait!.turnFrames;
  const t = (f.data.turns ?? []).find((x) => x.character === c.id && x.start === start);
  if (t) return t.durationFrames ?? gaitT;
  assert.ok((f.data.walks ?? []).some((w) => w.character === c.id && w.start === start), `${c.id}: no turn/walk starts at ${start}`);
  return gaitT;
}

const assetOf = (f: Film, s: Sprite) => f.packs.get('demo-cast')!.assets.get(s.asset) ?? f.assets.get(s.asset)!;
const byId = (sf: SceneFrame, id: string) => sf.sprites.find((s) => s.id === id)!;
/** Bề ngang hình vẽ ra so với bề cao (1 = không co): cả co trong art (scaleX) lẫn co trên màn hình (paperX). */
const width = (s: Sprite) => (Math.abs(s.scaleX) * (s.paperX ?? 1)) / s.scale;

/** Sai số lớn nhất (px màn hình) giữa các neo phải trùng nhau trên hình đã chiếu, cho một nhân vật ở một frame. */
function anchorErrors(f: Film, ci: number, fr: number, sf = sampleFrame(f, fr)) {
  const c = f.data.characters[ci]!;
  const rig = f.rigs.get(c.pack)!;
  let joint = 0;
  for (const b of rig.order) {
    if (b.parent === null || b.attach === null) continue;
    const parent = byId(sf, `${c.id}/${b.parent}`);
    const child = byId(sf, `${c.id}/${b.id}`);
    const p = spriteToScreen(parent, assetOf(f, parent).anchors[b.attach]!);
    joint = Math.max(joint, Math.hypot(p[0] - child.x, p[1] - child.y));
  }
  // Contact của motion (thế giới → màn hình như đạo cụ) so với anchor trên hình đã chiếu của xương chứa nó.
  let contact = 0;
  let held = 0;
  for (const p of f.data.props) {
    const seg = segmentAt(f, p.id, fr);
    const owner = seg.holders[seg.holders.length - 1];
    if (!owner || owner.ci !== ci) continue;
    const hand = byId(sf, `${c.id}/${rig.data.contacts[owner.contact]!.bone}`);
    const prop = byId(sf, p.id);
    const a = spriteToScreen(hand, assetOf(f, hand).anchors[rig.data.contacts[owner.contact]!.anchor]!);
    const b = spriteToScreen(prop, assetOf(f, prop).anchors[owner.anchor]!);
    held = Math.max(held, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  for (const [name, ct] of Object.entries(rig.data.contacts)) {
    const s = byId(sf, `${c.id}/${ct.bone}`);
    const onSprite = spriteToScreen(s, assetOf(f, s).anchors[ct.anchor]!);
    // contactWorld chiếu lên màn hình bằng cùng phép chiếu của sprite gốc (đổi thế giới → màn hình theo pivot gốc).
    const w = contactWorld(f, ci, fr, name);
    const st = characterState(f, ci, fr);
    const root = byId(sf, `${c.id}/${rig.order[0]!.id}`);
    const k = root.scale / st.scale; // zoom của lớp nhân vật
    const scr: [number, number] = [root.x + (w[0] - st.root[0]) * k, root.y - (w[1] - st.root[1]) * k];
    contact = Math.max(contact, Math.hypot(scr[0] - onSprite[0], scr[1] - onSprite[1]));
  }
  return { joint, contact, held };
}

test('flip matrix covers even/odd durations, both directions, both characters, turn and walk, holding and not', () => {
  const seen = new Set<string>();
  for (const { name, film } of cases) {
    const fl = flips(film);
    for (const { ci, frames, from } of fl) {
      const c = film.data.characters[ci]!;
      const holding = film.data.props.some((p) => segmentAt(film, p.id, frames[0]!).holders.some((h) => h.ci === ci));
      const kind = (film.data.turns ?? []).some((t) => t.character === c.id && t.start === frames[0]) ? 'turn' : 'walk';
      seen.add(`${flipLength(film, ci, frames[0]!) % 2 ? 'odd' : 'even'} ${from > 0 ? 'R→L' : 'L→R'} ${c.character} ${kind} ${holding ? 'holding' : 'empty'}`);
    }
    assert.ok(fl.length >= 2, `${name}: expected ≥ 2 flips, found ${fl.length}`);
  }
  const has = (re: RegExp) => [...seen].some((s) => re.test(s));
  for (const re of [/^even/, /^odd/, /R→L/, /L→R/, / tam /, / lan /, / turn /, / walk /, /holding$/, /empty$/]) {
    assert.ok(has(re), `matrix misses ${re}: ${[...seen].join(' | ')}`);
  }
  for (const re of [/turn holding/, /walk holding/, /turn empty/, /walk empty/]) assert.ok(has(re), `matrix misses ${re}`);
});

for (const { name, film } of cases) {
  test(`${name}: every character sprite stays visible through each flip; edge-on falls between frames`, () => {
    for (const { ci, frames } of flips(film)) {
      const c = film.data.characters[ci]!;
      const T = flipLength(film, ci, frames[0]!);
      assert.ok(frames.length === T || frames.length === T - 1, `${c.id}: flip spans ${frames.length} frames, data says ${T}`);
      // Hình mỏng nhất cho phép = hình cách điểm đổi mặt nửa frame (không gắn hằng số).
      const minRatio = Math.abs(Math.cos(Math.PI * ease('inOutSine', 0.5 + 0.5 / T)));
      for (const fr of frames) {
        const sf = sampleFrame(film, fr);
        for (const s of sf.sprites.filter((x) => x.id.startsWith(`${c.id}/`))) {
          const ratio = width(s);
          assert.ok(ratio >= minRatio - 1e-9, `${c.id} frame ${fr} ${s.id}: width ratio = ${ratio.toFixed(4)} < ${minRatio.toFixed(4)}`);
        }
      }
    }
  });

  test(`${name}: joints, contacts and held props coincide on the projected sprites through each flip`, () => {
    for (const { ci, frames } of flips(film)) {
      for (const fr of [frames[0]! - 1, ...frames, frames[frames.length - 1]! + 1]) {
        const e = anchorErrors(film, ci, fr);
        const at = `${film.data.characters[ci]!.id} frame ${fr}`;
        assert.ok(e.joint < 1e-6, `${at}: joint off by ${e.joint.toFixed(3)} px`);
        assert.ok(e.contact < 1e-6, `${at}: contact off by ${e.contact.toFixed(3)} px`);
        assert.ok(e.held < 1e-6, `${at}: held prop off the hand by ${e.held.toFixed(3)} px`);
      }
    }
  });
}

test('m2-handover regression: Lan (f202) and Tam (f322) are visible and the lantern stays in the gripping hand', () => {
  const f = build(raw('m2-handover'));
  for (const [ci, fr] of [[1, 202], [0, 322]] as const) {
    const c = f.data.characters[ci]!;
    const sf = sampleFrame(f, fr);
    const ratios = sf.sprites.filter((s) => s.id.startsWith(`${c.id}/`)).map(width);
    assert.ok(Math.min(...ratios) > 0.05, `${c.id} frame ${fr}: min width ratio = ${Math.min(...ratios)}`);
    const lantern = byId(sf, 'lantern-1');
    assert.equal(width(lantern), 1, 'the lantern keeps its width');
    assert.ok(anchorErrors(f, ci, fr, sf).held < 1e-6, `${c.id} frame ${fr}: lantern off the hand`);
  }
});
