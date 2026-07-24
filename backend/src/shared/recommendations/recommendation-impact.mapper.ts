import type { OrgRecommendationImpact } from '@prisma/client';
import type { RecommendationImpactMeasurementResult } from '@synq/evaluations-insights/evaluations-impact-measurement';

function moneyFromCents(
  cents: number | null | undefined,
  currency: string | null | undefined,
) {
  if (cents == null || currency == null) return null;
  return { amountMinor: cents, currency };
}

export function mapRecommendationImpactRow(
  row: OrgRecommendationImpact,
): RecommendationImpactMeasurementResult & {
  id: string;
  recommendationId: string;
  organizationId: string;
  version: number;
  isLatest: boolean;
  measuredAt: string;
  createdAt: string;
} {
  return {
    id: row.id,
    recommendationId: row.recommendationId,
    organizationId: row.organizationId,
    version: row.version,
    isLatest: row.isLatest,
    baselineKpiKey: row.baselineKpiKey,
    baselineKpiLabel: row.baselineKpiLabel,
    baselineValue: row.baselineValue,
    targetValue: row.targetValue,
    actualKpiValue: row.actualKpiValue,
    expectedBenefit: moneyFromCents(row.expectedBenefitCents, row.expectedBenefitCurrency),
    expectedCost: moneyFromCents(row.expectedCostCents, row.expectedCostCurrency),
    actualCost: moneyFromCents(row.actualCostCents, row.actualCostCurrency),
    actualBenefit: moneyFromCents(row.actualBenefitCents, row.actualBenefitCurrency),
    varianceFromExpected: moneyFromCents(row.varianceCents, row.varianceCurrency),
    baselinePeriod: {
      from: row.baselinePeriodStart.toISOString(),
      to: row.baselinePeriodEnd.toISOString(),
    },
    measurementPeriod: {
      from: row.measurementPeriodStart.toISOString(),
      to: row.measurementPeriodEnd.toISOString(),
    },
    dataCoveragePercent: row.dataCoveragePercent,
    outcomeStatus: row.outcomeStatus,
    implementationStatus: row.implementationStatus,
    trend: row.trend,
    confidence: row.confidence,
    limitations: Array.isArray(row.limitations)
      ? (row.limitations as unknown as RecommendationImpactMeasurementResult['limitations'])
      : [],
    deviationExplanation: row.deviationExplanation,
    correlationDisclaimer: row.correlationDisclaimer,
    calculationVersion: row.calculationVersion,
    periodComparable: row.periodComparable,
    measuredAt: row.measuredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
