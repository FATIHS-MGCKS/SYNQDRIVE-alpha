/**
 * Backtesting, release gates, and drift monitoring contracts (Prompt 44/54).
 */

import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';
import {
  FORECAST_HORIZONS_DAYS,
  FORECAST_MODEL_VERSIONS,
  FORECAST_PLATFORM_VERSION,
  type ForecastHorizonDays,
  type ForecastTarget,
} from './evaluations-forecast.contract';
import {
  RISK_FORECAST_HORIZONS_DAYS,
  RISK_MODEL_VERSIONS,
  RISK_FORECAST_PLATFORM_VERSION,
  type RiskForecastHorizonDays,
  type RiskForecastTarget,
} from './evaluations-maintenance-risk.contract';

export const BACKTEST_PLATFORM_VERSION = 'backtest-v1';

export type BacktestModelFamily = 'FORECAST' | 'RISK';

export type BacktestModelKey = ForecastTarget | RiskForecastTarget;

export type ModelScopeMode = 'GLOBAL_SEGMENT' | 'ORG_SPECIFIC';

export type ModelRegistryStatus =
  | 'DRAFT'
  | 'SHADOW'
  | 'APPROVED'
  | 'DISABLED'
  | 'ROLLED_BACK';

export type BacktestResultStatus = 'PASSED' | 'FAILED' | 'INSUFFICIENT_DATA';

export type DriftSeverity = 'STABLE' | 'WARNING' | 'CRITICAL';

export type DriftRecommendedAction = 'NONE' | 'FALLBACK' | 'DISABLE';

export type BacktestFoldRecord = {
  originDate: string;
  horizonDays: number;
  predicted: number;
  actual: number;
  intervalLow: number;
  intervalHigh: number;
  baselinePredicted: number;
  inInterval: boolean;
};

export type RegressionBacktestMetrics = {
  foldCount: number;
  observationCount: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  smape: number | null;
  bias: number | null;
  biasPercent: number | null;
  predictionIntervalCoverage: number | null;
  calibrationError: number | null;
  baselineMae: number | null;
  baselineRmse: number | null;
  baselineSmape: number | null;
  beatBaselineByPercent: number | null;
};

export type ClassificationBacktestMetrics = {
  foldCount: number;
  observationCount: number;
  threshold: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositives: number;
  falseNegatives: number;
  truePositives: number;
  trueNegatives: number;
  brierScore: number | null;
  calibrationError: number | null;
};

export type BacktestMetrics = RegressionBacktestMetrics | ClassificationBacktestMetrics;

export function isClassificationMetrics(
  metrics: BacktestMetrics,
): metrics is ClassificationBacktestMetrics {
  return 'precision' in metrics && 'falsePositives' in metrics;
}

export type ReleaseGateResult = {
  gate: string;
  passed: boolean;
  actual: number | string | null;
  threshold: number | string;
  message: string;
};

export type BacktestEvaluationResult = {
  modelFamily: BacktestModelFamily;
  modelKey: BacktestModelKey;
  modelVersion: string;
  featureSetVersion: string;
  platformVersion: string;
  horizonDays: number;
  scopeMode: ModelScopeMode;
  scopeKey: string;
  status: BacktestResultStatus;
  metrics: BacktestMetrics | null;
  baselineMetrics: RegressionBacktestMetrics | null;
  gates: ReleaseGateResult[];
  gatesPassed: boolean;
  foldRecords: BacktestFoldRecord[];
  limitations: string[];
  evaluatedAt: string;
};

export type DriftInputSignal = {
  signal: string;
  recentMean: number;
  baselineMean: number;
  percentChange: number;
};

export type DriftEvaluationResult = {
  modelFamily: BacktestModelFamily;
  modelKey: BacktestModelKey;
  modelVersion: string;
  severity: DriftSeverity;
  recommendedAction: DriftRecommendedAction;
  inputDrift: DriftInputSignal[];
  errorDrift: {
    recentMae: number | null;
    backtestMae: number | null;
    ratio: number | null;
    recentSmape: number | null;
    backtestSmape: number | null;
    smapeRatio: number | null;
  };
  evaluatedAt: string;
  limitations: string[];
};

