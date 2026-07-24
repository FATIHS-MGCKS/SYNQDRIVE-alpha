/**
 * Chart series unit tests (Prompt 28/54).
 */
import {
  buildDailyChartSeries,
  chartSeriesHasValues,
  mergeRevenueExpenseChartSeries,
} from './evaluations-chart-series';

describe('evaluations chart series', () => {
  it('uses null gaps instead of zero for empty days', () => {
    const series = buildDailyChartSeries({
      dayCount: 3,
      dayKey: (i) => String(i + 1),
      observations: [{ dayIndex: 1, value: 100 }],
    });
    expect(series[0].value).toBeNull();
    expect(series[1].value).toBe(100);
    expect(series[2].value).toBeNull();
  });

  it('all null when data unavailable', () => {
    const series = buildDailyChartSeries({
      dayCount: 2,
      dayKey: (i) => String(i + 1),
      observations: [{ dayIndex: 0, value: 50 }],
      dataUnavailable: true,
    });
    expect(series.every((p) => p.value === null)).toBe(true);
  });

  it('merge revenue/expense with profit null when both null', () => {
    const merged = mergeRevenueExpenseChartSeries({
      dayCount: 2,
      dayKey: (i) => String(i + 1),
      revenueObservations: [],
      expenseObservations: [],
    });
    expect(merged[0].profit).toBeNull();
  });

  it('chartSeriesHasValues false for all-null', () => {
    expect(chartSeriesHasValues([{ revenue: null, expenses: null }])).toBe(false);
  });
});
