/**
 * Drift monitoring for predictive models — pure functions.
 */

import {
  DRIFT_THRESHOLDS,
  type DriftEvaluationResult,
  type DriftInputSignal,
  type DriftRecommendedAction,
  type DriftSeverity,
  type BacktestModelFamily,
  type BacktestModelKey,
  type RegressionBacktestMetrics,
  modelVersionForKey,
} from './evaluations-backtest.contract';

export type DriftMonitorInput = {
  modelFamily: BacktestModelFamily;
  modelKey: BacktestModelKey;
  backtestMetrics: RegressionBacktestMetrics | null;
  recentErrors: Array<{ actual: number; predicted: number }>;
  inputSignals: Array<{ signal: string; recentMean: number; baselineMean: number }>;
};

function computeRecentRegressionErrors(
  errors: Array<{ actual: number; predicted: number }>,
): { mae: number | null; smape: number | null } {
  if (errors.length === 0) return { mae: null, smape: null };
  const abs = errors.map((e) => Math.abs(e.predicted - e.actual));
  const mae = abs.reduce((a, b) => a + b, 0) / errors.length;
  const denom = errors.reduce((a, e) => a + Math.abs(e.actual) + Math.abs(e.predicted), 0);
  const smape =
    denom > 0
      ? (errors.reduce((a, e) => a + Math.abs(e.actual - e.predicted), 0) / denom) * 2 * 100
      : null;
  return {
    mae: Math.round(mae * 100) / 100,
    smape: smape != null ? Math.round(smape * 10) / 10 : null,
  };
}

function evaluateInputDrift(
  signals: Array<{ signal: string; recentMean: number; baselineMean: number }>,
): DriftInputSignal[] {
  return signals.map((s) => {
    const percentChange =
      s.baselineMean !== 0
        ? Math.round(((s.recentMean - s.baselineMean) / Math.abs(s.baselineMean)) * 1000) / 10
        : s.recentMean !== 0
          ? 100
          : 0;
    return {
      signal: s.signal,
      recentMean: s.recentMean,
      baselineMean: s.baselineMean,
      percentChange,
    };
  });
}

function maxInputDriftPercent(inputDrift: DriftInputSignal[]): number {
  if (inputDrift.length === 0) return 0;
  return Math.max(...inputDrift.map((s) => Math.abs(s.percentChange)));
}

export function evaluateDrift(input: DriftMonitorInput): DriftEvaluationResult {
  const limitations = [
    'Drift compares recent live errors to last backtest baseline.',
    'Input drift uses 28-day recent vs prior 28-day feature means.',
  ];

  const inputDrift = evaluateInputDrift(input.inputSignals);
  const recent = computeRecentRegressionErrors(input.recentErrors);
  const backtestMae = input.backtestMetrics?.mae ?? null;
  const backtestSmape = input.backtestMetrics?.smape ?? null;

  const errorRatio =
    recent.mae != null && backtestMae != null && backtestMae > 0
      ? Math.round((recent.mae / backtestMae) * 100) / 100
      : null;
  const smapeRatio =
    recent.smape != null && backtestSmape != null && backtestSmape > 0
      ? Math.round((recent.smape / backtestSmape) * 100) / 100
      : null;

  const inputDriftMax = maxInputDriftPercent(inputDrift);

  let severity: DriftSeverity = 'STABLE';
  let recommendedAction: DriftRecommendedAction = 'NONE';

  const errorCritical =
    (errorRatio != null && errorRatio >= DRIFT_THRESHOLDS.errorRatioCritical) ||
    (smapeRatio != null && smapeRatio >= DRIFT_THRESHOLDS.smapeRatioCritical);
  const errorWarning =
    (errorRatio != null && errorRatio >= DRIFT_THRESHOLDS.errorRatioWarning) ||
    (smapeRatio != null && smapeRatio >= DRIFT_THRESHOLDS.smapeRatioWarning);
  const inputCritical = inputDriftMax >= DRIFT_THRESHOLDS.inputPercentCritical;
  const inputWarning = inputDriftMax >= DRIFT_THRESHOLDS.inputPercentWarning;

  if (errorCritical || inputCritical) {
    severity = 'CRITICAL';
    recommendedAction = 'FALLBACK';
    limitations.push('Critical drift — automatic fallback recommended.');
  } else if (errorWarning || inputWarning) {
    severity = 'WARNING';
    recommendedAction = 'NONE';
    limitations.push('Warning drift — monitor closely; no auto-disable in v1.');
  }

  if (errorRatio != null && errorRatio >= DRIFT_THRESHOLDS.errorRatioCritical * 1.25) {
    recommendedAction = 'DISABLE';
    limitations.push('Severe error drift — disable model until re-backtest.');
  }

  return {
    modelFamily: input.modelFamily,
    modelKey: input.modelKey,
    modelVersion: modelVersionForKey(input.modelFamily, input.modelKey),
    severity,
    recommendedAction,
    inputDrift,
    errorDrift: {
      recentMae: recent.mae,
      backtestMae,
      ratio: errorRatio,
      recentSmape: recent.smape,
      backtestSmape,
      smapeRatio,
    },
    evaluatedAt: new Date().toISOString(),
    limitations,
  };
}

export function applyDriftToRegistryStatus(
  currentStatus: string,
  drift: DriftEvaluationResult,
): 'DRAFT' | 'SHADOW' | 'APPROVED' | 'DISABLED' | 'ROLLED_BACK' {
  if (drift.recommendedAction === 'DISABLE') return 'DISABLED';
  if (drift.recommendedAction === 'FALLBACK' && currentStatus === 'APPROVED') {
    return 'ROLLED_BACK';
  }
  return currentStatus as 'DRAFT' | 'SHADOW' | 'APPROVED' | 'DISABLED' | 'ROLLED_BACK';
}
