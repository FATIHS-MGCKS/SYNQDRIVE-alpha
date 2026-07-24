/**
 * Strengths & weaknesses cockpit resolver (Prompt 32/54).
 */
import type { EvaluationsDetectedStrength } from './evaluations-strength-detection.contract';
import type {
  EvaluationsDetectedWeakness,
  EvaluationsWeaknessEvidenceKind,
  EvaluationsWeaknessSeverity,
} from './evaluations-weakness-detection.contract';
import {
  EVALUATIONS_SW_COCKPIT_VERSION,
  type ResolveSwCockpitInput,
  type SwCockpitCategory,
  type SwCockpitComparisonBasisKey,
  type SwCockpitConfidence,
  type SwCockpitDataCoverage,
  type SwCockpitDimensionKey,
  type SwCockpitDrillDownSection,
  type SwCockpitEmptyReason,
  type SwCockpitEntitySummary,
  type SwCockpitFinding,
  type SwCockpitImpact,
  type SwCockpitResult,
} from './evaluations-sw-cockpit.contract';

const CATEGORY_RANK: Record<SwCockpitCategory, number> = {
  CRITICAL_RISK: 0,
  RISK: 1,
  IMPROVEMENT_POTENTIAL: 2,
  OBSERVATION: 3,
  STRENGTH: 4,
};

const SEVERITY_RANK: Record<EvaluationsWeaknessSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

const CONFIDENCE_RANK: Record<SwCockpitConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/** Cross-source root-cause groups — only one finding per group is shown. */
const ROOT_CAUSE_GROUPS: Record<string, { strengths: string[]; weaknesses: string[] }> = {
  utilization: {
    strengths: ['HIGH_UTILIZATION', 'STRONG_STATION', 'STRONG_VEHICLE_CLASS'],
    weaknesses: ['UNDERUTILIZATION', 'STATION_BOTTLENECKS'],
  },
  revenue: {
    strengths: ['REVENUE_GROWTH'],
    weaknesses: ['DECLINING_REVENUE', 'LOW_MARGIN', 'RISING_COSTS'],
  },
  receivables: {
    strengths: ['HIGH_PAYMENT_COLLECTION', 'LOW_OVERDUE_RATE'],
    weaknesses: ['HIGH_OVERDUE_RECEIVABLES'],
  },
  bookings: {
    strengths: ['LOW_CANCELLATION_RATE'],
    weaknesses: ['HIGH_CANCELLATION_RATE', 'HIGH_NO_SHOW_RATE'],
  },
  downtime: {
    strengths: ['LOW_UNPLANNED_DOWNTIME', 'SHORT_TURNAROUND'],
    weaknesses: ['LONG_TURNAROUND', 'RECURRING_VEHICLE_BREAKDOWNS'],
  },
  damage: {
    strengths: ['LOW_DAMAGE_RATE'],
    weaknesses: ['HIGH_DAMAGE_RATE'],
  },
  availability: {
    strengths: ['STABLE_VEHICLE_AVAILABILITY'],
    weaknesses: ['RECURRING_VEHICLE_BREAKDOWNS'],
  },
  data_quality: {
    strengths: ['GOOD_DATA_QUALITY'],
    weaknesses: ['POOR_DATA_QUALITY'],
  },
};

const STRENGTH_DRILL_DOWN: Record<string, SwCockpitDrillDownSection> = {
  HIGH_UTILIZATION: 'fleet',
  REVENUE_GROWTH: 'finance',
  HIGH_PAYMENT_COLLECTION: 'finance',
  LOW_OVERDUE_RATE: 'finance',
  LOW_CANCELLATION_RATE: 'fleet',
  LOW_UNPLANNED_DOWNTIME: 'costs_downtime',
  SHORT_TURNAROUND: 'fleet',
  LOW_DAMAGE_RATE: 'costs_downtime',
  STABLE_VEHICLE_AVAILABILITY: 'fleet',
  GOOD_DATA_QUALITY: 'data_quality',
  STRONG_STATION: 'fleet',
  STRONG_VEHICLE_CLASS: 'fleet',
};

const WEAKNESS_DRILL_DOWN: Record<string, SwCockpitDrillDownSection> = {
  UNDERUTILIZATION: 'fleet',
  DECLINING_REVENUE: 'finance',
  RISING_COSTS: 'costs_downtime',
  LOW_MARGIN: 'finance',
  HIGH_OVERDUE_RECEIVABLES: 'finance',
  HIGH_CANCELLATION_RATE: 'fleet',
  HIGH_NO_SHOW_RATE: 'fleet',
  LONG_TURNAROUND: 'fleet',
  RECURRING_VEHICLE_BREAKDOWNS: 'costs_downtime',
  HIGH_DAMAGE_RATE: 'costs_downtime',
  STATION_BOTTLENECKS: 'fleet',
  COMPLIANCE_RISKS: 'risks',
  POOR_DATA_QUALITY: 'data_quality',
};

