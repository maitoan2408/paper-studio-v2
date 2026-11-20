import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudioError, readJsonFile } from '../core/errors.ts';
import { MILESTONES, validateState } from './state.ts';

const ms = (status: string) => ({ status, head: null, updated: '2026-11-20', checks: {}, notes: [] });
function state(open: string, statuses: Record<string, string> = {}) {
  return {
    schemaVersion: 1,
    openMilestone: open,
    milestones: Object.fromEntries(MILESTONES.map((m) => [m, ms(statuses[m] ?? 'NOT_RUN')])),
  };
}
const code = (c: string) => (e: unknown) => e instanceof StudioError && e.code === c;

test('repo docs/STATE.json is valid', () => {
  validateState(readJsonFile('docs/STATE.json'));
});

test('valid state passes', () => {
  validateState(state('M1', { M0: 'ACCEPTED', DEMO: 'ACCEPTED', M1: 'READY_FOR_USER_REVIEW' }));
});

test('unknown status is rejected', () => {
  assert.throws(() => validateState(state('M0', { M0: 'DONE' })), code('STATE_SCHEMA'));
});

test('unknown field is rejected', () => {
  assert.throws(() => validateState({ ...state('M0'), extra: 1 }), code('STATE_SCHEMA'));
});

test('missing milestone is rejected', () => {
  const s = state('M0');
  delete (s.milestones as Record<string, unknown>).M6;
  assert.throws(() => validateState(s), code('STATE_SCHEMA'));
});

test('opening M1 before M0 ACCEPTED is rejected', () => {
  assert.throws(() => validateState(state('M1', { M0: 'PASS_TECHNICAL' })), code('STATE_ORDER'));
});

test('later milestone with progress is rejected', () => {
  assert.throws(() => validateState(state('M0', { M2: 'PASS_TECHNICAL' })), code('STATE_ORDER'));
});

test('open milestone marked ACCEPTED is rejected', () => {
  assert.throws(() => validateState(state('M0', { M0: 'ACCEPTED' })), code('STATE_ORDER'));
});

test('DEMO sits between M0 and M1', () => {
  assert.deepEqual(MILESTONES.slice(0, 3), ['M0', 'DEMO', 'M1']);
  validateState(state('DEMO', { M0: 'ACCEPTED', DEMO: 'READY_FOR_USER_REVIEW' }));
  assert.throws(() => validateState(state('DEMO', { M0: 'BLOCKED' })), code('STATE_ORDER'));
  assert.throws(() => validateState(state('M1', { M0: 'ACCEPTED', DEMO: 'PASS_TECHNICAL' })), code('STATE_ORDER'));
  assert.throws(() => validateState(state('M0', { DEMO: 'PASS_TECHNICAL' })), code('STATE_ORDER'));
});