export type OperationalBacktestInput = {
  target: ForecastTarget;
  horizonDays: ForecastHorizonDays;
  series: Array<{ date: string; value: number }>;
  timezone: string;
  scopeKey?: string;
  originStepDays?: number;
  maxOrigins?: number;
  minTrainDays?: number;
};

export type RiskRegressionBacktestInput = {
  riskKey: Extract<RiskForecastTarget, 'MAINTENANCE_COST' | 'EXPECTED_DOWNTIME' | 'COST_RISK'>;
  horizonDays: RiskForecastHorizonDays;
  folds: Array<{
    originDate: string;
    predicted: number;
    actual: number;
    intervalLow: number;
    intervalHigh: number;
    baselinePredicted: number;
  }>;
  scopeKey?: string;
};

export type RiskClassificationBacktestInput = {
  riskKey: Extract<RiskForecastTarget, 'UNPLANNED_FAILURE' | 'CAPACITY_RISK'>;
  horizonDays: RiskForecastHorizonDays;
  threshold?: number;
  folds: Array<{
    originDate: string;
    predictedProbability: number;
    actualPositive: boolean;
  }>;
  scopeKey?: string;
};

export const FORECAST_BACKTEST_TARGETS: ForecastTarget[] = ['DEMAND', 'REVENUE', 'UTILIZATION'];
export const RISK_REGRESSION_TARGETS: Array<
  Extract<RiskForecastTarget, 'MAINTENANCE_COST' | 'EXPECTED_DOWNTIME' | 'COST_RISK'>
> = ['MAINTENANCE_COST', 'EXPECTED_DOWNTIME', 'COST_RISK'];
export const RISK_CLASSIFICATION_TARGETS: Array<
  Extract<RiskForecastTarget, 'UNPLANNED_FAILURE' | 'CAPACITY_RISK'>
> = ['UNPLANNED_FAILURE', 'CAPACITY_RISK'];

export const BACKTEST_MIN_FOLDS = 4;

export const RELEASE_GATES: Record<
  BacktestModelFamily,
  {
    maxSmapePercent: number;
    maxMapePercent: number;
    maxBiasPercent: number;
    minIntervalCoveragePercent: number;
    maxCalibrationError: number;
    minBeatBaselinePercent: number;
    minFolds: number;
    minPrecision: number;
    minRecall: number;
    maxBrierScore: number;
  }
> = {
  FORECAST: {
    maxSmapePercent: 25,
    maxMapePercent: 30,
    maxBiasPercent: 10,
    minIntervalCoveragePercent: 70,
    maxCalibrationError: 0.15,
    minBeatBaselinePercent: 0,
    minFolds: BACKTEST_MIN_FOLDS,
    minPrecision: 0,
    minRecall: 0,
    maxBrierScore: 1,
  },
  RISK: {
    maxSmapePercent: 40,
    maxMapePercent: 50,
    maxBiasPercent: 15,
    minIntervalCoveragePercent: 60,
    maxCalibrationError: 0.2,
    minBeatBaselinePercent: 0,
    minFolds: BACKTEST_MIN_FOLDS,
    minPrecision: 0.5,
    minRecall: 0.4,
    maxBrierScore: 0.35,
  },
};

export const DRIFT_THRESHOLDS = {
  inputPercentWarning: 25,
  inputPercentCritical: 50,
  errorRatioWarning: 1.5,
  errorRatioCritical: 2.0,
  smapeRatioWarning: 1.5,
  smapeRatioCritical: 2.0,
};

export function modelVersionForKey(
  family: BacktestModelFamily,
  key: BacktestModelKey,
): string {
  if (family === 'FORECAST') {
    return FORECAST_MODEL_VERSIONS[key as ForecastTarget];
  }
  return RISK_MODEL_VERSIONS[key as RiskForecastTarget];
}

export function platformVersionForFamily(family: BacktestModelFamily): string {
  return family === 'FORECAST' ? FORECAST_PLATFORM_VERSION : RISK_FORECAST_PLATFORM_VERSION;
}

export function horizonsForFamily(family: BacktestModelFamily): readonly number[] {
  return family === 'FORECAST' ? FORECAST_HORIZONS_DAYS : RISK_FORECAST_HORIZONS_DAYS;
}

export const DEFAULT_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
