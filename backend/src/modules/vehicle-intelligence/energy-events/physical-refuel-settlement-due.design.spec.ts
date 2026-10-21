import { computeNextReconciliationAt, isReconciliationDue } from './physical-refuel-settlement-due.design';

describe('physical refuel settlement due (G2.1a)', () => {
  const horizon = 60 * 60 * 1000;
  const t0 = Date.parse('2026-09-04T03:40:00.000Z');

  it('schedules next reconciliation for PROVISIONAL singleton', () => {
    const due = computeNextReconciliationAt({
      finalityState: 'PROVISIONAL',
      siblingEventIds: ['evt-1'],
      firstObservedAtById: { 'evt-1': t0 },
      settlementHorizonMs: horizon,
    });
    expect(due?.getTime()).toBe(t0 + horizon);
    expect(isReconciliationDue(due, t0 + horizon)).toBe(true);
    expect(isReconciliationDue(due, t0 + horizon - 1)).toBe(false);
  });

  it('returns null for FINAL_DISTINCT', () => {
    expect(
      computeNextReconciliationAt({
        finalityState: 'FINAL_DISTINCT',
        siblingEventIds: ['evt-1'],
        firstObservedAtById: { 'evt-1': t0 },
        settlementHorizonMs: horizon,
      }),
    ).toBeNull();
  });
});
