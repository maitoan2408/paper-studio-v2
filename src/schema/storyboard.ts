/**
 * Storyboard — BẢN NHÁP v0, chốt ở M4. Revision bất biến: revision 1 không có cha; revision > 1 phải trỏ cha.
 * Chưa làm ở M0: STORYBOARD_UNSUPPORTED_ACTION (cần thư viện clip, làm khi có compiler ở M4).
 */
import { z } from 'zod';
import { fail, parseWith } from '../core/errors.ts';
import { Id, Sha256, firstDuplicate } from './common.ts';

const Beat = z
  .object({ atSec: z.number().finite().min(0), role: Id, action: Id, hand: z.enum(['left', 'right']).optional(), line: z.string().max(500).optional() })
  .strict();
const Scene = z
  .object({ id: Id, setting: Id, durationSec: z.number().finite().positive().max(600), beats: z.array(Beat) })
  .strict();

const StoryboardSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    revision: z.number().int().min(1),
    parentSha256: Sha256.nullable(),
    title: z.string().min(1).max(200),
    cast: z.array(z.object({ role: Id, pack: Id, character: Id }).strict()).min(1),
    scenes: z.array(Scene).min(1),
  })
  .strict();

export type Storyboard = z.output<typeof StoryboardSchema>;

export function validateStoryboard(raw: unknown): Storyboard {
  const s = parseWith(StoryboardSchema, raw, 'STORYBOARD_SCHEMA', 'storyboard');
  if ((s.revision === 1) !== (s.parentSha256 === null)) {
    fail('STORYBOARD_REVISION', 'storyboard.parentSha256', 'revision 1 must have no parent; later revisions must reference one');
  }
  const dup = firstDuplicate([...s.cast.map((c) => c.role), ...s.scenes.map((x) => x.id)]);
  if (dup) fail('STORYBOARD_SCHEMA', 'storyboard', `duplicate id "${dup}"`);
  const roles = new Set(s.cast.map((c) => c.role));
  s.scenes.forEach((sc, i) =>
    sc.beats.forEach((b, j) => {
      const where = `storyboard.scenes[${i}].beats[${j}]`;
      if (!roles.has(b.role)) fail('STORYBOARD_UNKNOWN_ROLE', `${where}.role`, `role "${b.role}" is not in cast`);
      if (b.atSec >= sc.durationSec) fail('STORYBOARD_SCHEMA', `${where}.atSec`, `${b.atSec} >= scene duration ${sc.durationSec}`);
    }),
  );
  return s;
}
