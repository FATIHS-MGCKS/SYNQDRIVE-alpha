import type { InsightAnalyticsRow } from '@synq/evaluations-insights/insights-analytics.contract';
import {
  computeInsightAnalyticsSummaryCounts,
  matchesInsightAnalyticsFilters,
  sortInsights,
} from '@synq/evaluations-insights/insights-analytics';

function makeInsight(
  id: string,
  overrides: Partial<InsightAnalyticsRow> = {},
): InsightAnalyticsRow {
  return {
    id,
    type: 'STATION_SHORTAGE',
    severity: 'WARNING',
    priority: 50,
    entityIds: ['s1'],
    metrics: { category: 'BUSINESS_RISK' },
    ...overrides,
  };
}

describe('insights-analytics (shared)', () => {
  it('counts 0 insights as zero across categories', () => {
    const counts = computeInsightAnalyticsSummaryCounts([]);
    expect(counts.totalVisible).toBe(0);
    expect(counts.businessRisks).toBe(0);
    expect(counts.revenueLeakage).toBe(0);
    expect(counts.criticalInsights).toBe(0);
  });

  it('counts 4 business-risk insights correctly', () => {
    const insights = Array.from({ length: 4 }, (_, i) =>
      makeInsight(`br-${i}`, { type: 'PICKUP_OVERDUE', priority: 100 - i }),
    );
    const counts = computeInsightAnalyticsSummaryCounts(insights);
    expect(counts.businessRisks).toBe(4);
    expect(counts.totalVisible).toBe(4);
  });

  it('counts 5 insights including revenue leakage', () => {
    const insights = [
      ...Array.from({ length: 4 }, (_, i) => makeInsight(`br-${i}`, { type: 'TIGHT_HANDOVER' })),
      makeInsight('rl-1', { type: 'LOW_UTILIZATION', metrics: null }),
    ];
    const counts = computeInsightAnalyticsSummaryCounts(insights);
    expect(counts.totalVisible).toBe(5);
    expect(counts.businessRisks).toBe(4);
    expect(counts.revenueLeakage).toBe(1);
  });

  it('counts 100 insights deterministically', () => {
    const insights = Array.from({ length: 100 }, (_, i) =>
      makeInsight(`ins-${String(i).padStart(3, '0')}`, {
        type: i % 5 === 0 ? 'LOW_UTILIZATION' : 'STATION_SHORTAGE',
        metrics: i % 5 === 0 ? null : { category: 'BUSINESS_RISK' },
        priority: i,
        severity: i % 10 === 0 ? 'CRITICAL' : 'WARNING',
      }),
    );
    const counts = computeInsightAnalyticsSummaryCounts(insights);
    expect(counts.totalVisible).toBe(100);
    expect(counts.revenueLeakage).toBe(20);
    expect(counts.businessRisks).toBe(80);
    expect(counts.criticalInsights).toBe(10);
  });

  it('paginates sorted insights without changing summary totals', () => {
    const insights = Array.from({ length: 12 }, (_, i) =>
      makeInsight(`p-${i}`, { priority: i, type: 'TIGHT_HANDOVER' }),
    );
    const sorted = sortInsights(insights, 'priority', 'desc');
    const pageSize = 5;
    const page1 = sorted.slice(0, pageSize);
    const page2 = sorted.slice(pageSize, pageSize * 2);

    const fullCounts = computeInsightAnalyticsSummaryCounts(insights);
    const page1Counts = computeInsightAnalyticsSummaryCounts(page1);
    expect(page1).toHaveLength(5);
    expect(page2).toHaveLength(5);
    expect(page1Counts.businessRisks).toBe(5);
    expect(fullCounts.businessRisks).toBe(12);
  });

  it('filters by category and severity', () => {
    const insights = [
      makeInsight('a', { type: 'LOW_UTILIZATION', severity: 'WARNING' }),
      makeInsight('b', { type: 'PICKUP_OVERDUE', severity: 'CRITICAL' }),
      makeInsight('c', { type: 'PICKUP_OVERDUE', severity: 'INFO' }),
    ];
    const filtered = insights.filter((i) =>
      matchesInsightAnalyticsFilters(i, { category: 'BUSINESS_RISK', severity: 'CRITICAL' }),
    );
    expect(filtered.map((i) => i.id)).toEqual(['b']);
  });

  it('hides raw health insights without booking context', () => {
    const insights = [
      makeInsight('visible', { type: 'BATTERY_CRITICAL', metrics: { bookingId: 'b1' } }),
      makeInsight('hidden', { type: 'BATTERY_CRITICAL', metrics: null }),
    ];
    const counts = computeInsightAnalyticsSummaryCounts(insights);
    expect(counts.totalVisible).toBe(1);
  });
});