function weaknessCategory(
  severity: EvaluationsWeaknessSeverity,
  evidenceKind: EvaluationsWeaknessEvidenceKind,
): SwCockpitCategory {
  if (severity === 'CRITICAL') return 'CRITICAL_RISK';
  if (severity === 'WARNING') return 'RISK';
  if (evidenceKind === 'OBSERVATION') return 'OBSERVATION';
  return 'IMPROVEMENT_POTENTIAL';
}

function formatCoverage(
  numerator: number,
  denominator: number,
  percent: number | null,
  locale: 'de' | 'en',
): string {
  if (denominator <= 0) {
    return locale === 'de' ? 'Keine Abdeckung' : 'No coverage';
  }
  const pct =
    percent != null
      ? `${Math.round(percent)}%`
      : `${Math.round((numerator / denominator) * 100)}%`;
  return locale === 'de'
    ? `${numerator}/${denominator} Datenpunkte (${pct})`
    : `${numerator}/${denominator} data points (${pct})`;
}

function strengthEntitySummary(strength: EvaluationsDetectedStrength): SwCockpitEntitySummary {
  const grouped =
    strength.affectedDimension === 'STATION' || strength.affectedDimension === 'VEHICLE_CLASS';
  return {
    entityType: strength.affectedDimension as SwCockpitDimensionKey,
    vehicles: grouped ? 0 : strength.affectedDimension === 'FLEET' ? 1 : 0,
    stations: strength.affectedDimension === 'STATION' ? 1 : 0,
    bookings: 0,
    insightGroups: 0,
    dimensionKey: strength.dimensionKey,
    dimensionLabel: strength.dimensionLabel,
    isGrouped: grouped,
  };
}

function weaknessEntitySummary(weakness: EvaluationsDetectedWeakness): SwCockpitEntitySummary {
  const entities = weakness.affectedEntities;
  const grouped =
    entities.entityType !== 'ORG' &&
    (entities.vehicles > 1 || entities.stations > 1 || entities.bookings > 1);
  return {
    entityType: entities.entityType as SwCockpitDimensionKey,
    vehicles: entities.vehicles,
    stations: entities.stations,
    bookings: entities.bookings,
    insightGroups: entities.insightGroups,
    dimensionKey: entities.dimensionKey,
    dimensionLabel: entities.dimensionLabel,
    isGrouped: grouped,
  };
}

function strengthImpact(strength: EvaluationsDetectedStrength): SwCockpitImpact | null {
  const q = strength.quantitativeImprovement;
  if (!q) {
    return { kind: 'operational', label: strength.rationale, amountMinor: null, currency: null, isEstimate: false, isForecast: false };
  }
  return {
    kind: 'operational',
    label: q.label,
    amountMinor: q.unit === 'currency_minor' ? q.value : null,
    currency: q.unit === 'currency_minor' ? 'EUR' : null,
    isEstimate: false,
    isForecast: false,
  };
}

function weaknessImpact(weakness: EvaluationsDetectedWeakness): SwCockpitImpact | null {
  const fin = weakness.financialImpact;
  if (fin?.amountMinor != null) {
    return {
      kind: 'financial',
      label: fin.label,
      amountMinor: fin.amountMinor,
      currency: fin.currency,
      isEstimate: fin.kind === 'ESTIMATE',
      isForecast: fin.kind === 'FORECAST',
    };
  }
  if (fin?.label) {
    return {
      kind: 'operational',
      label: fin.label,
      amountMinor: null,
      currency: fin.currency,
      isEstimate: fin.kind === 'ESTIMATE',
      isForecast: fin.kind === 'FORECAST',
    };
  }
  return {
    kind: 'operational',
    label: weakness.quantitativeDeviation.label,
    amountMinor: null,
    currency: null,
    isEstimate: weakness.quantitativeDeviation.kind === 'ESTIMATE',
    isForecast: weakness.quantitativeDeviation.kind === 'FORECAST',
  };
}

function strengthCoverage(
  strength: EvaluationsDetectedStrength,
  locale: 'de' | 'en',
): SwCockpitDataCoverage {
  const c = strength.dataCoverage;
  const percent = c.percent;
  const isPartial = percent != null && percent < 80;
  return {
    numerator: c.numerator,
    denominator: c.denominator,
    percent,
    label: formatCoverage(c.numerator, c.denominator, percent, locale),
    isPartial,
    notes: c.notes,
  };
}

