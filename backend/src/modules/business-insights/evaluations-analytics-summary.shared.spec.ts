import {
  buildFinancialSummary,
  buildFleetUtilizationSummary,
  computeOverallStatus,
  deltaPercent,
  resolveAnalyticsPeriodWindows,
  sectionStatusFromResult,
} from '@synq/evaluations-insights/evaluations-analytics-summary';
import type { EvaluationsFinancialSnapshot } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';

describe('evaluations-analytics-summary (shared contract)', () => {
  it('resolveAnalyticsPeriodWindows builds MTD comparison windows', () => {
    const ref = new Date('2026-06-16T12:00:00.000Z');
    const { current, previous } = resolveAnalyticsPeriodWindows('mtd', 'Europe/Berlin', ref);
    expect(current.key).toBe('mtd');
    expect(new Date(previous.to).getTime()).toBeLessThan(new Date(current.from).getTime());
  });

  it('deltaPercent and section status helpers behave consistently', () => {
    expect(deltaPercent(110, 100)).toBe(10);
    expect(sectionStatusFromResult({ ok: false, error: 'x' })).toBe('ERROR');
    expect(
      computeOverallStatus([
        { key: 'a', status: 'OK' },
        { key: 'b', status: 'ERROR' },
      ]),
    ).toBe('PARTIAL');
  });

  it('buildFinancialSummary derives net margin from snapshot', () => {
    const snapshot: EvaluationsFinancialSnapshot = {
      revenueMtdMinor: 200_000,
      revenuePreviousMinor: 150_000,
      expensesMtdMinor: 50_000,
      expensesPreviousMinor: 40_000,
      paidRevenueMtdMinor: 180_000,
      openReceivablesMinor: 10_000,
      overdueReceivablesMinor: 2_000,
      openReceivablesCount: 1,
      overdueReceivablesCount: 1,
      currency: 'EUR',
    };
    const summary = buildFinancialSummary(snapshot);
    expect(summary.netMarginMinor).toBe(150_000);
    const util = buildFleetUtilizationSummary({
      total: 10,
      available: 3,
      rented: 6,
      reserved: 1,
      maintenance: 0,
      blocked: 0,
      other: 0,
      cleaningRequired: 0,
      underutilized: 1,
    });
    expect(util.utilizationPercent).toBe(60);
  });
});
