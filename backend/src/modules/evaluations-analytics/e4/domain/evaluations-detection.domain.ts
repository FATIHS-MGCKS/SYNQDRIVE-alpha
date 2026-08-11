/**
 * E4 Strength / Weakness detection domain (pure, deterministic, evidence-gated).
 *
 * Every result is rule-based and traceable (ruleId + version + evidence +
 * threshold + comparator). It is NOT AI/prediction/recommendation:
 *  - insufficient evidence → nothing is emitted (STRENGTH/WEAKNESS_INSUFFICIENT_
 *    EVIDENCE_COUNT = 0),
 *  - missing/zero-from-unavailable data never becomes a weakness (no false zero),
 *  - all evidence is OBSERVATION here (no ESTIMATE/FORECAST → E8 not leaked),
 *  - contradictory strength+weakness on the same dimension is impossible because
 *    thresholds are disjoint, and a reconciliation pass asserts it
 *    (STRENGTH_WEAKNESS_CONTRADICTION_COUNT = 0),
 *  - results are stably ordered and carry stable identifiers.
 */
import type {
  E4StrengthResult,
  E4WeaknessResult,
  E4Severity,
} from '../contracts/evaluations-insights.contract';
import { E4_CALCULATION_VERSIONS } from '../contracts/evaluations-insights.contract';

export interface E4UtilizationSignal {
  readonly ratio: number | null;
  readonly previousRatio: number | null;
  readonly eligibleVehicles: number;
  readonly coverageRatio: number | null;
}

export interface E4FinanceSignal {
  readonly marginPercent: number | null;
  readonly revenueMinor: number | null;
  readonly previousRevenueMinor: number | null;
}

export interface E4BookingSignal {
  readonly cancelledPlusNoShow: number;
  readonly totalOutcomes: number;
}

export interface E4DetectionSignals {
  readonly utilization: E4UtilizationSignal | null;
  readonly finance: E4FinanceSignal | null;
  readonly bookings: E4BookingSignal | null;
}

export const E4_DETECTION_THRESHOLDS = {
  highUtilization: 0.7,
  underUtilization: 0.4,
  utilizationMinVehicles: 3,
  utilizationMinCoverage: 0.8,
  revenueGrowthPct: 5,
  revenueDeclinePct: -5,
  cancellationRate: 0.1,
  cancellationMinOutcomes: 10,
  lowMarginPercent: 10,
} as const;

const STRENGTH_VERSION = E4_CALCULATION_VERSIONS.strengthDetection;
const WEAKNESS_VERSION = E4_CALCULATION_VERSIONS.weaknessDetection;

function utilizationEvidenceSufficient(signal: E4UtilizationSignal): boolean {
  return (
    signal.ratio !== null &&
    signal.eligibleVehicles >= E4_DETECTION_THRESHOLDS.utilizationMinVehicles &&
    signal.coverageRatio !== null &&
    signal.coverageRatio >= E4_DETECTION_THRESHOLDS.utilizationMinCoverage
  );
}