function weaknessCoverage(
  weakness: EvaluationsDetectedWeakness,
  locale: 'de' | 'en',
): SwCockpitDataCoverage {
  const c = weakness.dataCoverage;
  const percent = c.percent;
  const isPartial = percent != null && percent < 80;
  return {
    numerator: c.numerator,
    denominator: c.denominator,
    percent,
    label: formatCoverage(c.numerator, c.denominator, percent, locale),
    isPartial,
    notes: c.notes,
  };
}

function strengthFinding(strength: EvaluationsDetectedStrength, locale: 'de' | 'en'): SwCockpitFinding {
  const impact = strengthImpact(strength);
  return {
    key: `strength:${strength.id}:${strength.dimensionKey ?? 'org'}`,
    sourceKind: 'STRENGTH',
    sourceId: strength.id,
    category: 'STRENGTH',
    categoryRank: CATEGORY_RANK.STRENGTH,
    title: strength.title,
    explanation: strength.description,
    quantitativeBasis: strength.quantitativeImprovement?.label ?? strength.underlyingKpi,
    comparisonBasisKey: strength.comparisonBasis as SwCockpitComparisonBasisKey,
    periodLabel: strength.period.label,
    comparisonPeriodLabel: strength.comparisonPeriod?.label ?? null,
    affectedDimensionKey: strength.affectedDimension as SwCockpitDimensionKey,
    dimensionLabel: strength.dimensionLabel ?? null,
    impact,
    confidence: strength.confidence,
    dataCoverage: strengthCoverage(strength, locale),
    underlyingKpis: [strength.underlyingKpi],
    recommendation: null,
    rationale: strength.rationale,
    driverAnalysis: strength.driverAnalysis ?? null,
    entitySummary: strengthEntitySummary(strength),
    drillDownSection: STRENGTH_DRILL_DOWN[strength.id] ?? 'executive',
    sortPriority: 1000,
    impactScore: impact?.amountMinor ?? 0,
    urgencyScore: 0,
    dedupeGroup: resolveRootCauseGroup(strength.id, 'STRENGTH'),
  };
}

function weaknessFinding(weakness: EvaluationsDetectedWeakness, locale: 'de' | 'en'): SwCockpitFinding {
  const category = weaknessCategory(weakness.severity, weakness.quantitativeDeviation.kind);
  const impact = weaknessImpact(weakness);
  return {
    key: `weakness:${weakness.id}:${weakness.affectedEntities.dimensionKey ?? 'org'}`,
    sourceKind: 'WEAKNESS',
    sourceId: weakness.id,
    category,
    categoryRank: CATEGORY_RANK[category],
    title: weakness.title,
    explanation: weakness.description,
    quantitativeBasis: weakness.quantitativeDeviation.label,
    comparisonBasisKey: weakness.comparisonBasis as SwCockpitComparisonBasisKey,
    periodLabel: weakness.period.label,
    comparisonPeriodLabel: weakness.comparisonPeriod?.label ?? null,
    affectedDimensionKey: weakness.affectedEntities.entityType as SwCockpitDimensionKey,
    dimensionLabel: weakness.affectedEntities.dimensionLabel ?? null,
    impact,
    confidence: weakness.confidence,
    dataCoverage: weaknessCoverage(weakness, locale),
    underlyingKpis: weakness.underlyingKpis,
    recommendation: weakness.recommendedNextAnalysis,
    rationale: null,
    driverAnalysis: weakness.driverAnalysis ?? null,
    entitySummary: weaknessEntitySummary(weakness),
    drillDownSection: WEAKNESS_DRILL_DOWN[weakness.id] ?? 'executive',
    sortPriority: weakness.priority,
    impactScore: impact?.amountMinor ?? 0,
    urgencyScore: SEVERITY_RANK[weakness.severity] * 100 + weakness.priority,
    dedupeGroup: resolveRootCauseGroup(weakness.id, 'WEAKNESS'),
  };
}

function resolveRootCauseGroup(
  id: string,
  kind: 'STRENGTH' | 'WEAKNESS',
): string | null {
  for (const [groupKey, group] of Object.entries(ROOT_CAUSE_GROUPS)) {
    const list = kind === 'STRENGTH' ? group.strengths : group.weaknesses;
    if (list.includes(id)) return groupKey;
  }
  return null;
}

function findingWinsConflict(a: SwCockpitFinding, b: SwCockpitFinding): SwCockpitFinding {
  if (a.categoryRank !== b.categoryRank) {
    return a.categoryRank < b.categoryRank ? a : b;
  }
  if (a.impactScore !== b.impactScore) {
    return a.impactScore > b.impactScore ? a : b;
  }
  if (a.urgencyScore !== b.urgencyScore) {
    return a.urgencyScore < b.urgencyScore ? a : b;
  }
  return a.sortPriority <= b.sortPriority ? a : b;
}

