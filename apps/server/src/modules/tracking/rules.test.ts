import { describe, it, expect } from 'vitest';
import type { TrelloItem, TrelloOverview } from '@dev-project-agent/contracts';
import { evaluateTracking as evaluateWithPolicy, type TrackingPolicy } from './rules.js';
const initialTrackingPolicy: TrackingPolicy = { version: 'test-policy', dueSoonHours: 72, staleAfterMinutes: 60, thresholdsConfirmed: false, priorityLabels: {}, blockedLabels: [] };
const evaluateTracking = (input: TrelloOverview, at: Date, policy = initialTrackingPolicy) => evaluateWithPolicy(input, at, policy);

const now = new Date('2026-10-10T17:00:00Z');
const item = (changes: Partial<TrelloItem> = {}): TrelloItem => ({
  id: 'a'.repeat(24), name: 'Synthetic activity', listId: 'b'.repeat(24), kind: 'activity', state: 'pending',
  labelNames: ['PENDIENTE'], start: '2026-10-01T13:00:00Z', due: '2026-10-11T17:00:00Z', dueComplete: false,
  archived: false, memberIds: ['c'.repeat(24)], qualityIssues: [], ...changes,
});
const source = (items: TrelloItem[]): TrelloOverview => ({
  connection: { boardId: 'd'.repeat(24), apiConfigured: true }, lastAttempt: null,
  latest: { id: 'snapshot', source: 'api', observedAt: '2026-10-10T16:59:00Z', importedAt: '2026-10-10T16:59:00Z', changes: [],
    data: { board: { id: 'd'.repeat(24), name: 'Synthetic project' }, lists: [], members: [], items } },
});

