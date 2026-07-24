import { describe, expect, it } from 'vitest';
import {
  buildForecastSeriesFromSnapshots,
  runBaselineForecast,
} from './evaluations-baseline-forecast';
import {
  DEMAND_MODEL_VERSION,
  FORECAST_HORIZONS_DAYS,
  REVENUE_MODEL_VERSION,
} from './evaluations-forecast.contract';

function dailySeries(
  startDate: string,
  days: number,
  valueFn: (i: number) => number,
): Array<{ observationDate: string; value: number }> {
  const out: Array<{ observationDate: string; value: number }> = [];
  const [y, m, d] = startDate.split('-').map(Number);
  for (let i = 0; i < days; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const date = dt.toISOString().slice(0, 10);
    out.push({ observationDate: date, value: valueFn(i) });
  }
  return out;
}

describe('evaluations-baseline-forecast', () => {
  it('suppresses forecast when history is below minimum', () => {
    const series = buildForecastSeriesFromSnapshots(
      dailySeries('2026-01-01', 20, () => 3).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const result = runBaselineForecast({
      target: 'DEMAND',
      horizonDays: 7,
      series,
      asOfDate: '2026-01-20',
      timezone: 'Europe/Berlin',
    });
    expect(result.status).toBe('INSUFFICIENT_HISTORY');
    expect(result.suppressedReason).toContain('30');
    expect(result.intervalLow).toBe(0);
    expect(result.intervalHigh).toBe(0);
  });

  it('always returns uncertainty interval (no point-only forecast)', () => {
    const series = buildForecastSeriesFromSnapshots(
      dailySeries('2025-10-01', 120, (i) => 5 + (i % 7)).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const result = runBaselineForecast({
      target: 'DEMAND',
      horizonDays: 30,
      series,
      asOfDate: '2026-01-28',
      timezone: 'Europe/Berlin',
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.intervalLow).toBeLessThanOrEqual(result.pointEstimate);
    expect(result.intervalHigh).toBeGreaterThanOrEqual(result.pointEstimate);
    expect(result.modelVersion).toBe(DEMAND_MODEL_VERSION);
    expect(result.evaluation.holdoutDays).toBeGreaterThan(0);
  });

  it('uses issued invoice revenue only (revenue target metadata)', () => {
    const series = buildForecastSeriesFromSnapshots(
      dailySeries('2025-06-01', 200, (i) => (i % 3 === 0 ? 50_000 : 20_000)).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const result = runBaselineForecast({
      target: 'REVENUE',
      horizonDays: 7,
      series,
      asOfDate: '2025-12-17',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
    });
    expect(result.currency).toBe('EUR');
    expect(result.unit).toBe('EUR_minor');
    expect(result.lineage.revenueSource).toBe('invoice_issued_minor');
    expect(result.modelVersion).toBe(REVENUE_MODEL_VERSION);
    expect(result.explainability.topFactors.some((f) => f.factor === 'revenue_basis')).toBe(true);
  });

  it('forecasts utilization as horizon average percent', () => {
    const series = buildForecastSeriesFromSnapshots(
      dailySeries('2025-11-01', 90, (i) => 40 + (i % 5)).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const result = runBaselineForecast({
      target: 'UTILIZATION',
      horizonDays: 7,
      series,
      asOfDate: '2026-01-29',
      timezone: 'Europe/Berlin',
    });
    expect(result.unit).toBe('percent');
    expect(result.pointEstimate).toBeGreaterThanOrEqual(0);
    expect(result.pointEstimate).toBeLessThanOrEqual(100);
    expect(result.intervalHigh).toBeLessThanOrEqual(100);
  });

  it('produces stable output for identical inputs', () => {
    const snapshots = dailySeries('2025-09-01', 100, (i) => 2 + (i % 4));
    const series = buildForecastSeriesFromSnapshots(
      snapshots.map((p) => ({ observationDate: p.observationDate, value: p.value })),
    );
    const input = {
      target: 'DEMAND' as const,
      horizonDays: 7 as const,
      series,
      asOfDate: '2025-12-09',
      timezone: 'Europe/Berlin',
    };
    const a = runBaselineForecast(input);
    const b = runBaselineForecast(input);
    expect(a.pointEstimate).toBe(b.pointEstimate);
    expect(a.evaluation.selectedMethod).toBe(b.evaluation.selectedMethod);
  });

  it('supports all required horizons', () => {
    const series = buildForecastSeriesFromSnapshots(
      dailySeries('2025-01-01', 400, (i) => 10).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    for (const horizon of FORECAST_HORIZONS_DAYS) {
      const result = runBaselineForecast({
        target: 'DEMAND',
        horizonDays: horizon,
        series,
        asOfDate: '2026-02-04',
        timezone: 'Europe/Berlin',
      });
      expect(result.horizonDays).toBe(horizon);
      expect(['AVAILABLE', 'FALLBACK']).toContain(result.status);
      expect(result.intervalHigh).toBeGreaterThanOrEqual(result.pointEstimate);
    }
  });

  it('isolates org-specific series via separate inputs', () => {
    const sparse = buildForecastSeriesFromSnapshots(
      dailySeries('2026-01-01', 35, () => 1).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const dense = buildForecastSeriesFromSnapshots(
      dailySeries('2025-01-01', 400, () => 20).map((p) => ({
        observationDate: p.observationDate,
        value: p.value,
      })),
    );
    const sparseResult = runBaselineForecast({
      target: 'DEMAND',
      horizonDays: 7,
      series: sparse,
      asOfDate: '2026-02-04',
      timezone: 'Europe/Berlin',
    });
    const denseResult = runBaselineForecast({
      target: 'DEMAND',
      horizonDays: 7,
      series: dense,
      asOfDate: '2026-02-04',
      timezone: 'Europe/Berlin',
    });
    expect(sparseResult.pointEstimate).toBeLessThan(denseResult.pointEstimate);
    expect(sparseResult.status).not.toBe('INSUFFICIENT_HISTORY');
  });
});
