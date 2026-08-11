import { describe, expect, it } from 'vitest';
import {
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

  // E3.5: the `financialImpactEur` magnitude-based unit-guessing heuristic was
  // removed (unsafe; not a canonical Finance metric). No monetary insight impact is
  // computed or displayed anymore.

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