describe('Deterministic tracking rules', () => {
  it('uses strict overdue and inclusive due-soon boundaries', () => {
    for (const [due, expected] of [
      ['2026-10-10T16:59:59.999Z', 'overdue'], ['2026-10-10T17:00:00Z', 'due_soon'],
      ['2026-10-13T17:00:00Z', 'due_soon'], ['2026-10-13T17:00:00.001Z', 'scheduled'],
    ]) expect(evaluateTracking(source([item({ due })]), now).items[0]!.schedule).toBe(expected);
  });
  it('compares explicit offsets as instants rather than dates or server timezone', () => {
    expect(evaluateTracking(source([item({ due: '2026-10-10T12:00:00-05:00' })]), now).items[0]!.schedule).toBe('due_soon');
  });
  it('does not conclude overdue or in-time from missing/conflicting states or completion', () => {
    for (const changes of [{ state: 'unknown' as const }, { state: 'completed' as const, dueComplete: false }, { dueComplete: true }]) {
      const result = evaluateTracking(source([item({ due: '2026-10-09T17:00:00Z', ...changes })]), now);
      expect(result.items[0]!.schedule).toBe('not_evaluable');
      expect(result.findings.map(finding => finding.code)).toEqual(['data_quality']);
    }
  });
  it('marks missing, invalid, ambiguous, and reversed dates without inventing a deadline', () => {
    for (const due of [null, 'invalid', '2026-10-10', '2026-10-10T12:00:00']) {
      expect(evaluateTracking(source([item({ due })]), now).items[0]!.schedule).toBe('not_evaluable');
    }
    expect(evaluateTracking(source([item({ start: '2026-10-20T17:00:00Z' })]), now).items[0]!.qualityIssues).toContain('invalid_schedule');
  });
  it('does not require a start for a milestone and keeps milestones outside progress', () => {
    const result = evaluateTracking(source([item({ kind: 'milestone', start: null })]), now);
    expect(result.items[0]!.qualityIssues).not.toContain('missing_start');
    expect(result.summary?.activities.total).toBe(0);
    expect(result.summary?.milestones.dueSoon).toBe(1);
    expect(result.summary?.progress.percent).toBeNull();
  });
  it('calculates declared progress without accepting delivery or archived/reference cards', () => {
    const result = evaluateTracking(source([
      item({ state: 'completed', dueComplete: true }), item({ id: 'e'.repeat(24) }),
      item({ id: 'f'.repeat(24), kind: 'reference' }), item({ id: '1'.repeat(24), archived: true }),
      item({ id: '2'.repeat(24), kind: 'milestone', state: 'completed', dueComplete: true }),
    ]), now);
    expect(result.summary?.progress).toEqual({ numerator: 1, denominator: 2, percent: 50, basis: 'declared_completion' });
    expect(result.summary?.milestones.completedDeclared).toBe(1);
  });
  it('leaves missing priority/block mappings unknown', () => {
    const result = evaluateTracking(source([item({ labelNames: ['red', 'ALTA', 'BLOQUEADA'] })]), now);
    expect(result.items[0]!.priority).toBeNull();
    expect(result.items[0]!.blocked).toBeNull();
    expect(result.summary?.activities.blockingUnknown).toBe(1);
  });
  it('maps explicit blockers independently and deduplicates affected items', () => {
    const result = evaluateTracking(source([item({ due: '2026-10-09T17:00:00Z', labelNames: ['PENDIENTE', 'BLOCKED', 'URGENT'] })]), now,
      { ...initialTrackingPolicy, blockedLabels: ['BLOCKED'], priorityLabels: { URGENT: 'high' } });
    expect(result.findings.map(finding => finding.code)).toEqual(['blocked', 'overdue']);
    expect(result.summary?.affectedItems).toBe(1);
    expect(result.items[0]).toMatchObject({ blocked: true, priority: 'high', attention: 'immediate', overdueHours: 24 });
  });
  it('raises immediate attention for near-due blocked items and flags conflicting priorities', () => {
    const result = evaluateTracking(source([item({ labelNames: ['BLOCKED', 'HIGH', 'LOW'] })]), now,
      { ...initialTrackingPolicy, blockedLabels: ['BLOCKED'], priorityLabels: { HIGH: 'high', LOW: 'low' } });
    expect(result.items[0]).toMatchObject({ attention: 'immediate', priority: null });
    expect(result.items[0]!.qualityIssues).toContain('conflicting_priority');
  });
  it('does not make a completed declaration overdue and flags completed blockers', () => {
    const result = evaluateTracking(source([item({ state: 'completed', dueComplete: true, due: '2026-10-09T17:00:00Z', labelNames: ['BLOCKED'] })]), now,
      { ...initialTrackingPolicy, blockedLabels: ['BLOCKED'] });
    expect(result.items[0]!.schedule).toBe('completed_declared');
    expect(result.findings.map(finding => finding.code)).toEqual(['data_quality']);
  });
  it('distinguishes stale, recent, and historical sources and preserves failed-attempt context', () => {
    const state = source([item()]);
    expect(evaluateTracking(state, now).source?.freshness).toBe('recent');
    state.latest!.observedAt = '2026-10-10T16:00:00Z';
    state.lastAttempt = { status: 'failed', attemptedAt: now.toISOString(), errorCode: 'ACCESS_DENIED' };
    expect(evaluateTracking(state, now).source).toMatchObject({ freshness: 'stale', lastAttemptFailed: true, ageMinutes: 60 });
    state.latest!.source = 'export';
    expect(evaluateTracking(state, now).source?.freshness).toBe('historical');
  });
  it('refuses time evaluation from future or invalid source dates', () => {
    const state = source([item()]);
    for (const observedAt of ['2026-10-11T17:00:00Z', 'invalid']) {
      state.latest!.observedAt = observedAt;
      expect(evaluateTracking(state, now).source?.freshness).toBe('invalid');
      expect(evaluateTracking(state, now).items[0]!.schedule).toBe('not_evaluable');
    }
  });
  it('returns unavailable progress for absent/empty observations', () => {
    expect(evaluateTracking({ ...source([]), latest: null }, now).summary).toBeNull();
    expect(evaluateTracking(source([]), now).summary?.progress.percent).toBeNull();
  });
  it('produces stable evidence IDs and never claims dependency impact or causes', () => {
    const state = source([item({ due: '2026-10-09T17:00:00Z' })]);
    const first = evaluateTracking(state, now);
    const second = evaluateTracking(state, new Date(now.getTime() + 1000));
    expect(first.findings[0]!.id).toBe(second.findings[0]!.id);
    expect(first.findings[0]).toMatchObject({ impact: 'not_assessed', evidence: [{ field: 'state', value: 'pending' }, { field: 'due', value: '2026-10-09T17:00:00Z' }, { field: 'dueComplete', value: false }] });
  });
  it('validates configuration and uses the configured window', () => {
    expect(() => evaluateTracking(source([]), now, { ...initialTrackingPolicy, dueSoonHours: -1 })).toThrow();
    expect(() => evaluateTracking(source([]), new Date('invalid'))).toThrow();
    expect(evaluateTracking(source([item()]), now, { ...initialTrackingPolicy, dueSoonHours: 12 }).items[0]!.schedule).toBe('scheduled');
  });
});
