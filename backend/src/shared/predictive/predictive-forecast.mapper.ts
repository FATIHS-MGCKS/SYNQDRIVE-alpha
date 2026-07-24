import type { OrgPredictiveForecast } from '@prisma/client';
import type { BaselineForecastResult } from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';

export type PredictiveForecastRowDto = BaselineForecastResult & {
  id: string;
  organizationId: string;
  scopeKey: string;
  generatedAt: string;
  expiresAt: string | null;
  isForecast: true;
};

export function mapForecastRow(row: OrgPredictiveForecast): PredictiveForecastRowDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeKey: row.scopeKey,
    forecastKey: row.forecastKey,
    horizonDays: row.horizonDays as BaselineForecastResult['horizonDays'],
    modelVersion: row.modelVersion,
    featureSetVersion: row.featureSetVersion as BaselineForecastResult['featureSetVersion'],
    inferenceTier: row.inferenceTier,
    timezone: row.timezone,
    currency: row.currency,
    unit: row.unit as BaselineForecastResult['unit'],
    asOfDate: row.asOfDate,
    horizonStartDate: row.horizonStartDate,
    horizonEndDate: row.horizonEndDate,
    pointEstimate: row.pointEstimate,
    intervalLow: row.intervalLow,
    intervalHigh: row.intervalHigh,
    trainingWindowStart: row.trainingWindowStart,
    trainingWindowEnd: row.trainingWindowEnd,
    dataCoveragePercent: row.dataCoveragePercent,
    evaluation: row.evaluationMetrics as BaselineForecastResult['evaluation'],
    explainability: row.explainability as BaselineForecastResult['explainability'],
    status: row.status,
    suppressedReason: row.suppressedReason,
    lineage: row.lineage as BaselineForecastResult['lineage'],
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isForecast: true,
  };
}

export function toPrismaForecastCreateInput(
  organizationId: string,
  result: BaselineForecastResult,
  scopeKey: string,
  forecastRunId: string,
  expiresAt: Date,
) {
  return {
    organization: { connect: { id: organizationId } },
    forecastKey: result.forecastKey,
    horizonDays: result.horizonDays,
    modelVersion: result.modelVersion,
    featureSetVersion: result.featureSetVersion,
    inferenceTier: result.inferenceTier,
    scopeKey,
    timezone: result.timezone,
    currency: result.currency,
    unit: result.unit,
    asOfDate: result.asOfDate,
    horizonStartDate: result.horizonStartDate,
    horizonEndDate: result.horizonEndDate,
    pointEstimate: result.pointEstimate,
    intervalLow: result.intervalLow,
    intervalHigh: result.intervalHigh,
    trainingWindowStart: result.trainingWindowStart,
    trainingWindowEnd: result.trainingWindowEnd,
    dataCoveragePercent: result.dataCoveragePercent,
    evaluationMetrics: result.evaluation,
    explainability: result.explainability,
    status: result.status,
    suppressedReason: result.suppressedReason,
    lineage: result.lineage,
    expiresAt,
    forecastRun: { connect: { id: forecastRunId } },
  };
}
