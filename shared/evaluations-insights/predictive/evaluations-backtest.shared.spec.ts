import { describe, expect, it } from 'vitest';
import {
  runOperationalForecastBacktest,
  runRiskClassificationBacktest,
  runRiskRegressionBacktest,
  isClassificationMetrics,
} from './evaluations-backtest';
import { evaluateDrift, applyDriftToRegistryStatus } from './evaluations-drift-monitor';

function demandSeries(days: number, base = 10): Array<{ date: string; value: number }> {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    value: base + (i % 7) * 2,
  }));
}

describe('evaluations-backtest', () => {
  it('runs rolling-origin backtest for demand with metrics and gates', () => {
    const result = runOperationalForecastBacktest({
      target: 'DEMAND',
      horizonDays: 7,
      series: demandSeries(200),
      timezone: 'Europe/Berlin',
    });
    expect(result.modelKey).toBe('DEMAND');
    expect(result.metrics).not.toBeNull();
    expect(result.gates.length).toBeGreaterThan(0);
    expect(result.foldRecords.length).toBeGreaterThanOrEqual(4);
    if (result.metrics && !isClassificationMetrics(result.metrics)) {
      expect(result.metrics.mae).not.toBeNull();
      expect(result.metrics.predictionIntervalCoverage).not.toBeNull();
    }
  });

  it('returns insufficient data for short history', () => {
    const result = runOperationalForecastBacktest({
      target: 'DEMAND',
      horizonDays: 7,
      series: demandSeries(20),
      timezone: 'Europe/Berlin',
    });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.metrics).toBeNull();
  });

  it('evaluates risk regression backtest with baseline comparison', () => {
    const folds = Array.from({ length: 6 }, (_, i) => ({
      originDate: `2025-0${i + 1}-01`,
      predicted: 48_000 + i * 100,
      actual: 48_000 + i * 100,
      intervalLow: 40_000,
      intervalHigh: 60_000,
      baselinePredicted: 80_000,
    }));
    const result = runRiskRegressionBacktest({
      riskKey: 'MAINTENANCE_COST',
      horizonDays: 30,
      folds,
    });
    expect(result.status).toBe('PASSED');
    expect(result.metrics).not.toBeNull();
    if (result.metrics && !isClassificationMetrics(result.metrics)) {
      expect(result.metrics.beatBaselineByPercent).not.toBeNull();
    }
  });

  it('evaluates risk classification with precision/recall and FP/FN', () => {
    const folds = [
      { originDate: '2025-01-01', predictedProbability: 0.7, actualPositive: true },
      { originDate: '2025-02-01', predictedProbability: 0.6, actualPositive: true },
      { originDate: '2025-03-01', predictedProbability: 0.2, actualPositive: false },
      { originDate: '2025-04-01', predictedProbability: 0.8, actualPositive: true },
      { originDate: '2025-05-01', predictedProbability: 0.3, actualPositive: false },
      { originDate: '2025-06-01', predictedProbability: 0.55, actualPositive: false },
    ];
    const result = runRiskClassificationBacktest({
      riskKey: 'UNPLANNED_FAILURE',
      horizonDays: 30,
      folds,
    });
    expect(result.metrics).not.toBeNull();
    if (result.metrics && isClassificationMetrics(result.metrics)) {
      expect(result.metrics.precision).not.toBeNull();
      expect(result.metrics.recall).not.toBeNull();
      expect(result.metrics.falsePositives).toBeGreaterThanOrEqual(0);
      expect(result.metrics.falseNegatives).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('evaluations-drift-monitor', () => {
  it('flags critical drift when errors exceed backtest baseline', () => {
    const drift = evaluateDrift({
      modelFamily: 'FORECAST',
      modelKey: 'DEMAND',
      backtestMetrics: {
        foldCount: 8,
        observationCount: 8,
        mae: 5,
        rmse: 6,
        mape: 10,
        smape: 12,
        bias: 0,
        biasPercent: 0,
        predictionIntervalCoverage: 80,
        calibrationError: 0.05,
        baselineMae: 6,
        baselineRmse: 7,
        baselineSmape: 14,
        beatBaselineByPercent: 14,
      },
      recentErrors: Array.from({ length: 10 }, () => ({ actual: 100, predicted: 130 })),
      inputSignals: [{ signal: 'demand.booking_starts_count', recentMean: 50, baselineMean: 30 }],
    });
    expect(['WARNING', 'CRITICAL']).toContain(drift.severity);
    expect(drift.errorDrift.ratio).toBeGreaterThan(1);
  });

  it('rolls back approved model on critical drift fallback', () => {
    const drift = evaluateDrift({
      modelFamily: 'FORECAST',
      modelKey: 'REVENUE',
      backtestMetrics: {
        foldCount: 8,
        observationCount: 8,
        mae: 1000,
        rmse: 1200,
        mape: 10,
        smape: 12,
        bias: 0,
        biasPercent: 0,
        predictionIntervalCoverage: 80,
        calibrationError: 0.05,
        baselineMae: 1100,
        baselineRmse: 1300,
        baselineSmape: 14,
        beatBaselineByPercent: 10,
      },
      recentErrors: Array.from({ length: 10 }, () => ({ actual: 10_000, predicted: 25_000 })),
      inputSignals: [],
    });
    const next = applyDriftToRegistryStatus('APPROVED', drift);
    expect(['ROLLED_BACK', 'DISABLED']).toContain(next);
  });
});
