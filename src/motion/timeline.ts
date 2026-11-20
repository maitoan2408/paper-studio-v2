/**
 * Lấy mẫu chuyển động: (film, nhân vật, frame) → góc khớp + variant + độ lệch gốc. Hàm thuần.
 * - t của clip: u = (f − start)/(duration − 1) ∈ [0,1] (frame cuối chạm t = 1); repeat > 1 → phần lẻ của u·repeat.
 * - Lớp (layer) tăng dần; trong lớp theo start. offset cộng có trọng số, absolute nội suy về giá trị.
 * - Trọng số w nối mượt bằng blendIn/blendOut; variant áp dụng khi w ≥ 0.5.
 * - @active = l|r do bind.active; khi = r, giá trị xoay của xương @active đổi dấu (đối xứng gương),
 *   để cùng một clip dùng được cho cả hai tay.
 */
import { fail } from '../core/errors.ts';
import type { V2 } from '../core/space.ts';
import type { ActionClip } from '../schema/action.ts';
import type { Film } from '../schema/film.ts';
import { ease, type EasingName } from './easing.ts';

export interface CharacterPose {
  angles: Map<string, number>;
  variants: Map<string, string>;
  /** Độ lệch gốc (px art, local y-lên, trước khi lật hướng). */
  root: V2;
}

interface Key<V> {
  t: number;
  v: V;
  ease?: EasingName | 'step' | undefined;
}

export function keyValue(keys: readonly Key<number>[], t: number): number {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.t <= t) i++;
  const a = keys[i]!;
  const b = keys[i + 1];
  if (!b) return a.v;
  return a.v + (b.v - a.v) * ease((a.ease ?? 'linear') as EasingName, (t - a.t) / (b.t - a.t));
}

export function keyStep(keys: readonly Key<string>[], t: number): string {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.t <= t) i++;
  return keys[i]!.v;
}

export function usesActive(clip: ActionClip): boolean {
  return JSON.stringify([clip.channels.map((c) => c.bone), clip.events.map((e) => e.contact), clip.requires]).includes('@active');
}

export function clipFor(film: Film, packId: string, clipId: string): ActionClip {
  const c = film.clips.get(packId)?.get(clipId);
  if (!c) return fail('FILM_UNKNOWN_REF', `clip ${clipId}`, `no clip "${clipId}" in pack ${packId}`);
  return c;
}

export function characterPose(film: Film, charIndex: number, frame: number): CharacterPose {
  const ch = film.data.characters[charIndex]!;
  const rig = film.rigs.get(ch.pack)!;
  const def = rig.data.characters.find((c) => c.id === ch.character)!;
  const angles = new Map(rig.order.map((b) => [b.id, def.rest[b.id]!]));
  const variants = new Map<string, string>();
  const root: [number, number] = [0, 0];

  const items = film.data.timeline
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.character === ch.id && frame >= it.start && frame < it.start + it.durationFrames)
    .sort((a, b) => (a.it.layer ?? 0) - (b.it.layer ?? 0) || a.it.start - b.it.start || a.index - b.index);

  for (const { it } of items) {
    const clip = clipFor(film, ch.pack, it.clip);
    const side = it.bind.active;
    if (usesActive(clip) && !side) fail('ACTION_PRECONDITION', `timeline ${ch.id}/${it.clip}`, 'clip uses @active but bind.active is not set');
    const d = it.durationFrames;
    const u = d > 1 ? (frame - it.start) / (d - 1) : 1;
    const rep = it.repeat ?? 1;
    const t = rep === 1 ? u : u * rep - Math.floor(u * rep);
    const end = it.start + d;
    let w = 1;
    if ((it.blendIn ?? 0) > 0) w = Math.min(w, (frame - it.start + 1) / ((it.blendIn ?? 0) + 1));
    if ((it.blendOut ?? 0) > 0) w = Math.min(w, (end - frame) / ((it.blendOut ?? 0) + 1));

    for (const c of clip.channels) {
      const mirrored = side === 'r' && c.bone.includes('.@active');
      const bone = side ? c.bone.replace('.@active', `.${side}`) : c.bone;
      if (c.prop === 'variant') {
        if (w >= 0.5) variants.set(bone, keyStep(c.keys, t));
        continue;
      }
      const v = keyValue(c.keys, t) * (mirrored && c.prop === 'rotation' ? -1 : 1);
      if (c.prop === 'rotation') {
        const cur = angles.get(bone)!;
        angles.set(bone, c.mode === 'offset' ? cur + w * v : cur + w * (v - cur));
      } else {
        const k = c.prop === 'rootX' ? 0 : 1;
        root[k] = c.mode === 'offset' ? root[k] + w * v : root[k] + w * (v - root[k]);
      }
    }
  }
  return { angles, variants, root };
}
