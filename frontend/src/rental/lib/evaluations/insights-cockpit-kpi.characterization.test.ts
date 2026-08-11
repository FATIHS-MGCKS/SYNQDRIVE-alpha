import { describe, expect, it } from 'vitest';
import { partitionInsights } from '../insights-categories';
import { buildManyInsights, insight } from './evaluations-test-fixtures';

/**
 * E3.5: InsightsCockpit no longer aggregates a monetary "estimated financial risk"
 * (that used magnitude-based unit guessing via the removed financialImpactEur).
 * The cockpit now surfaces NON-MONETARY counts. These tests mirror that logic
 * without rendering React.
 */
describe('InsightsCockpit KPI aggregation (E3.5, non-monetary)', () => {
  it('revenue-risk signal is a count of revenue-leakage insights (no € amount)', () => {
    const leakage = insight({
      id: 'leak',
      type: 'LOW_UTILIZATION',
      severity: 'OPPORTUNITY',
      metrics: { lostRevenueEur: 400 },
    });
    const { revenueLeakage } = partitionInsights([leakage]);
    expect(revenueLeakage.length).toBe(1);
  });

  it('critical bookings count equals CRITICAL business risks only', () => {
    const rows = buildManyInsights(5);
    const { businessRisks } = partitionInsights(rows);
    const criticalBookings = businessRisks.filter((i) => i.severity === 'CRITICAL').length;
    expect(criticalBookings).toBeGreaterThan(0);
    expect(criticalBookings).toBeLessThanOrEqual(businessRisks.length);
  });

  it('empty insight list yields zero revenue-risk count', () => {
    const { revenueLeakage } = partitionInsights([]);
    expect(revenueLeakage.length).toBe(0);
  });

  it('financialImpactEur heuristic is no longer exported (removed)', async () => {
    const mod = await import('../insights-categories');
    expect((mod as Record<string, unknown>).financialImpactEur).toBeUndefined();
  });
});