function growthPercent(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

export function detectStrengths(signals: E4DetectionSignals): E4StrengthResult[] {
  const results: E4StrengthResult[] = [];
  const { utilization, finance, bookings } = signals;

  if (utilization && utilizationEvidenceSufficient(utilization)) {
    const ratio = utilization.ratio as number;
    if (ratio >= E4_DETECTION_THRESHOLDS.highUtilization) {
      results.push({
        ruleId: 'HIGH_UTILIZATION',
        ruleVersion: STRENGTH_VERSION,
        comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
        evidenceKind: 'OBSERVATION',
        dimension: 'FLEET',
        evidence: {
          metricId: 'ops.fleet_utilization_pct',
          observedValue: ratio * 100,
          comparisonValue: E4_DETECTION_THRESHOLDS.highUtilization * 100,
          threshold: E4_DETECTION_THRESHOLDS.highUtilization * 100,
          unit: 'PERCENT',
          sampleSize: utilization.eligibleVehicles,
        },
      });
    }
  }

  if (
    finance &&
    finance.revenueMinor !== null &&
    finance.previousRevenueMinor !== null &&
    finance.previousRevenueMinor > 0
  ) {
    const growth = growthPercent(finance.revenueMinor, finance.previousRevenueMinor);
    if (growth >= E4_DETECTION_THRESHOLDS.revenueGrowthPct) {
      results.push({
        ruleId: 'REVENUE_GROWTH',
        ruleVersion: STRENGTH_VERSION,
        comparatorBasis: 'PREVIOUS_COMPARABLE_PERIOD',
        evidenceKind: 'OBSERVATION',
        dimension: 'ORGANIZATION',
        evidence: {
          metricId: 'fin.mtd_issued_revenue',
          observedValue: growth,
          comparisonValue: 0,
          threshold: E4_DETECTION_THRESHOLDS.revenueGrowthPct,
          unit: 'SIGNED_PERCENT',
          sampleSize: 1,
        },
      });
    }
  }

  if (bookings && bookings.totalOutcomes >= E4_DETECTION_THRESHOLDS.cancellationMinOutcomes) {
    const rate = bookings.cancelledPlusNoShow / bookings.totalOutcomes;
    if (rate <= E4_DETECTION_THRESHOLDS.cancellationRate) {
      results.push({
        ruleId: 'LOW_CANCELLATION_RATE',
        ruleVersion: STRENGTH_VERSION,
        comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
        evidenceKind: 'OBSERVATION',
        dimension: 'BOOKINGS',
        evidence: {
          metricId: null,
          observedValue: rate * 100,
          comparisonValue: E4_DETECTION_THRESHOLDS.cancellationRate * 100,
          threshold: E4_DETECTION_THRESHOLDS.cancellationRate * 100,
          unit: 'PERCENT',
          sampleSize: bookings.totalOutcomes,
        },
      });
    }
  }

  return sortByRuleId(results);
}

function severityFromGap(gap: number, warning: number, critical: number): E4Severity {
  if (gap >= critical) return 'CRITICAL';
  if (gap >= warning) return 'WARNING';
  return 'INFO';
}

export function detectWeaknesses(signals: E4DetectionSignals): E4WeaknessResult[] {
  const results: E4WeaknessResult[] = [];
  const { utilization, finance, bookings } = signals;

  if (utilization && utilizationEvidenceSufficient(utilization)) {
    const ratio = utilization.ratio as number;
    if (ratio < E4_DETECTION_THRESHOLDS.underUtilization) {
      const gapPercent = (E4_DETECTION_THRESHOLDS.underUtilization - ratio) * 100;
      results.push({
        ruleId: 'UNDERUTILIZATION',
        ruleVersion: WEAKNESS_VERSION,
        severity: severityFromGap(gapPercent, 10, 25),
        comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
        evidenceKind: 'OBSERVATION',
        dimension: 'FLEET',
        evidence: {
          metricId: 'ops.fleet_utilization_pct',
          observedValue: ratio * 100,
          comparisonValue: E4_DETECTION_THRESHOLDS.underUtilization * 100,
          threshold: E4_DETECTION_THRESHOLDS.underUtilization * 100,
          unit: 'PERCENT',
          sampleSize: utilization.eligibleVehicles,
        },
      });
    }
  }

  if (
    finance &&
    finance.revenueMinor !== null &&
    finance.previousRevenueMinor !== null &&
    finance.previousRevenueMinor > 0
  ) {
    const growth = growthPercent(finance.revenueMinor, finance.previousRevenueMinor);
    if (growth <= E4_DETECTION_THRESHOLDS.revenueDeclinePct) {
      results.push({
        ruleId: 'DECLINING_REVENUE',
        ruleVersion: WEAKNESS_VERSION,
        severity: severityFromGap(Math.abs(growth), 5, 15),
        comparatorBasis: 'PREVIOUS_COMPARABLE_PERIOD',
        evidenceKind: 'OBSERVATION',
        dimension: 'ORGANIZATION',
        evidence: {
          metricId: 'fin.mtd_issued_revenue',
          observedValue: growth,
          comparisonValue: 0,
          threshold: E4_DETECTION_THRESHOLDS.revenueDeclinePct,
          unit: 'SIGNED_PERCENT',
          sampleSize: 1,
        },
      });
    }
  }

  if (
    finance &&
    finance.marginPercent !== null &&
    finance.revenueMinor !== null &&
    finance.revenueMinor > 0
  ) {
    if (finance.marginPercent < E4_DETECTION_THRESHOLDS.lowMarginPercent) {
      const gap = E4_DETECTION_THRESHOLDS.lowMarginPercent - finance.marginPercent;
      results.push({
        ruleId: 'LOW_MARGIN',
        ruleVersion: WEAKNESS_VERSION,
        severity: severityFromGap(gap, 5, 15),
        comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
        evidenceKind: 'OBSERVATION',
        dimension: 'ORGANIZATION',
        evidence: {
          metricId: 'fin.profit_margin_mtd',
          observedValue: finance.marginPercent,
          comparisonValue: E4_DETECTION_THRESHOLDS.lowMarginPercent,
          threshold: E4_DETECTION_THRESHOLDS.lowMarginPercent,
          unit: 'SIGNED_PERCENT',
          sampleSize: 1,
        },
      });
    }
  }

  if (bookings && bookings.totalOutcomes >= E4_DETECTION_THRESHOLDS.cancellationMinOutcomes) {
    const rate = bookings.cancelledPlusNoShow / bookings.totalOutcomes;
    if (rate > E4_DETECTION_THRESHOLDS.cancellationRate) {
      const gap = (rate - E4_DETECTION_THRESHOLDS.cancellationRate) * 100;
      results.push({
        ruleId: 'HIGH_CANCELLATION_RATE',
        ruleVersion: WEAKNESS_VERSION,
        severity: severityFromGap(gap, 5, 15),
        comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
        evidenceKind: 'OBSERVATION',
        dimension: 'BOOKINGS',
        evidence: {
          metricId: null,
          observedValue: rate * 100,
          comparisonValue: E4_DETECTION_THRESHOLDS.cancellationRate * 100,
          threshold: E4_DETECTION_THRESHOLDS.cancellationRate * 100,
          unit: 'PERCENT',
          sampleSize: bookings.totalOutcomes,
        },
      });
    }
  }

  return sortWeaknesses(results);
}

const SEVERITY_RANK: Readonly<Record<E4Severity, number>> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

function sortByRuleId<T extends { ruleId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
}

function sortWeaknesses(items: E4WeaknessResult[]): E4WeaknessResult[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
}

/**
 * Asserts strengths and weaknesses never contradict on the same dimension and
 * removes exact duplicate ids. Returns the number of contradictions found (must
 * be 0). This is a deterministic reconciliation used by the service and tests.
 */
export function reconcileDetections(
  strengths: readonly E4StrengthResult[],
  weaknesses: readonly E4WeaknessResult[],
): {
  readonly strengths: readonly E4StrengthResult[];
  readonly weaknesses: readonly E4WeaknessResult[];
  readonly contradictionCount: number;
  readonly duplicateCount: number;
} {
  const dedupedStrengths = dedupeById(strengths);
  const dedupedWeaknesses = dedupeById(weaknesses);
  const duplicateCount =
    strengths.length -
    dedupedStrengths.length +
    (weaknesses.length - dedupedWeaknesses.length);

  const strengthDims = new Map<string, string>();
  for (const strength of dedupedStrengths) {
    strengthDims.set(`${strength.dimension}:${familyOf(strength.ruleId)}`, strength.ruleId);
  }
  let contradictionCount = 0;
  for (const weakness of dedupedWeaknesses) {
    if (strengthDims.has(`${weakness.dimension}:${familyOf(weakness.ruleId)}`)) {
      contradictionCount += 1;
    }
  }

  return {
    strengths: dedupedStrengths,
    weaknesses: dedupedWeaknesses,
    contradictionCount,
    duplicateCount,
  };
}

function familyOf(ruleId: string): string {
  if (ruleId.includes('UTILIZATION')) return 'UTILIZATION';
  if (ruleId.includes('REVENUE')) return 'REVENUE';
  if (ruleId.includes('CANCELLATION')) return 'CANCELLATION';
  if (ruleId.includes('MARGIN')) return 'MARGIN';
  return ruleId;
}

function dedupeById<T extends { ruleId: string; dimension: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.ruleId}:${item.dimension}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
