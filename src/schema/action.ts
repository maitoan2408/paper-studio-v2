/**
 * Action clip — BẢN NHÁP v0 (được phép đổi ở M1/M2).
 * Thời gian chuẩn hóa t ∈ [0,1]; thời lượng thật do film quyết định.
 * `@active` trong tên xương/contact được film gán thành `l` hoặc `r`; validator kiểm cả hai bên.
 * Kiểm ở mức film (lấy mẫu mọi frame): ACTION_PRECONDITION, ACTION_LIMIT_EXCEEDED, ACTION_SPEED_EXCEEDED
 * (ngưỡng tốc độ theo từng xương trong rig.json, gồm cả bàn tay khi thả).
 */
import { z } from 'zod';
import { fail, parseWith } from '../core/errors.ts';
import { EASING_NAMES } from '../motion/easing.ts';
import { Id } from './common.ts';
import type { Rig } from './rig.ts';

const Ref = z.string().regex(/^[a-z][a-z0-9-]*(\.([lr]|@active))?$/, 'must be name, name.l, name.r or name.@active');
const T = z.number().finite().min(0).max(1);
const Ease = z.enum(EASING_NAMES);

const NumKey = z.object({ t: T, v: z.number().finite(), ease: Ease.optional() }).strict();
const VariantKey = z.object({ t: T, v: z.union([Id, z.literal('default')]), ease: z.literal('step').optional() }).strict();

const Channel = z.discriminatedUnion('prop', [
  z.object({ bone: Ref, prop: z.literal('rotation'), mode: z.enum(['offset', 'absolute']), keys: z.array(NumKey).min(1) }).strict(),
  z.object({ bone: Ref, prop: z.enum(['rootX', 'rootY']), mode: z.enum(['offset', 'absolute']), keys: z.array(NumKey).min(1) }).strict(),
  z.object({ bone: Ref, prop: z.literal('variant'), mode: z.literal('absolute'), keys: z.array(VariantKey).min(1) }).strict(),
  /** Bóp ngang sprite của xương quanh pivot (1 = không bóp; dùng khi đổi variant, như lật tờ giấy). */
  z.object({ bone: Ref, prop: z.literal('squashX'), mode: z.literal('absolute'), keys: z.array(z.object({ t: T, v: z.number().finite().min(0.05).max(1), ease: Ease.optional() }).strict()).min(1) }).strict(),
]);

const Event = z.discriminatedUnion('type', [
  z.object({ t: T, type: z.literal('grip'), contact: Ref, target: Id }).strict(),
  z.object({ t: T, type: z.literal('release'), contact: Ref }).strict(),
  z.object({ t: T, type: z.literal('contact'), contact: Ref, surface: Id }).strict(),
]);

const ActionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    rig: Id,
    channels: z.array(Channel),
    events: z.array(Event),
    requires: z
      .object({
        hands: z.array(Ref).optional(),
        props: z.array(z.object({ role: Id, anchors: z.array(z.string()).min(1) }).strict()).optional(),
        contacts: z.array(Ref).optional(),
      })
      .strict(),
  })
  .strict();

export type ActionClip = z.output<typeof ActionSchema>;

const resolve = (ref: string, side: 'l' | 'r') => ref.replace('.@active', `.${side}`);

export function validateAction(raw: unknown, rig: Rig): ActionClip {
  const a = parseWith(ActionSchema, raw, 'ACTION_SCHEMA', 'action');
  if (a.rig !== rig.data.id) fail('ACTION_RIG_MISMATCH', 'action.rig', `clip targets rig "${a.rig}", got "${rig.data.id}"`);
  const bones = new Set(rig.order.map((b) => b.id));
  const root = rig.order[0]!.id;

  a.channels.forEach((ch, i) => {
    const where = `action.channels[${i}]`;
    ch.keys.forEach((k, j) => {
      if (j === 0 && k.t !== 0) fail('ACTION_KEYS_UNSORTED', `${where}.keys[0]`, 'first key must be at t=0');
      if (j > 0 && !(k.t > ch.keys[j - 1]!.t)) fail('ACTION_KEYS_UNSORTED', `${where}.keys[${j}]`, `t=${k.t} must be > previous t`);
      if (ch.prop !== 'variant' && j < ch.keys.length - 1 && k.ease === undefined) {
        fail('ACTION_SCHEMA', `${where}.keys[${j}].ease`, 'ease is required on every key except the last');
      }
    });
    for (const side of rig.data.sides) {
      const bone = resolve(ch.bone, side);
      if (!bones.has(bone)) fail('ACTION_UNKNOWN_BONE', `${where}.bone`, `"${ch.bone}" → "${bone}" not in rig ${rig.data.id}`);
      if ((ch.prop === 'rootX' || ch.prop === 'rootY') && bone !== root) {
        fail('ACTION_UNKNOWN_BONE', `${where}.bone`, `${ch.prop} only applies to root bone "${root}"`);
      }
      if (ch.prop === 'variant') for (const k of ch.keys) requireVariant(rig, bone, k.v, `${where}.keys`);
    }
  });

  const contactNames = new Set(Object.keys(rig.data.contacts));
  const gripped = new Map<string, number>();
  a.events
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.t - y.e.t || x.i - y.i)
    .forEach(({ e, i }) => {
      const where = `action.events[${i}]`;
      for (const side of rig.data.sides) {
        const c = resolve(e.contact, side);
        if (!contactNames.has(c)) fail('ACTION_UNKNOWN_BONE', `${where}.contact`, `contact "${c}" not in rig ${rig.data.id}`);
      }
      if (e.type === 'grip') {
        if (gripped.has(e.contact)) fail('ACTION_EVENT_ORDER', where, `"${e.contact}" gripped twice without release`);
        gripped.set(e.contact, e.t);
      }
      if (e.type === 'release') {
        if (!gripped.has(e.contact)) fail('ACTION_EVENT_ORDER', where, `release of "${e.contact}" without a prior grip`);
        gripped.delete(e.contact);
      }
    });

  for (const [k, list] of [['hands', a.requires.hands ?? []], ['contacts', a.requires.contacts ?? []]] as const) {
    for (const ref of list) {
      for (const side of rig.data.sides) {
        const r = resolve(ref, side);
        const ok = k === 'hands' ? bones.has(r) : contactNames.has(r);
        if (!ok) fail('ACTION_UNKNOWN_BONE', `action.requires.${k}`, `"${ref}" → "${r}" not in rig`);
      }
    }
  }
  return a;
}

/** Variant phải có ở MỌI nhân vật dùng rig này (`default` luôn có). */
function requireVariant(rig: Rig, bone: string, variant: string, where: string): void {
  if (variant === 'default') return;
  for (const ch of rig.data.characters) {
    if (!ch.skin[bone]?.variants?.[variant]) {
      fail('ACTION_UNKNOWN_VARIANT', where, `character "${ch.id}" has no variant "${variant}" for bone "${bone}"`);
    }
  }
}