function crossDedupeFindings(findings: SwCockpitFinding[]): { findings: SwCockpitFinding[]; suppressed: number } {
  const byGroup = new Map<string, SwCockpitFinding>();
  const ungrouped: SwCockpitFinding[] = [];
  let suppressed = 0;

  for (const finding of findings) {
    if (!finding.dedupeGroup) {
      ungrouped.push(finding);
      continue;
    }
    const groupKey = `${finding.dedupeGroup}:${finding.dimensionLabel ?? finding.entitySummary.dimensionKey ?? 'org'}`;
    const existing = byGroup.get(groupKey);
    if (!existing) {
      byGroup.set(groupKey, finding);
      continue;
    }
    const winner = findingWinsConflict(finding, existing);
    if (winner.key !== existing.key) suppressed += 1;
    else if (winner.key !== finding.key) suppressed += 1;
    byGroup.set(groupKey, winner);
  }

  const byKey = new Map<string, SwCockpitFinding>();
  for (const f of [...byGroup.values(), ...ungrouped]) {
    const dedupeKey = `${f.sourceId}:${f.entitySummary.dimensionKey ?? 'org'}`;
    const existing = byKey.get(dedupeKey);
    if (!existing) {
      byKey.set(dedupeKey, f);
      continue;
    }
    const winner = findingWinsConflict(f, existing);
    if (winner.key !== existing.key || winner.key !== f.key) suppressed += 1;
    byKey.set(dedupeKey, winner);
  }

  return { findings: [...byKey.values()], suppressed };
}

function sortFindings(findings: SwCockpitFinding[]): SwCockpitFinding[] {
  return [...findings].sort((a, b) => {
    if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;
    if (a.impactScore !== b.impactScore) return b.impactScore - a.impactScore;
    if (a.urgencyScore !== b.urgencyScore) return a.urgencyScore - b.urgencyScore;
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  });
}

function resolveEmptyReason(
  findings: SwCockpitFinding[],
  strengthsStatus: string | null | undefined,
  weaknessesStatus: string | null | undefined,
): SwCockpitEmptyReason | null {
  if (findings.length > 0) return null;
  if (strengthsStatus === 'ERROR' || weaknessesStatus === 'ERROR') return 'SECTION_ERROR';
  if (strengthsStatus === 'UNAVAILABLE' && weaknessesStatus === 'UNAVAILABLE') {
    return 'SECTION_UNAVAILABLE';
  }
  if (
    strengthsStatus === 'PARTIAL' &&
    weaknessesStatus === 'PARTIAL'
  ) {
    return 'INSUFFICIENT_DATA';
  }
  return 'NO_FINDINGS';
}

function categoryCounts(findings: SwCockpitFinding[]): Record<SwCockpitCategory, number> {
  const counts: Record<SwCockpitCategory, number> = {
    STRENGTH: 0,
    IMPROVEMENT_POTENTIAL: 0,
    OBSERVATION: 0,
    RISK: 0,
    CRITICAL_RISK: 0,
  };
  for (const f of findings) counts[f.category] += 1;
  return counts;
}

export function resolveSwCockpit(input: ResolveSwCockpitInput): SwCockpitResult {
  const locale = input.locale ?? 'de';
  const strengthItems = input.strengths ?? [];
  const weaknessItems = input.weaknesses ?? [];

  const raw: SwCockpitFinding[] = [
    ...strengthItems.map((s) => strengthFinding(s, locale)),
    ...weaknessItems.map((w) => weaknessFinding(w, locale)),
  ];

  const { findings: deduped, suppressed } = crossDedupeFindings(raw);
  const findings = sortFindings(deduped);

  return {
    calculationVersion: EVALUATIONS_SW_COCKPIT_VERSION,
    findings,
    categoryCounts: categoryCounts(findings),
    emptyReason: resolveEmptyReason(findings, input.strengthsStatus, input.weaknessesStatus),
    strengthsStatus: input.strengthsStatus ?? null,
    weaknessesStatus: input.weaknessesStatus ?? null,
    suppressedDuplicates: suppressed,
  };
}

export function filterSwCockpitByCategory(
  result: SwCockpitResult,
  category: SwCockpitCategory | 'ALL',
): SwCockpitFinding[] {
  if (category === 'ALL') return result.findings;
  return result.findings.filter((f) => f.category === category);
}

export function swCockpitCategoryLabelKey(category: SwCockpitCategory): string {
  return `evaluations.swCockpit.category.${category}`;
}
