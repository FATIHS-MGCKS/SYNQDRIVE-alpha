import type { OrgPredictiveRiskForecast } from '@prisma/client';
import type { MaintenanceRiskForecastResult } from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk.contract';

export function mapRiskForecastRow(row: OrgPredictiveRiskForecast): MaintenanceRiskForecastResult & {
  id: string;
  organizationId: string;
  scopeKey: string;
  generatedAt: string;
  expiresAt: string | null;
} {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeKey: row.scopeKey,
    riskKey: row.riskKey,
    horizonDays: row.horizonDays as MaintenanceRiskForecastResult['horizonDays'],
    modelVersion: row.modelVersion,
    featureSetVersion: row.featureSetVersion,
    inferenceTier: row.inferenceTier,
    timezone: row.timezone,
    currency: row.currency,
    unit: row.unit,
    asOfDate: row.asOfDate,
    horizonStartDate: row.horizonStartDate,
    horizonEndDate: row.horizonEndDate,
    probabilityEstimate: row.probabilityEstimate,
    impactEstimate: row.impactEstimate,
    costP50Minor: row.costP50Minor,
    costP90Minor: row.costP90Minor,
    pointEstimate: row.pointEstimate,
    intervalLow: row.intervalLow,
    intervalHigh: row.intervalHigh,
    dataCoveragePercent: row.dataCoveragePercent,
    evaluation: row.evaluationMetrics as MaintenanceRiskForecastResult['evaluation'],
    explainability: row.explainability as MaintenanceRiskForecastResult['explainability'],
    safetyBoundaries: row.safetyBoundaries as MaintenanceRiskForecastResult['safetyBoundaries'],
    status: row.status,
    suppressedReason: row.suppressedReason,
    lineage: row.lineage as MaintenanceRiskForecastResult['lineage'],
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isForecast: true,
    isRiskForecast: true,
  };
}

export function toPrismaRiskForecastCreateInput(
  organizationId: string,
  result: MaintenanceRiskForecastResult,
  scopeKey: string,
  riskRunId: string,
  expiresAt: Date,
) {
  return {
    organization: { connect: { id: organizationId } },
    riskKey: result.riskKey,
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
    probabilityEstimate: result.probabilityEstimate,
    impactEstimate: result.impactEstimate,
    costP50Minor: result.costP50Minor,
    costP90Minor: result.costP90Minor,
    pointEstimate: result.pointEstimate,
    intervalLow: result.intervalLow,
    intervalHigh: result.intervalHigh,
    dataCoveragePercent: result.dataCoveragePercent,
    evaluationMetrics: result.evaluation,
    explainability: result.explainability,
    safetyBoundaries: result.safetyBoundaries,
    status: result.status,
    suppressedReason: result.suppressedReason,
    lineage: result.lineage,
    expiresAt,
    riskRun: { connect: { id: riskRunId } },
  };
}
