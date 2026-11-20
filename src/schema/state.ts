import { z } from 'zod';
import { fail, parseWith } from '../core/errors.ts';

export const STATUSES = [
  'NOT_RUN',
  'BLOCKED',
  'PASS_TECHNICAL',
  'ART_REWORK_REQUIRED',
  'READY_FOR_USER_REVIEW',
  'ACCEPTED',
] as const;
export const Status = z.enum(STATUSES);

export const MILESTONES = ['M0', 'DEMO', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const;

const Milestone = z
  .object({
    status: Status,
    head: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checks: z.record(z.string().regex(/^[a-zA-Z:]+$/), Status),
    notes: z.array(z.string()),
  })
  .strict();

const StateSchema = z
  .object({
    schemaVersion: z.literal(1),
    openMilestone: z.enum(MILESTONES),
    milestones: z.object(Object.fromEntries(MILESTONES.map((m) => [m, Milestone])) as Record<
      (typeof MILESTONES)[number],
      typeof Milestone
    >).strict(),
  })
  .strict();

export type State = z.output<typeof StateSchema>;

/**
 * Ràng buộc thứ tự: mọi mốc trước mốc đang mở phải ACCEPTED; mốc sau mốc đang mở phải NOT_RUN;
 * mốc đang mở không được ACCEPTED (khi đã ACCEPTED thì chủ dự án mở mốc kế tiếp).
 */
export function validateState(data: unknown): State {
  const s = parseWith(StateSchema, data, 'STATE_SCHEMA', 'state');
  const open = MILESTONES.indexOf(s.openMilestone);
  MILESTONES.forEach((m, i) => {
    const st = s.milestones[m].status;
    if (i < open && st !== 'ACCEPTED') fail('STATE_ORDER', `state.milestones.${m}`, `before open milestone but status ${st}`);
    if (i > open && st !== 'NOT_RUN') fail('STATE_ORDER', `state.milestones.${m}`, `after open milestone but status ${st}`);
    if (i === open && st === 'ACCEPTED') fail('STATE_ORDER', `state.milestones.${m}`, 'open milestone already ACCEPTED; open the next one');
  });
  return s;
}
