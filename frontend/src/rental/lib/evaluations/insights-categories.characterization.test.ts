import { describe, expect, it } from 'vitest';
import {
  financialImpactEur,
  financialImpactMoney,
  insightRecommendation,
  isVisibleOnInsightsPage,
  matchesStationIdFilter,
  partitionInsights,
  resolveInsightCategory,
} from '../insights-categories';
import {
  INSIGHT_STATION_A,
  INSIGHT_STATION_B,
  SCENARIO_GROUPED_INSIGHT,
  VEHICLE_STATION_MAP,
  buildManyInsights,
  insight,
} from './evaluations-test-fixtures';

describe('insights-categories (characterization)', () => {
  it('partitions more than four insights across business and leakage buckets', () => {
    const many = buildManyInsights(6);
    const { businessRisks, revenueLeakage, recommended } = partitionInsights(many);

    expect(many).toHaveLength(6);
    expect(businessRisks.length + revenueLeakage.length).toBeGreaterThan(0);
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended[0].priority).toBeGreaterThanOrEqual(recommended[recommended.length - 1].priority);
  });

  it('keeps grouped insights visible with groupCount > 1', () => {
    expect(SCENARIO_GROUPED_INSIGHT.isGrouped).toBe(true);
    expect(SCENARIO_GROUPED_INSIGHT.groupCount).toBe(3);
    const { revenueLeakage } = partitionInsights([SCENARIO_GROUPED_INSIGHT]);
    expect(revenueLeakage).toHaveLength(1);
    expect(resolveInsightCategory(SCENARIO_GROUPED_INSIGHT)).toBe('REVENUE_LEAKAGE');
  });

  it('filters insights by station when stationId is set', () => {
    const all = [INSIGHT_STATION_A, INSIGHT_STATION_B];
    const filtered = all.filter((i) => matchesStationIdFilter(i, 'station-a', VEHICLE_STATION_MAP));
    expect(filtered.map((i) => i.id)).toEqual(['sta-a']);
  });

  it('hides raw health insights without booking context', () => {
    const hidden = insight({
      id: 'bat',
      type: 'BATTERY_CRITICAL',
      severity: 'CRITICAL',
      metrics: {},
    });
    const visible = insight({
      id: 'bat-booked',
      type: 'BATTERY_CRITICAL',
      severity: 'CRITICAL',
      metrics: { bookingId: 'booking-1' },
    });
    expect(isVisibleOnInsightsPage(hidden)).toBe(false);
    expect(isVisibleOnInsightsPage(visible)).toBe(true);
  });

  describe('financialImpact money domain', () => {
    it('reads canonical financialImpactAmountMinor', () => {
      const row = insight({
        id: 'impact-cents',
        type: 'BATTERY_CRITICAL',
        metrics: {
          financialImpactAmountMinor: 12_500,
          financialImpactCurrency: 'EUR',
          bookingId: 'b1',
        },
      });
      expect(financialImpactMoney(row)?.amountMinor).toBe(12_500);
      expect(financialImpactEur(row)).toBe(125);
    });

    it('reads canonical lostRevenueAmountMinor', () => {
      const row = insight({
        id: 'impact-eur',
        type: 'LOW_UTILIZATION',
        metrics: { lostRevenueAmountMinor: 35_000, lostRevenueCurrency: 'EUR' },
      });
      expect(financialImpactEur(row)).toBe(350);
    });

    it('does not use magnitude heuristics for small canonical minor amounts', () => {
      const row = insight({
        id: 'impact-small-cents',
        type: 'BATTERY_CRITICAL',
        metrics: {
          financialImpactAmountMinor: 500,
          financialImpactCurrency: 'EUR',
          bookingId: 'b1',
        },
      });
      expect(financialImpactEur(row)).toBe(5);
    });

    it('still reads legacy fields when canonical is absent', () => {
      const row = insight({
        id: 'legacy',
        type: 'LOW_UTILIZATION',
        metrics: { lostRevenueEur: 350 },
      });
      expect(financialImpactEur(row)).toBe(350);
    });
  });

  it('uses metrics.recommendation when present', () => {
    const row = insight({
      id: 'rec',
      type: 'TIGHT_HANDOVER',
      metrics: { recommendation: 'Custom operator hint' },
      actionLabel: 'Fallback label',
    });
    expect(insightRecommendation(row)).toBe('Custom operator hint');
  });

  it('falls back to type-specific DE copy for PICKUP_OVERDUE', () => {
    const row = insight({ id: 'pickup', type: 'PICKUP_OVERDUE' });
    expect(insightRecommendation(row)).toContain('Kunde kontaktieren');
  });
});
