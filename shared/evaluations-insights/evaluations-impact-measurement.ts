/**
 * Impact measurement domain for implemented OrgRecommendations (Prompt 39/54).
 * Correlation is never presented as causation; periods must be comparable.
 */

import type { EvaluationsRecommendationCategory } from './evaluations-recommendations';

export const IMPACT_MEASUREMENT_CALCULATION_VERSION = 'impact-measurement-v1';

export const IMPACT_CORRELATION_DISCLAIMER_DE =
  'Die Messung zeigt eine zeitliche Korrelation im gewählten Vergleichszeitraum. Eine kausale Wirkung der Maßnahme kann ohne kontrollierte Studie nicht belegt werden.';
export const IMPACT_CORRELATION_DISCLAIMER_EN =
  'This measurement shows temporal correlation within the selected comparison window. Causal impact cannot be established without a controlled study.';

export type RecommendationImpactOutcomeStatus =
  | 'INSUFFICIENT_DATA'
  | 'INCONCLUSIVE'
  | 'PARTIAL_SUCCESS'
  | 'SUCCESS'
  | 'BELOW_EXPECTATION'
  | 'NEGATIVE'
  | 'CANCELLED'
  | 'PARTIALLY_IMPLEMENTED';

export type RecommendationImplementationStatus = 'FULL' | 'PARTIAL' | 'CANCELLED' | 'NOT_STARTED';

export type RecommendationImpactTrend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';

export type RecommendationImpactConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type RecommendationImpactKpiDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BETTER';

export interface RecommendationImpactMoney {
  amountMinor: number;
  currency: string;
}

export interface RecommendationImpactPeriod {
  from: string;
  to: string;
}

export interface RecommendationImpactLimitation {
  code: string;
  message: string;
}

export interface RecommendationImpactMeasurementInput {
  baselineKpiKey: string;
  baselineKpiLabel?: string;
  baselineValue: number | null;
  targetValue: number | null;
  actualKpiValue: number | null;
  expectedBenefit?: RecommendationImpactMoney | null;
  expectedCost?: RecommendationImpactMoney | null;
  actualCost?: RecommendationImpactMoney | null;
  actualBenefit?: RecommendationImpactMoney | null;
  baselinePeriod: RecommendationImpactPeriod;
  measurementPeriod: RecommendationImpactPeriod;
  dataCoveragePercent: number | null;
  implementationStatus: RecommendationImplementationStatus;
  kpiDirection?: RecommendationImpactKpiDirection;
  seasonalOrExternalFactors?: string[];
}

export interface RecommendationImpactMeasurementResult {
  baselineKpiKey: string;
  baselineKpiLabel: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  actualKpiValue: number | null;
  expectedBenefit: RecommendationImpactMoney | null;
  expectedCost: RecommendationImpactMoney | null;
  actualCost: RecommendationImpactMoney | null;
  actualBenefit: RecommendationImpactMoney | null;
  varianceFromExpected: RecommendationImpactMoney | null;
  baselinePeriod: RecommendationImpactPeriod;
  measurementPeriod: RecommendationImpactPeriod;
  dataCoveragePercent: number | null;
  outcomeStatus: RecommendationImpactOutcomeStatus;
  implementationStatus: RecommendationImplementationStatus;
  trend: RecommendationImpactTrend;
  confidence: RecommendationImpactConfidence;
  limitations: RecommendationImpactLimitation[];
  deviationExplanation: string | null;
  correlationDisclaimer: string;
  calculationVersion: string;
  periodComparable: boolean;
}

const MEASURABLE_STATUSES = new Set([
  'IMPLEMENTED',
  'MEASURING_IMPACT',
  'COMPLETED',
  'CANCELLED',
]);

const MIN_PERIOD_DAYS = 7;
const PERIOD_LENGTH_TOLERANCE_DAYS = 2;
const INSUFFICIENT_DATA_THRESHOLD = 50;
const INCONCLUSIVE_DATA_THRESHOLD = 80;

export function canMeasureRecommendationImpact(status: string): boolean {
  return MEASURABLE_STATUSES.has(status);
}

