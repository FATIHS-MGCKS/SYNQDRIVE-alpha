/**
 * Pure baseline forecast engine — no DB, no ML.
 * Compares moving average vs seasonal naive; uses seasonal only when it beats MA on holdout.
 */

import {
  FORECAST_MIN_HISTORY,
  FORECAST_MODEL_VERSIONS,
  FORECAST_PLATFORM_VERSION,
  type BaselineForecastInput,
  type BaselineForecastResult,
  type ForecastExplainability,
  type ForecastInferenceTier,
  type ForecastMethod,
  type ForecastStatus,
  type ForecastTimeSeriesPoint,
} from './evaluations-forecast.contract';
import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';

const BEAT_BASELINE_THRESHOLD = 0.05;
const INTERVAL_Z = 1.28;

function parseWeekday(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function parseWeekKey(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function sortedSeries(series: ForecastTimeSeriesPoint[]): ForecastTimeSeriesPoint[] {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

function coveragePercent(series: ForecastTimeSeriesPoint[], windowStart: string, windowEnd: string): number {
  if (windowStart > windowEnd) return 0;
  let expected = 0;
  let cursor = windowStart;
  while (cursor <= windowEnd && expected < 5000) {
    expected += 1;
    cursor = shiftDate(cursor, 1);
  }
  if (expected === 0) return 0;
  const present = new Set(series.map((p) => p.date));
  let covered = 0;
  cursor = windowStart;
  while (cursor <= windowEnd && covered <= expected) {
    if (present.has(cursor)) covered += 1;
    cursor = shiftDate(cursor, 1);
  }
  return Math.round((covered / expected) * 100);
}

function mape(actual: number[], predicted: number[]): number | null {
  const pairs = actual
    .map((a, i) => ({ a, p: predicted[i] }))
    .filter(({ a }) => a !== 0);
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, { a, p }) => acc + Math.abs((a - p) / a), 0);
  return Math.round((sum / pairs.length) * 1000) / 10;
}

function smape(actual: number[], predicted: number[]): number | null {
  const pairs = actual.map((a, i) => ({ a, p: predicted[i] }));
  const denom = pairs.reduce((acc, { a, p }) => acc + (Math.abs(a) + Math.abs(p)), 0);
  if (denom === 0) return null;
  const sum = pairs.reduce((acc, { a, p }) => acc + Math.abs(a - p), 0);
  return Math.round(((sum / denom) * 2 * 1000)) / 10;
}

function movingAverageForecast(
  history: ForecastTimeSeriesPoint[],
  futureDates: string[],
  window: number,
): number[] {
  const values = history.map((p) => p.value);
  const avg =
    values.length === 0
      ? 0
      : values.slice(-window).reduce((a, b) => a + b, 0) / Math.min(window, values.length);
  return futureDates.map(() => avg);
}

function seasonalDowForecast(
  history: ForecastTimeSeriesPoint[],
  futureDates: string[],
): number[] {
  const buckets = new Map<number, number[]>();
  for (const point of history) {
    const dow = parseWeekday(point.date);
    const arr = buckets.get(dow) ?? [];
    arr.push(point.value);
    buckets.set(dow, arr);
  }
  const means = new Map<number, number>();
  for (const [dow, vals] of buckets) {
    means.set(dow, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const fallback =
    history.length > 0
      ? history.reduce((a, p) => a + p.value, 0) / history.length
      : 0;
  return futureDates.map((date) => means.get(parseWeekday(date)) ?? fallback);
}

function seasonalWeeklyForecast(
  history: ForecastTimeSeriesPoint[],
  futureDates: string[],
): number[] {
  const buckets = new Map<string, number[]>();
  for (const point of history) {
    const key = parseWeekKey(point.date);
    const arr = buckets.get(key) ?? [];
    arr.push(point.value);
    buckets.set(key, arr);
  }
  const overall =
    history.length > 0
      ? history.reduce((a, p) => a + p.value, 0) / history.length
      : 0;
  const weekMeans = new Map<string, number>();
  for (const [key, vals] of buckets) {
    weekMeans.set(key, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return futureDates.map((date) => {
    const key = parseWeekKey(date);
    return weekMeans.get(key) ?? overall;
  });
}

function residualStd(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const residuals = actual.map((a, i) => a - predicted[i]);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance =
    residuals.reduce((acc, r) => acc + (r - mean) ** 2, 0) / Math.max(1, residuals.length - 1);
  return Math.sqrt(variance);
}

function shiftDate(dateOnly: string, dayOffset: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset));
  return dt.toISOString().slice(0, 10);
}

function futureDates(asOfDate: string, horizonDays: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= horizonDays; i += 1) {
    dates.push(shiftDate(asOfDate, i));
  }
  return dates;
}

function aggregateHorizon(
  target: BaselineForecastInput['target'],
  dailyForecasts: number[],
): number {
  if (dailyForecasts.length === 0) return 0;
  if (target === 'UTILIZATION') {
    const sum = dailyForecasts.reduce((a, b) => a + b, 0);
    return Math.round((sum / dailyForecasts.length) * 10) / 10;
  }
  return Math.round(dailyForecasts.reduce((a, b) => a + b, 0));
}

function unitFor(target: BaselineForecastInput['target']): BaselineForecastResult['unit'] {
  if (target === 'REVENUE') return 'EUR_minor';
  if (target === 'UTILIZATION') return 'percent';
  return 'count';
}

function selectMethod(
  history: ForecastTimeSeriesPoint[],
  holdoutDates: string[],
  holdoutActuals: number[],
): {
  method: ForecastMethod;
  inferenceTier: ForecastInferenceTier;
  holdoutPredicted: number[];
} {
  const ma7 = movingAverageForecast(
    history.slice(0, history.length - holdoutDates.length),
    holdoutDates,
    7,
  );
  const ma14 = movingAverageForecast(
    history.slice(0, history.length - holdoutDates.length),
    holdoutDates,
    14,
  );
  const dow = seasonalDowForecast(
    history.slice(0, history.length - holdoutDates.length),
    holdoutDates,
  );

  const candidates: Array<{ method: ForecastMethod; preds: number[]; tier: ForecastInferenceTier }> = [
    { method: 'moving_average', preds: ma14, tier: 'RULE_BASED' },
    { method: 'seasonal_naive_dow', preds: dow, tier: 'STATISTICAL' },
  ];

  if (history.length >= 90) {
    candidates.push({
      method: 'seasonal_naive_weekly',
      preds: seasonalWeeklyForecast(
        history.slice(0, history.length - holdoutDates.length),
        holdoutDates,
      ),
      tier: 'STATISTICAL',
    });
  }

  let best = candidates[0];
  let bestSmape = smape(holdoutActuals, best.preds) ?? Number.POSITIVE_INFINITY;
  for (const c of candidates.slice(1)) {
    const score = smape(holdoutActuals, c.preds) ?? Number.POSITIVE_INFINITY;
    if (score < bestSmape) {
      best = c;
      bestSmape = score;
    }
  }

  const maSmape = Math.min(
    smape(holdoutActuals, ma7) ?? Number.POSITIVE_INFINITY,
    smape(holdoutActuals, ma14) ?? Number.POSITIVE_INFINITY,
  );
  if (
    best.method !== 'moving_average' &&
    maSmape !== Number.POSITIVE_INFINITY &&
    bestSmape > maSmape * (1 - BEAT_BASELINE_THRESHOLD)
  ) {
    const useMa7 = (smape(holdoutActuals, ma7) ?? Infinity) <= (smape(holdoutActuals, ma14) ?? Infinity);
    return {
      method: 'moving_average',
      inferenceTier: 'RULE_BASED',
      holdoutPredicted: useMa7 ? ma7 : ma14,
    };
  }

  return {
    method: best.method,
    inferenceTier: best.tier,
    holdoutPredicted: best.preds,
  };
}

function forecastDaily(
  method: ForecastMethod,
  history: ForecastTimeSeriesPoint[],
  dates: string[],
): number[] {
  if (method === 'seasonal_naive_dow') return seasonalDowForecast(history, dates);
  if (method === 'seasonal_naive_weekly') return seasonalWeeklyForecast(history, dates);
  return movingAverageForecast(history, dates, 14);
}

function buildExplainability(
  method: ForecastMethod,
  tier: ForecastInferenceTier,
  target: BaselineForecastInput['target'],
  historyDays: number,
): ForecastExplainability {
  const factors: ForecastExplainability['topFactors'] = [
    { factor: 'historical_volume', impact: `${historyDays} days of observed ${target.toLowerCase()}` },
  ];
  if (method === 'seasonal_naive_dow') {
    factors.push({ factor: 'day_of_week', impact: 'Weekday seasonality from trailing history' });
  }
  if (method === 'seasonal_naive_weekly') {
    factors.push({ factor: 'calendar_week', impact: 'Weekly seasonality pattern' });
  }
  if (method === 'moving_average') {
    factors.push({ factor: 'trailing_average', impact: '14-day moving average baseline' });
  }
  if (target === 'REVENUE') {
    factors.push({
      factor: 'revenue_basis',
      impact: 'Issued outgoing invoices only (not cash/payment receipts)',
    });
  }

  const limitations: string[] = [
    'Baseline statistical forecast — not a causal or ML model.',
    'Uncertainty intervals derived from holdout residuals.',
  ];
  if (historyDays < FORECAST_MIN_HISTORY[target].statistical) {
    limitations.push('Limited history — seasonal patterns may be unstable.');
  }

  return { method, inferenceTier: tier, topFactors: factors, limitations };
}

export function runBaselineForecast(input: BaselineForecastInput): BaselineForecastResult {
  const series = sortedSeries(input.series.filter((p) => p.date <= input.asOfDate));
  const historyDays = series.length;
  const nonZeroDays = series.filter((p) => p.value > 0).length;
  const thresholds = FORECAST_MIN_HISTORY[input.target];

  if (historyDays < thresholds.suppressBelow) {
    const horizonDates = futureDates(input.asOfDate, input.horizonDays);
    return {
      forecastKey: input.target,
      horizonDays: input.horizonDays,
      modelVersion: FORECAST_MODEL_VERSIONS[input.target],
      featureSetVersion: FEATURE_SET_VERSION,
      inferenceTier: 'RULE_BASED',
      timezone: input.timezone,
      currency: input.target === 'REVENUE' ? (input.currency ?? 'EUR') : null,
      unit: unitFor(input.target),
      asOfDate: input.asOfDate,
      horizonStartDate: horizonDates[0] ?? input.asOfDate,
      horizonEndDate: horizonDates[horizonDates.length - 1] ?? input.asOfDate,
      pointEstimate: 0,
      intervalLow: 0,
      intervalHigh: 0,
      trainingWindowStart: series[0]?.date ?? input.asOfDate,
      trainingWindowEnd: series[series.length - 1]?.date ?? input.asOfDate,
      dataCoveragePercent: coveragePercent(
        series,
        series[0]?.date ?? input.asOfDate,
        series[series.length - 1]?.date ?? input.asOfDate,
      ),
      evaluation: {
        mape: null,
        smape: null,
        holdoutDays: 0,
        selectedMethod: 'suppressed',
        baselineMethod: 'moving_average',
        beatBaselineByPercent: null,
      },
      explainability: buildExplainability('suppressed', 'RULE_BASED', input.target, historyDays),
      status: 'INSUFFICIENT_HISTORY',
      suppressedReason: `Requires at least ${thresholds.suppressBelow} days of history; got ${historyDays}.`,
      lineage: {
        platformVersion: FORECAST_PLATFORM_VERSION,
        featureSetVersion: FEATURE_SET_VERSION,
        historyDays,
        nonZeroDays,
        revenueSource: input.target === 'REVENUE' ? 'invoice_issued_minor' : 'n/a',
      },
    };
  }

  const trainingStart = series[0]?.date ?? input.asOfDate;
  const trainingEnd = series[series.length - 1]?.date ?? input.asOfDate;
  const horizonDates = futureDates(input.asOfDate, input.horizonDays);
  const horizonStart = horizonDates[0] ?? input.asOfDate;
  const horizonEnd = horizonDates[horizonDates.length - 1] ?? input.asOfDate;

  const baseResult = {
    forecastKey: input.target,
    horizonDays: input.horizonDays,
    modelVersion: FORECAST_MODEL_VERSIONS[input.target],
    featureSetVersion: FEATURE_SET_VERSION,
    timezone: input.timezone,
    currency: input.target === 'REVENUE' ? (input.currency ?? 'EUR') : null,
    unit: unitFor(input.target),
    asOfDate: input.asOfDate,
    horizonStartDate: horizonStart,
    horizonEndDate: horizonEnd,
    trainingWindowStart: trainingStart,
    trainingWindowEnd: trainingEnd,
    dataCoveragePercent: coveragePercent(series, trainingStart, trainingEnd),
    lineage: {
      platformVersion: FORECAST_PLATFORM_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      historyDays,
      nonZeroDays,
      revenueSource: input.target === 'REVENUE' ? ('invoice_issued_minor' as const) : ('n/a' as const),
    },
  };

  const holdoutDays = Math.min(28, Math.max(7, Math.floor(historyDays / 4)));
  const holdoutSlice = series.slice(-holdoutDays);
  const trainSlice = series.slice(0, -holdoutDays);
  const holdoutDates = holdoutSlice.map((p) => p.date);
  const holdoutActuals = holdoutSlice.map((p) => p.value);

  let method: ForecastMethod = 'moving_average';
  let tier: ForecastInferenceTier = 'RULE_BASED';
  let status: ForecastStatus = 'AVAILABLE';

  if (trainSlice.length < 7) {
    method = 'moving_average';
    tier = 'RULE_BASED';
    status = 'FALLBACK';
  } else {
    const selected = selectMethod(series, holdoutDates, holdoutActuals);
    method = selected.method;
    tier = selected.inferenceTier;
    if (historyDays < thresholds.statistical && tier === 'STATISTICAL') {
      method = 'moving_average';
      tier = 'RULE_BASED';
      status = 'FALLBACK';
    }
  }

  const dailyPreds = forecastDaily(method, series, horizonDates);
  const pointEstimate = aggregateHorizon(input.target, dailyPreds);

  const holdoutPreds = forecastDaily(method, trainSlice, holdoutDates);
  const std = residualStd(holdoutActuals, holdoutPreds);
  const horizonMultiplier =
    input.target === 'UTILIZATION' ? 1 : Math.sqrt(Math.max(1, input.horizonDays));
  const margin = std * INTERVAL_Z * horizonMultiplier;

  let intervalLow = Math.max(0, pointEstimate - margin);
  let intervalHigh = pointEstimate + margin;
  if (input.target === 'UTILIZATION') {
    intervalLow = Math.max(0, Math.round((pointEstimate - margin) * 10) / 10);
    intervalHigh = Math.min(100, Math.round((pointEstimate + margin) * 10) / 10);
  } else {
    intervalLow = Math.round(intervalLow);
    intervalHigh = Math.round(intervalHigh);
  }

  const maPreds = movingAverageForecast(trainSlice, holdoutDates, 14);
  const selectedSmape = smape(holdoutActuals, holdoutPreds);
  const baselineSmape = smape(holdoutActuals, maPreds);
  const beatBaselineByPercent =
    selectedSmape != null && baselineSmape != null && baselineSmape > 0
      ? Math.round(((baselineSmape - selectedSmape) / baselineSmape) * 1000) / 10
      : null;

  return {
    ...baseResult,
    pointEstimate,
    intervalLow,
    intervalHigh,
    inferenceTier: tier,
    evaluation: {
      mape: mape(holdoutActuals, holdoutPreds),
      smape: selectedSmape,
      holdoutDays,
      selectedMethod: method,
      baselineMethod: 'moving_average',
      beatBaselineByPercent,
    },
    explainability: buildExplainability(method, tier, input.target, historyDays),
    status,
    suppressedReason: null,
  };
}

export function buildForecastSeriesFromSnapshots(
  snapshots: Array<{ observationDate: string; value: number | null }>,
): ForecastTimeSeriesPoint[] {
  return snapshots
    .filter((s) => s.value != null && Number.isFinite(s.value))
    .map((s) => ({ date: s.observationDate, value: s.value as number }));
}
