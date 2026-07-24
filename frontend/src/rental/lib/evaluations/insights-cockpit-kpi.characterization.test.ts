import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import { financialImpactEur, partitionInsights } from '../insights-categories';
import { buildManyInsights, insight } from './evaluations-test-fixtures';

/**
 * Mirrors InsightsCockpit estimated-risk aggregation without rendering React.
 * Characterization — includes known legacy prop semantics (financialRiskEur = overdue only).
 */
function computeEstimatedRiskEur(financialRiskEurProp: number, insights: DashboardInsight[]): number {
  const { businessRisks, revenueLeakage } = partitionInsights(insights);
  let sum = financialRiskEurProp;
  for (const i of [...businessRisks, ...revenueLeakage]) {
    const e = financialImpactEur(i);
    if (e != null) sum += e;
  }
  return sum;
}

describe('InsightsCockpit KPI aggregation (characterization)', () => {
  it('characterization: financialRiskEur prop is treated as overdue EUR base (legacy naming)', () => {
    const overdueEur = 250;
    const rows = buildManyInsights(2);
    const estimated = computeEstimatedRiskEur(overdueEur, rows);
    expect(estimated).toBeGreaterThanOrEqual(overdueEur);
  });

  it('adds lostRevenueEur from LOW_UTILIZATION insights to estimated risk', () => {
    const leakage = insight({
      id: 'leak',
      type: 'LOW_UTILIZATION',
      severity: 'OPPORTUNITY',
      metrics: { lostRevenueEur: 400 },
    });
    const estimated = computeEstimatedRiskEur(0, [leakage]);
    expect(estimated).toBe(400);
  });

  it('critical bookings count equals CRITICAL business risks only', () => {
    const rows = buildManyInsights(5);
    const { businessRisks } = partitionInsights(rows);
    const criticalBookings = businessRisks.filter((i) => i.severity === 'CRITICAL').length;
    expect(criticalBookings).toBeGreaterThan(0);
    expect(criticalBookings).toBeLessThanOrEqual(businessRisks.length);
  });

  it('empty insight list yields zero incremental risk above overdue prop', () => {
    expect(computeEstimatedRiskEur(100, [])).toBe(100);
  });
});
