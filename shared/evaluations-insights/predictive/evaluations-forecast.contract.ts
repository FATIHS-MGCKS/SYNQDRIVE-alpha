/**
 * Baseline forecast contracts (Prompt 42/54).
 * Demand, revenue (issued), utilization — statistical/rule baselines only in v1.
 */

import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';

export const FORECAST_PLATFORM_VERSION = 'forecast-baseline-v1';
export const DEMAND_MODEL_VERSION = 'demand-baseline-v1.0';
export const REVENUE_MODEL_VERSION = 'revenue-baseline-v1.0';
export const UTILIZATION_MODEL_VERSION = 'utilization-baseline-v1.0';

export const FORECAST_HORIZONS_DAYS = [7, 30, 60, 90] as const;
export type ForecastHorizonDays = (typeof FORECAST_HORIZONS_DAYS)[number];

export type ForecastTarget = 'DEMAND' | 'REVENUE' | 'UTILIZATION';

export type ForecastInferenceTier = 'RULE_BASED' | 'STATISTICAL';

export type ForecastMethod =
  | 'moving_average'
  | 'seasonal_naive_dow'
  | 'seasonal_naive_weekly'
  | 'suppressed';

export type ForecastStatus =
  | 'AVAILABLE'
  | 'INSUFFICIENT_HISTORY'
  | 'SUPPRESSED'
  | 'FALLBACK';

export type ForecastTimeSeriesPoint = {
  date: string;
  value: number;
};

export type ForecastEvaluationMetrics = {
  mape: number | null;
  smape: number | null;
  holdoutDays: number;
  selectedMethod: ForecastMethod;
  baselineMethod: ForecastMethod;
  beatBaselineByPercent: number | null;
};

export type ForecastExplainability = {
  method: ForecastMethod;
  inferenceTier: ForecastInferenceTier;
  topFactors: Array<{ factor: string; impact: string }>;
  limitations: string[];
};

export type BaselineForecastInput = {
  target: ForecastTarget;
  horizonDays: ForecastHorizonDays;
  series: ForecastTimeSeriesPoint[];
  asOfDate: string;
  timezone: string;
  currency?: string;
};

export type BaselineForecastResult = {
  forecastKey: ForecastTarget;
  horizonDays: ForecastHorizonDays;
  modelVersion: string;
  featureSetVersion: string;
  inferenceTier: ForecastInferenceTier;
  timezone: string;
  currency: string | null;
  unit: 'count' | 'EUR_minor' | 'percent';
  asOfDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  pointEstimate: number;
  intervalLow: number;
  intervalHigh: number;
  trainingWindowStart: string;
  trainingWindowEnd: string;
  dataCoveragePercent: number;
  evaluation: ForecastEvaluationMetrics;
  explainability: ForecastExplainability;
  status: ForecastStatus;
  suppressedReason: string | null;
  lineage: {
    platformVersion: string;
    featureSetVersion: string;
    historyDays: number;
    nonZeroDays: number;
    revenueSource: 'invoice_issued_minor' | 'n/a';
  };
};

export const FORECAST_MIN_HISTORY: Record<
  ForecastTarget,
  { ruleBased: number; statistical: number; suppressBelow: number }
> = {
  DEMAND: { ruleBased: 30, statistical: 90, suppressBelow: 30 },
  REVENUE: { ruleBased: 180, statistical: 365, suppressBelow: 180 },
  UTILIZATION: { ruleBased: 14, statistical: 60, suppressBelow: 14 },
};

export const FORECAST_FEATURE_KEYS: Record<ForecastTarget, string> = {
  DEMAND: 'demand.booking_starts_count',
  REVENUE: 'revenue.invoice_issued_minor',
  UTILIZATION: 'utilization.percent',
};

export const FORECAST_MODEL_VERSIONS: Record<ForecastTarget, string> = {
  DEMAND: DEMAND_MODEL_VERSION,
  REVENUE: REVENUE_MODEL_VERSION,
  UTILIZATION: UTILIZATION_MODEL_VERSION,
};