export function resolveDefaultImpactKpi(category: EvaluationsRecommendationCategory): {
  key: string;
  label: string;
  direction: RecommendationImpactKpiDirection;
} {
  switch (category) {
    case 'FLEET_UTILIZATION':
      return {
        key: 'fleetUtilization.utilizationPercent',
        label: 'Fleet utilization %',
        direction: 'HIGHER_IS_BETTER',
      };
    case 'COST_OPTIMIZATION':
      return {
        key: 'financial.netMarginMinor',
        label: 'Net margin',
        direction: 'HIGHER_IS_BETTER',
      };
    case 'MAINTENANCE':
    case 'SAFETY':
    case 'COMPLIANCE':
      return {
        key: 'downtime.downtimePercent',
        label: 'Unplanned downtime %',
        direction: 'LOWER_IS_BETTER',
      };
    case 'CUSTOMER_EXPERIENCE':
      return {
        key: 'bookings.completedCount',
        label: 'Completed bookings',
        direction: 'HIGHER_IS_BETTER',
      };
    default:
      return {
        key: 'financial.revenueMtdMinor',
        label: 'Revenue MTD',
        direction: 'HIGHER_IS_BETTER',
      };
  }
}

function periodLengthDays(period: RecommendationImpactPeriod): number {
  const from = new Date(period.from).getTime();
  const to = new Date(period.to).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export function validateComparableImpactPeriods(
  baselinePeriod: RecommendationImpactPeriod,
  measurementPeriod: RecommendationImpactPeriod,
): { comparable: boolean; limitations: RecommendationImpactLimitation[] } {
  const limitations: RecommendationImpactLimitation[] = [];
  const baselineDays = periodLengthDays(baselinePeriod);
  const measurementDays = periodLengthDays(measurementPeriod);

  if (baselineDays < MIN_PERIOD_DAYS || measurementDays < MIN_PERIOD_DAYS) {
    limitations.push({
      code: 'SHORT_PERIOD',
      message: `Comparison periods should be at least ${MIN_PERIOD_DAYS} days.`,
    });
  }

  const baselineEnd = new Date(baselinePeriod.to).getTime();
  const measurementStart = new Date(measurementPeriod.from).getTime();
  if (measurementStart < baselineEnd) {
    limitations.push({
      code: 'OVERLAPPING_PERIODS',
      message: 'Baseline and measurement periods must not overlap.',
    });
  }

  const lengthDelta = Math.abs(baselineDays - measurementDays);
  if (lengthDelta > PERIOD_LENGTH_TOLERANCE_DAYS) {
    limitations.push({
      code: 'UNEQUAL_PERIOD_LENGTH',
      message: 'Before and after periods should have comparable length for fair comparison.',
    });
  }

  const comparable =
    limitations.every((l) => l.code !== 'OVERLAPPING_PERIODS') &&
    baselineDays >= MIN_PERIOD_DAYS &&
    measurementDays >= MIN_PERIOD_DAYS &&
    lengthDelta <= PERIOD_LENGTH_TOLERANCE_DAYS;

  return { comparable, limitations };
}

export function computeVarianceFromExpected(
  actualBenefit: RecommendationImpactMoney | null,
  expectedBenefit: RecommendationImpactMoney | null,
): RecommendationImpactMoney | null {
  if (!actualBenefit || !expectedBenefit) return null;
  if (actualBenefit.currency !== expectedBenefit.currency) return null;
  return {
    amountMinor: actualBenefit.amountMinor - expectedBenefit.amountMinor,
    currency: actualBenefit.currency,
  };
}

export function computeImpactTrend(
  baselineValue: number | null,
  actualValue: number | null,
  direction: RecommendationImpactKpiDirection,
): RecommendationImpactTrend {
  if (baselineValue == null || actualValue == null) return 'UNKNOWN';
  const delta = actualValue - baselineValue;
  if (Math.abs(delta) < 0.0001) return 'STABLE';

  if (direction === 'LOWER_IS_BETTER') {
    return delta < 0 ? 'IMPROVING' : 'DECLINING';
  }
  if (direction === 'HIGHER_IS_BETTER') {
    return delta > 0 ? 'IMPROVING' : 'DECLINING';
  }

  return delta > 0 ? 'IMPROVING' : delta < 0 ? 'DECLINING' : 'STABLE';
}

export function deriveImpactConfidence(input: {
  dataCoveragePercent: number | null;
  periodComparable: boolean;
  implementationStatus: RecommendationImplementationStatus;
  hasActualKpi: boolean;
  hasBenefitValues: boolean;
}): RecommendationImpactConfidence {
  if (
    input.implementationStatus === 'CANCELLED' ||
    input.dataCoveragePercent != null && input.dataCoveragePercent < INSUFFICIENT_DATA_THRESHOLD
  ) {
    return 'LOW';
  }
  if (
    !input.periodComparable ||
    input.implementationStatus === 'PARTIAL' ||
    !input.hasActualKpi ||
    (input.dataCoveragePercent != null && input.dataCoveragePercent < INCONCLUSIVE_DATA_THRESHOLD)
  ) {
    return 'MEDIUM';
  }
  if (input.hasBenefitValues && input.dataCoveragePercent != null && input.dataCoveragePercent >= 90) {
    return 'VERY_HIGH';
  }
  return 'HIGH';
}

function kpiMeetsTarget(
  actual: number | null,
  target: number | null,
  direction: RecommendationImpactKpiDirection,
): boolean | null {
  if (actual == null || target == null) return null;
  if (direction === 'LOWER_IS_BETTER') return actual <= target;
  if (direction === 'HIGHER_IS_BETTER') return actual >= target;
  return Math.abs(actual - target) <= Math.abs(target) * 0.05;
}

export function computeImpactOutcomeStatus(input: {
  implementationStatus: RecommendationImplementationStatus;
  dataCoveragePercent: number | null;
  periodComparable: boolean;
  actualKpiValue: number | null;
  targetValue: number | null;
  baselineValue: number | null;
  varianceFromExpected: RecommendationImpactMoney | null;
  trend: RecommendationImpactTrend;
  kpiDirection: RecommendationImpactKpiDirection;
}): RecommendationImpactOutcomeStatus {
  if (input.implementationStatus === 'CANCELLED') return 'CANCELLED';
  if (input.implementationStatus === 'PARTIAL') return 'PARTIALLY_IMPLEMENTED';

  if (input.dataCoveragePercent != null && input.dataCoveragePercent < INSUFFICIENT_DATA_THRESHOLD) {
    return 'INSUFFICIENT_DATA';
  }

  if (!input.periodComparable || input.actualKpiValue == null) {
    return 'INCONCLUSIVE';
  }

  if (input.dataCoveragePercent != null && input.dataCoveragePercent < INCONCLUSIVE_DATA_THRESHOLD) {
    return 'INCONCLUSIVE';
  }

  const meetsTarget = kpiMeetsTarget(input.actualKpiValue, input.targetValue, input.kpiDirection);
  const variance = input.varianceFromExpected?.amountMinor ?? null;

  if (input.trend === 'DECLINING') {
    return variance != null && variance < 0 ? 'NEGATIVE' : 'BELOW_EXPECTATION';
  }

  if (meetsTarget === true) {
    if (variance != null && variance < 0) return 'PARTIAL_SUCCESS';
    return 'SUCCESS';
  }

  if (meetsTarget === false) {
    return variance != null && variance >= 0 ? 'PARTIAL_SUCCESS' : 'BELOW_EXPECTATION';
  }

  if (variance != null) {
    if (variance > 0) return 'SUCCESS';
    if (variance < 0) return 'BELOW_EXPECTATION';
    return 'PARTIAL_SUCCESS';
  }

  return 'INCONCLUSIVE';
}

export function buildImpactDeviationExplanation(input: {
  outcomeStatus: RecommendationImpactOutcomeStatus;
  trend: RecommendationImpactTrend;
  varianceFromExpected: RecommendationImpactMoney | null;
  limitations: RecommendationImpactLimitation[];
  implementationStatus: RecommendationImplementationStatus;
}): string | null {
  const parts: string[] = [];

  if (input.implementationStatus === 'PARTIAL') {
    parts.push('The measure was only partially implemented; impact attribution is limited.');
  }
  if (input.implementationStatus === 'CANCELLED') {
    parts.push('The measure was cancelled before completion.');
  }
  if (input.trend === 'DECLINING') {
    parts.push('The observed KPI moved opposite to the intended direction in the measurement window.');
  }
  if (input.varianceFromExpected && input.varianceFromExpected.amountMinor < 0) {
    parts.push('Actual benefit fell short of the forecast used at planning time.');
  }
  if (input.limitations.some((l) => l.code === 'UNEQUAL_PERIOD_LENGTH')) {
    parts.push('Before/after windows differ in length, which may bias the comparison.');
  }
  if (input.limitations.some((l) => l.code === 'SEASONAL_OR_EXTERNAL')) {
    parts.push('Seasonal or external factors may explain part of the observed change.');
  }
  if (input.outcomeStatus === 'INSUFFICIENT_DATA') {
    parts.push('Data coverage is too low to support a confident outcome label.');
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

export function buildImpactLimitations(
  periodValidation: RecommendationImpactLimitation[],
  seasonalOrExternalFactors?: string[],
): RecommendationImpactLimitation[] {
  const limitations = [...periodValidation];
  for (const factor of seasonalOrExternalFactors ?? []) {
    const trimmed = factor.trim();
    if (!trimmed) continue;
    limitations.push({ code: 'SEASONAL_OR_EXTERNAL', message: trimmed });
  }
  return limitations;
}

export function buildRecommendationImpactMeasurement(
  input: RecommendationImpactMeasurementInput,
  locale: 'de' | 'en' = 'de',
): RecommendationImpactMeasurementResult {
  const periodCheck = validateComparableImpactPeriods(
    input.baselinePeriod,
    input.measurementPeriod,
  );
  const limitations = buildImpactLimitations(
    periodCheck.limitations,
    input.seasonalOrExternalFactors,
  );
  const direction = input.kpiDirection ?? 'HIGHER_IS_BETTER';
  const varianceFromExpected = computeVarianceFromExpected(
    input.actualBenefit ?? null,
    input.expectedBenefit ?? null,
  );
  const trend = computeImpactTrend(input.baselineValue, input.actualKpiValue, direction);
  const confidence = deriveImpactConfidence({
    dataCoveragePercent: input.dataCoveragePercent,
    periodComparable: periodCheck.comparable,
    implementationStatus: input.implementationStatus,
    hasActualKpi: input.actualKpiValue != null,
    hasBenefitValues: input.actualBenefit != null && input.expectedBenefit != null,
  });
  const outcomeStatus = computeImpactOutcomeStatus({
    implementationStatus: input.implementationStatus,
    dataCoveragePercent: input.dataCoveragePercent,
    periodComparable: periodCheck.comparable,
    actualKpiValue: input.actualKpiValue,
    targetValue: input.targetValue,
    baselineValue: input.baselineValue,
    varianceFromExpected,
    trend,
    kpiDirection: direction,
  });
  const deviationExplanation = buildImpactDeviationExplanation({
    outcomeStatus,
    trend,
    varianceFromExpected,
    limitations,
    implementationStatus: input.implementationStatus,
  });

  return {
    baselineKpiKey: input.baselineKpiKey,
    baselineKpiLabel: input.baselineKpiLabel ?? null,
    baselineValue: input.baselineValue,
    targetValue: input.targetValue,
    actualKpiValue: input.actualKpiValue,
    expectedBenefit: input.expectedBenefit ?? null,
    expectedCost: input.expectedCost ?? null,
    actualCost: input.actualCost ?? null,
    actualBenefit: input.actualBenefit ?? null,
    varianceFromExpected,
    baselinePeriod: input.baselinePeriod,
    measurementPeriod: input.measurementPeriod,
    dataCoveragePercent: input.dataCoveragePercent,
    outcomeStatus,
    implementationStatus: input.implementationStatus,
    trend,
    confidence,
    limitations,
    deviationExplanation,
    correlationDisclaimer:
      locale === 'en' ? IMPACT_CORRELATION_DISCLAIMER_EN : IMPACT_CORRELATION_DISCLAIMER_DE,
    calculationVersion: IMPACT_MEASUREMENT_CALCULATION_VERSION,
    periodComparable: periodCheck.comparable,
  };
}
