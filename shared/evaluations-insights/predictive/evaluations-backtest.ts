/**
 * Rolling-origin backtesting and release gate evaluation — pure functions.
 */

import { runBaselineForecast } from './evaluations-baseline-forecast';
import {
  BACKTEST_MIN_FOLDS,
  BACKTEST_PLATFORM_VERSION,
  DEFAULT_FEATURE_SET_VERSION,
  RELEASE_GATES,
  type BacktestEvaluationResult,
  type BacktestFoldRecord,
  type BacktestMetrics,
  type BacktestModelFamily,
  type BacktestModelKey,
  type BacktestResultStatus,
  type ClassificationBacktestMetrics,
  type ModelScopeMode,
  type OperationalBacktestInput,
  type RegressionBacktestMetrics,
  type ReleaseGateResult,
  type RiskClassificationBacktestInput,
  type RiskRegressionBacktestInput,
  isClassificationMetrics,
  modelVersionForKey,
  platformVersionForFamily,
} from './evaluations-backtest.contract';
import type { ForecastTarget } from './evaluations-forecast.contract';
import { FORECAST_MIN_HISTORY } from './evaluations-forecast.contract';

function shiftDate(dateOnly: string, offset: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function aggregateHorizon(target: ForecastTarget, values: number[]): number {
  if (values.length === 0) return 0;
  if (target === 'UTILIZATION') {
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }
  return Math.round(values.reduce((a, b) => a + b, 0));
}

function aggregateActual(target: ForecastTarget, points: Array<{ value: number }>): number {
  return aggregateHorizon(
    target,
    points.map((p) => p.value),
  );
}

function movingAverageBaseline(
  history: Array<{ value: number }>,
  horizonDays: number,
  target: ForecastTarget,
): number {
  if (history.length === 0) return 0;
  const window = history.slice(-14);
  const avg = window.reduce((a, p) => a + p.value, 0) / window.length;
  if (target === 'UTILIZATION') return Math.round(avg * 10) / 10;
  return Math.round(avg * horizonDays);
}

function computeRegressionMetrics(folds: BacktestFoldRecord[]): RegressionBacktestMetrics {
  if (folds.length === 0) {
    return {
      foldCount: 0,
      observationCount: 0,
      mae: null,
      rmse: null,
      mape: null,
      smape: null,
      bias: null,
      biasPercent: null,
      predictionIntervalCoverage: null,
      calibrationError: null,
      baselineMae: null,
      baselineRmse: null,
      baselineSmape: null,
      beatBaselineByPercent: null,
    };
  }

  const errors = folds.map((f) => f.predicted - f.actual);
  const absErrors = errors.map(Math.abs);
  const sqErrors = errors.map((e) => e ** 2);
  const mae = absErrors.reduce((a, b) => a + b, 0) / folds.length;
  const rmse = Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / folds.length);
  const bias = errors.reduce((a, b) => a + b, 0) / folds.length;
  const meanActual = folds.reduce((a, f) => a + f.actual, 0) / folds.length;
  const biasPercent = meanActual !== 0 ? (bias / meanActual) * 100 : null;

  const mapePairs = folds.filter((f) => f.actual !== 0);
  const mape =
    mapePairs.length > 0
      ? (mapePairs.reduce((a, f) => a + Math.abs((f.actual - f.predicted) / f.actual), 0) /
          mapePairs.length) *
        100
      : null;

  const smapeDenom = folds.reduce((a, f) => a + Math.abs(f.actual) + Math.abs(f.predicted), 0);
  const smape =
    smapeDenom > 0
      ? (folds.reduce((a, f) => a + Math.abs(f.actual - f.predicted), 0) / smapeDenom) * 2 * 100
      : null;

  const pic =
    (folds.filter((f) => f.inInterval).length / folds.length) * 100;

  const calibrationError =
    folds.reduce((a, f) => a + Math.abs(f.predicted - f.actual) / Math.max(1, Math.abs(f.actual)), 0) /
    folds.length;

  const baselineErrors = folds.map((f) => Math.abs(f.baselinePredicted - f.actual));
  const baselineMae = baselineErrors.reduce((a, b) => a + b, 0) / folds.length;
  const baselineRmse = Math.sqrt(
    folds.reduce((a, f) => a + (f.baselinePredicted - f.actual) ** 2, 0) / folds.length,
  );
  const baselineSmapeDenom = folds.reduce(
    (a, f) => a + Math.abs(f.actual) + Math.abs(f.baselinePredicted),
    0,
  );
  const baselineSmape =
    baselineSmapeDenom > 0
      ? (folds.reduce((a, f) => a + Math.abs(f.actual - f.baselinePredicted), 0) /
          baselineSmapeDenom) *
        2 *
        100
      : null;

  const beatBaselineByPercent =
    baselineSmape != null && smape != null && baselineSmape > 0
      ? Math.round(((baselineSmape - smape) / baselineSmape) * 1000) / 10
      : null;

  return {
    foldCount: folds.length,
    observationCount: folds.length,
    mae: Math.round(mae * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    mape: mape != null ? Math.round(mape * 10) / 10 : null,
    smape: smape != null ? Math.round(smape * 10) / 10 : null,
    bias: Math.round(bias * 100) / 100,
    biasPercent: biasPercent != null ? Math.round(biasPercent * 10) / 10 : null,
    predictionIntervalCoverage: Math.round(pic * 10) / 10,
    calibrationError: Math.round(calibrationError * 1000) / 1000,
    baselineMae: Math.round(baselineMae * 100) / 100,
    baselineRmse: Math.round(baselineRmse * 100) / 100,
    baselineSmape: baselineSmape != null ? Math.round(baselineSmape * 10) / 10 : null,
    beatBaselineByPercent,
  };
}

function computeClassificationMetrics(
  folds: Array<{ predictedProbability: number; actualPositive: boolean }>,
  threshold: number,
): ClassificationBacktestMetrics {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (const fold of folds) {
    const predicted = fold.predictedProbability >= threshold;
    if (predicted && fold.actualPositive) tp += 1;
    else if (!predicted && !fold.actualPositive) tn += 1;
    else if (predicted && !fold.actualPositive) fp += 1;
    else fn += 1;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision != null && recall != null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  const brierScore =
    folds.length > 0
      ? folds.reduce(
          (a, f) => a + (f.predictedProbability - (f.actualPositive ? 1 : 0)) ** 2,
          0,
        ) / folds.length
      : null;

  const bins = 5;
  const calibrationError = (() => {
    if (folds.length === 0) return null;
    let total = 0;
    for (let i = 0; i < bins; i += 1) {
      const low = i / bins;
      const high = (i + 1) / bins;
      const inBin = folds.filter(
        (f) => f.predictedProbability >= low && (i === bins - 1 ? f.predictedProbability <= high : f.predictedProbability < high),
      );
      if (inBin.length === 0) continue;
      const avgPred = inBin.reduce((a, f) => a + f.predictedProbability, 0) / inBin.length;
      const avgActual = inBin.filter((f) => f.actualPositive).length / inBin.length;
      total += Math.abs(avgPred - avgActual);
    }
    return Math.round((total / bins) * 1000) / 1000;
  })();

  return {
    foldCount: folds.length,
    observationCount: folds.length,
    threshold,
    precision: precision != null ? Math.round(precision * 1000) / 1000 : null,
    recall: recall != null ? Math.round(recall * 1000) / 1000 : null,
    f1: f1 != null ? Math.round(f1 * 1000) / 1000 : null,
    falsePositives: fp,
    falseNegatives: fn,
    truePositives: tp,
    trueNegatives: tn,
    brierScore: brierScore != null ? Math.round(brierScore * 1000) / 1000 : null,
    calibrationError,
  };
}

export function evaluateRegressionReleaseGates(
  family: BacktestModelFamily,
  metrics: RegressionBacktestMetrics,
): ReleaseGateResult[] {
  const gates = RELEASE_GATES[family];
  const results: ReleaseGateResult[] = [];

  results.push({
    gate: 'min_folds',
    passed: metrics.foldCount >= gates.minFolds,
    actual: metrics.foldCount,
    threshold: gates.minFolds,
    message: `Requires ≥${gates.minFolds} rolling-origin folds`,
  });

  if (metrics.smape != null) {
    results.push({
      gate: 'max_smape',
      passed: metrics.smape <= gates.maxSmapePercent,
      actual: metrics.smape,
      threshold: gates.maxSmapePercent,
      message: `sMAPE must be ≤${gates.maxSmapePercent}%`,
    });
  }

  if (metrics.mape != null) {
    results.push({
      gate: 'max_mape',
      passed: metrics.mape <= gates.maxMapePercent,
      actual: metrics.mape,
      threshold: gates.maxMapePercent,
      message: `MAPE must be ≤${gates.maxMapePercent}%`,
    });
  }

  if (metrics.biasPercent != null) {
    results.push({
      gate: 'max_bias',
      passed: Math.abs(metrics.biasPercent) <= gates.maxBiasPercent,
      actual: metrics.biasPercent,
      threshold: gates.maxBiasPercent,
      message: `Bias must be within ±${gates.maxBiasPercent}% of mean actual`,
    });
  }

  if (metrics.predictionIntervalCoverage != null) {
    results.push({
      gate: 'min_interval_coverage',
      passed: metrics.predictionIntervalCoverage >= gates.minIntervalCoveragePercent,
      actual: metrics.predictionIntervalCoverage,
      threshold: gates.minIntervalCoveragePercent,
      message: `Prediction interval coverage must be ≥${gates.minIntervalCoveragePercent}%`,
    });
  }

  if (metrics.calibrationError != null) {
    results.push({
      gate: 'max_calibration_error',
      passed: metrics.calibrationError <= gates.maxCalibrationError,
      actual: metrics.calibrationError,
      threshold: gates.maxCalibrationError,
      message: `Calibration error must be ≤${gates.maxCalibrationError}`,
    });
  }

  if (metrics.beatBaselineByPercent != null) {
    results.push({
      gate: 'beat_baseline',
      passed: metrics.beatBaselineByPercent >= gates.minBeatBaselinePercent,
      actual: metrics.beatBaselineByPercent,
      threshold: gates.minBeatBaselinePercent,
      message: `Must beat naive baseline by ≥${gates.minBeatBaselinePercent}% relative sMAPE`,
    });
  }

  return results;
}

export function evaluateClassificationReleaseGates(
  family: BacktestModelFamily,
  metrics: ClassificationBacktestMetrics,
): ReleaseGateResult[] {
  const gates = RELEASE_GATES[family];
  const results: ReleaseGateResult[] = [];

  results.push({
    gate: 'min_folds',
    passed: metrics.foldCount >= gates.minFolds,
    actual: metrics.foldCount,
    threshold: gates.minFolds,
    message: `Requires ≥${gates.minFolds} rolling-origin folds`,
  });

  if (metrics.precision != null) {
    results.push({
      gate: 'min_precision',
      passed: metrics.precision >= gates.minPrecision,
      actual: metrics.precision,
      threshold: gates.minPrecision,
      message: `Precision must be ≥${gates.minPrecision}`,
    });
  }

  if (metrics.recall != null) {
    results.push({
      gate: 'min_recall',
      passed: metrics.recall >= gates.minRecall,
      actual: metrics.recall,
      threshold: gates.minRecall,
      message: `Recall must be ≥${gates.minRecall}`,
    });
  }

  if (metrics.brierScore != null) {
    results.push({
      gate: 'max_brier',
      passed: metrics.brierScore <= gates.maxBrierScore,
      actual: metrics.brierScore,
      threshold: gates.maxBrierScore,
      message: `Brier score must be ≤${gates.maxBrierScore}`,
    });
  }

  if (metrics.calibrationError != null) {
    results.push({
      gate: 'max_calibration_error',
      passed: metrics.calibrationError <= gates.maxCalibrationError,
      actual: metrics.calibrationError,
      threshold: gates.maxCalibrationError,
      message: `Calibration error must be ≤${gates.maxCalibrationError}`,
    });
  }

  return results;
}

function finalizeEvaluation(
  family: BacktestModelFamily,
  modelKey: BacktestModelKey,
  horizonDays: number,
  scopeMode: ModelScopeMode,
  scopeKey: string,
  status: BacktestResultStatus,
  metrics: BacktestMetrics | null,
  baselineMetrics: RegressionBacktestMetrics | null,
  gates: ReleaseGateResult[],
  foldRecords: BacktestFoldRecord[],
  limitations: string[],
): BacktestEvaluationResult {
  return {
    modelFamily: family,
    modelKey,
    modelVersion: modelVersionForKey(family, modelKey),
    featureSetVersion: DEFAULT_FEATURE_SET_VERSION,
    platformVersion: BACKTEST_PLATFORM_VERSION,
    horizonDays,
    scopeMode,
    scopeKey,
    status,
    metrics,
    baselineMetrics,
    gates,
    gatesPassed: status === 'PASSED' && gates.every((g) => g.passed),
    foldRecords,
    limitations,
    evaluatedAt: new Date().toISOString(),
  };
}

export function runOperationalForecastBacktest(
  input: OperationalBacktestInput,
): BacktestEvaluationResult {
  const scopeKey = input.scopeKey ?? 'fleet';
  const originStepDays = input.originStepDays ?? 7;
  const maxOrigins = input.maxOrigins ?? 12;
  const minTrainDays = input.minTrainDays ?? FORECAST_MIN_HISTORY[input.target].ruleBased;

  const series = [...input.series].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = series[series.length - 1]?.date;
  const limitations: string[] = [
    'Rolling-origin backtest on fleet-scoped feature snapshots.',
    'Naive baseline: 14-day moving average scaled to horizon.',
  ];

  if (!lastDate || series.length < minTrainDays + input.horizonDays) {
    return finalizeEvaluation(
      'FORECAST',
      input.target,
      input.horizonDays,
      'ORG_SPECIFIC',
      scopeKey,
      'INSUFFICIENT_DATA',
      null,
      null,
      [],
      [],
      [
        ...limitations,
        `Requires ≥${minTrainDays + input.horizonDays} days of history; got ${series.length}.`,
      ],
    );
  }

  const folds: BacktestFoldRecord[] = [];
  const firstOrigin = shiftDate(lastDate, -(maxOrigins * originStepDays + input.horizonDays));

  for (let i = 0; i < maxOrigins; i += 1) {
    const originDate = shiftDate(lastDate, -(i + 1) * originStepDays);
    if (originDate < firstOrigin) break;

    const trainSeries = series.filter((p) => p.date <= originDate);
    if (trainSeries.length < minTrainDays) continue;

    const horizonEnd = shiftDate(originDate, input.horizonDays);
    const actualPoints = series.filter((p) => p.date > originDate && p.date <= horizonEnd);
    if (actualPoints.length === 0) continue;

    const forecast = runBaselineForecast({
      target: input.target,
      horizonDays: input.horizonDays,
      series: trainSeries,
      asOfDate: originDate,
      timezone: input.timezone,
    });

    if (forecast.status === 'INSUFFICIENT_HISTORY') continue;

    const actual = aggregateActual(input.target, actualPoints);
    const baselinePredicted = movingAverageBaseline(trainSeries, input.horizonDays, input.target);
    const inInterval = actual >= forecast.intervalLow && actual <= forecast.intervalHigh;

    folds.push({
      originDate,
      horizonDays: input.horizonDays,
      predicted: forecast.pointEstimate,
      actual,
      intervalLow: forecast.intervalLow,
      intervalHigh: forecast.intervalHigh,
      baselinePredicted,
      inInterval,
    });
  }

  if (folds.length < BACKTEST_MIN_FOLDS) {
    return finalizeEvaluation(
      'FORECAST',
      input.target,
      input.horizonDays,
      'ORG_SPECIFIC',
      scopeKey,
      'INSUFFICIENT_DATA',
      null,
      null,
      [],
      folds,
      [...limitations, `Only ${folds.length} folds available; need ≥${BACKTEST_MIN_FOLDS}.`],
    );
  }

  const metrics = computeRegressionMetrics(folds);
  const baselineMetrics = computeRegressionMetrics(
    folds.map((f) => ({
      ...f,
      predicted: f.baselinePredicted,
    })),
  );
  const gates = evaluateRegressionReleaseGates('FORECAST', metrics);
  const status: BacktestResultStatus = gates.every((g) => g.passed) ? 'PASSED' : 'FAILED';

  if (input.target === 'REVENUE') {
    limitations.push('MAPE/sMAPE computed on issued invoice revenue only.');
  }

  return finalizeEvaluation(
    'FORECAST',
    input.target,
    input.horizonDays,
    'ORG_SPECIFIC',
    scopeKey,
    status,
    metrics,
    baselineMetrics,
    gates,
    folds,
    limitations,
  );
}

export function runRiskRegressionBacktest(
  input: RiskRegressionBacktestInput,
): BacktestEvaluationResult {
  const scopeKey = input.scopeKey ?? 'fleet';
  const limitations = [
    'Risk regression backtest uses historical predicted vs actual horizon outcomes.',
    'ORG_SPECIFIC scope — not a pooled cross-tenant model.',
  ];

  if (input.folds.length < BACKTEST_MIN_FOLDS) {
    return finalizeEvaluation(
      'RISK',
      input.riskKey,
      input.horizonDays,
      'ORG_SPECIFIC',
      scopeKey,
      'INSUFFICIENT_DATA',
      null,
      null,
      [],
      [],
      [...limitations, `Only ${input.folds.length} folds; need ≥${BACKTEST_MIN_FOLDS}.`],
    );
  }

  const foldRecords: BacktestFoldRecord[] = input.folds.map((f) => ({
    originDate: f.originDate,
    horizonDays: input.horizonDays,
    predicted: f.predicted,
    actual: f.actual,
    intervalLow: f.intervalLow,
    intervalHigh: f.intervalHigh,
    baselinePredicted: f.baselinePredicted,
    inInterval: f.actual >= f.intervalLow && f.actual <= f.intervalHigh,
  }));

  const metrics = computeRegressionMetrics(foldRecords);
  const baselineMetrics = computeRegressionMetrics(
    foldRecords.map((f) => ({ ...f, predicted: f.baselinePredicted })),
  );
  const gates = evaluateRegressionReleaseGates('RISK', metrics);
  const status: BacktestResultStatus = gates.every((g) => g.passed) ? 'PASSED' : 'FAILED';

  return finalizeEvaluation(
    'RISK',
    input.riskKey,
    input.horizonDays,
    'ORG_SPECIFIC',
    scopeKey,
    status,
    metrics,
    baselineMetrics,
    gates,
    foldRecords,
    limitations,
  );
}

export function runRiskClassificationBacktest(
  input: RiskClassificationBacktestInput,
): BacktestEvaluationResult {
  const scopeKey = input.scopeKey ?? 'fleet';
  const threshold = input.threshold ?? 0.5;
  const limitations = [
    'Risk classification backtest at fixed probability threshold.',
    'Not a calibrated per-vehicle failure model.',
  ];

  if (input.folds.length < BACKTEST_MIN_FOLDS) {
    return finalizeEvaluation(
      'RISK',
      input.riskKey,
      input.horizonDays,
      'ORG_SPECIFIC',
      scopeKey,
      'INSUFFICIENT_DATA',
      null,
      null,
      [],
      [],
      [...limitations, `Only ${input.folds.length} folds; need ≥${BACKTEST_MIN_FOLDS}.`],
    );
  }

  const metrics = computeClassificationMetrics(input.folds, threshold);
  const gates = evaluateClassificationReleaseGates('RISK', metrics);
  const status: BacktestResultStatus = gates.every((g) => g.passed) ? 'PASSED' : 'FAILED';

  return finalizeEvaluation(
    'RISK',
    input.riskKey,
    input.horizonDays,
    'ORG_SPECIFIC',
    scopeKey,
    status,
    metrics,
    null,
    gates,
    [],
    limitations,
  );
}

export function deriveRegistryStatusFromBacktest(
  evaluation: BacktestEvaluationResult,
  currentStatus: string | null,
): 'DRAFT' | 'SHADOW' | 'APPROVED' | 'DISABLED' | 'ROLLED_BACK' {
  if (evaluation.status === 'INSUFFICIENT_DATA') return 'DRAFT';
  if (!evaluation.gatesPassed) return 'DRAFT';
  if (currentStatus === 'APPROVED' || currentStatus === 'SHADOW') return currentStatus;
  return 'SHADOW';
}

export function shouldUseFallback(
  registryStatus: string,
  driftSeverity: 'STABLE' | 'WARNING' | 'CRITICAL',
): boolean {
  if (registryStatus === 'DISABLED' || registryStatus === 'ROLLED_BACK') return true;
  if (driftSeverity === 'CRITICAL') return true;
  return false;
}

export { platformVersionForFamily, isClassificationMetrics };
