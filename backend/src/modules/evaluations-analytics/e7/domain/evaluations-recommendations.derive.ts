/**
 * Pure E7 recommendation derivation — deterministic, evidence-backed, no I/O.
 */
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsMetricStatus } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import type { EvaluationsAnalyticsInsightsSummary } from '../../e4/contracts/evaluations-insights.contract';
import type { E4WeaknessResult, E4StrengthResult } from '../../e4/contracts/evaluations-insights.contract';
import type { EvaluationsQualityReport } from '../../e5/contracts/evaluations-quality.contract';
import {
  E7_QUALITY_DIMENSIONS,
  E7_RECOMMENDATIONS_CALCULATION_VERSION,
  E7_RECOMMENDATIONS_SCHEMA_VERSION,
  type E7EvaluationsSectionTarget,
  type E7QualityLimitation,
  type E7Recommendation,
  type E7RecommendationAction,
  type E7RecommendationEmptyState,
  type E7RecommendationFamily,
  type E7RecommendationProvenance,
  type E7RecommendationScope,
  type EvaluationsRecommendationsResponse,
} from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { assertValidE7ActionTarget } from '@synq/evaluations-recommendations/evaluations-recommendations-action-target';
import {
  E7_FAMILY_CATEGORY,
  E7_RECOMMENDATION_SORT_BUCKET_ORDER,
  E7_SEVERITY_RANK,
  E7_WEAKNESS_RULE_UNDERUTILIZATION,
} from '@synq/evaluations-recommendations/evaluations-recommendations.constants';
import { buildE7RecommendationId } from '@synq/evaluations-recommendations/evaluations-recommendations-id';

export const E7_FINANCE_METRIC_OVERDUE = 'fin.overdue_receivables';
export const E7_FINANCE_METRIC_OPEN = 'fin.open_receivables';

/** Canonical E3 non-overdue open receivables metric (total minus overdue). */
export const OPEN_RECEIVABLES_SOURCE = E7_FINANCE_METRIC_OPEN;

export interface E7DerivationInput {
  readonly summary: EvaluationsAnalyticsInsightsSummary;
  readonly quality: EvaluationsQualityReport;
  readonly requestPeriod: EvaluationsPeriodWindow;
  readonly scope: E7RecommendationScope;
  readonly generatedAt: string;
}

type DraftRecommendation = Omit<E7Recommendation, 'id'> & { readonly id?: string };

function isValueAvailable(status: EvaluationsMetricStatus): boolean {
  return status === 'AVAILABLE' || status === 'PARTIAL' || status === 'STALE';
}

/** Finance recommendations require exact E3 metric status AVAILABLE (E7A/E7B.1). */
function readFinanceMoney(metric: EvaluationsMetricResponse | undefined): EvaluationsMoney | null {
  if (!metric || metric.valueType !== 'MONEY') return null;
  if (metric.status !== 'AVAILABLE') return null;
  return metric.value ?? null;
}

function sectionNavigationAction(
  section: E7EvaluationsSectionTarget,
  labelKey: string,
): E7RecommendationAction {
  const target = { kind: 'EVALUATIONS_SECTION' as const, value: section };
  assertValidE7ActionTarget(target);
  return {
    actionType: 'NAVIGATION',
    mutating: false,
    labelKey,
    target,
    requiredPermission: 'evaluations:read',
    confirmationRequired: false,
  };
}

function buildProvenance(
  partial: Omit<E7RecommendationProvenance, 'calculationVersion'>,
): E7RecommendationProvenance {
  return { calculationVersion: E7_RECOMMENDATIONS_CALCULATION_VERSION, ...partial };
}

export function qualityLimitationKey(l: E7QualityLimitation): string {
  return `${l.section ?? ''}:${l.dimension}:${l.state}:${l.reason ?? ''}`;
}

/** E5 quality limitations for the source sections a recommendation relies on. */
export function qualityLimitationsForSections(
  quality: EvaluationsQualityReport,
  sourceSections: readonly string[],
): E7QualityLimitation[] {
  const wanted = new Set(sourceSections);
  const out: E7QualityLimitation[] = [];
  for (const section of quality.sections) {
    if (!wanted.has(section.section)) continue;
    for (const dim of E7_QUALITY_DIMENSIONS) {
      const state = section.dimensions[dim];
      if (dim === 'FRESHNESS' && state === 'UNKNOWN') {
        out.push({
          dimension: dim,
          state,
          section: section.section,
          reason: 'STRUCTURAL_PIPELINE_UNKNOWN',
        });
        continue;
      }
      if (state === 'PARTIAL' || state === 'UNAVAILABLE' || (dim !== 'FRESHNESS' && state === 'UNKNOWN')) {
        out.push({ dimension: dim, state, section: section.section, reason: section.reason });
      }
    }
  }
  return out;
}

function getActionableQualityLimitations(quality: EvaluationsQualityReport): E7QualityLimitation[] {
  if (quality.overall.status === 'UNAVAILABLE' || quality.overall.status === 'ERROR') {
    return [];
  }
  const out: E7QualityLimitation[] = [];
  for (const section of quality.sections) {
    if (section.status === 'PARTIAL') {
      out.push({
        dimension: 'COMPLETENESS',
        state: 'PARTIAL',
        section: section.section,
        reason: section.reason,
      });
    }
    if (section.status === 'UNAVAILABLE' && section.section !== 'finance') {
      out.push({
        dimension: 'COMPLETENESS',
        state: 'UNAVAILABLE',
        section: section.section,
        reason: section.reason,
      });
    }
    for (const dim of E7_QUALITY_DIMENSIONS) {
      const state = section.dimensions[dim];
      if (dim === 'FRESHNESS' && state === 'UNKNOWN') continue;
      if (dim === 'VALIDITY' && state === 'UNKNOWN') continue;
      if (state === 'PARTIAL' || state === 'UNAVAILABLE' || (dim !== 'FRESHNESS' && state === 'UNKNOWN')) {
        out.push({ dimension: dim, state, section: section.section, reason: section.reason });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((l) => {
    const key = qualityLimitationKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function limitationsCoveredByFamily(
  family: E7RecommendationFamily,
  limitations: readonly E7QualityLimitation[],
): readonly string[] {
  if (family === 'COST_EVIDENCE_INCOMPLETE') {
    return limitations.filter((l) => l.section === 'costModel').map(qualityLimitationKey);
  }
  if (family === 'DETECTION_INPUT_SKIPPED') {
    return limitations
      .filter((l) => l.section === 'strengths' || l.section === 'weaknesses')
      .map(qualityLimitationKey);
  }
  return [];
}

function finalizeDraft(draft: DraftRecommendation): E7Recommendation {
  for (const action of draft.actions) {
    assertValidE7ActionTarget(action.target);
  }
  const period = draft.provenance.period;
  const id =
    draft.id ??
    buildE7RecommendationId({
      organizationId: draft.provenance.scope.organizationId,
      stationIds: draft.provenance.scope.stationIds,
      period,
      family: draft.family,
      sourceRuleId: draft.provenance.sourceRuleIds[0] ?? null,
      sourceMetricId: draft.provenance.sourceMetricIds[0] ?? null,
      dimension:
        draft.provenance.derivationReason.includes(':')
          ? draft.provenance.derivationReason.split(':').pop() ?? null
          : null,
      derivationReason: draft.provenance.derivationReason,
      currency:
        draft.copyParams.find((p) => p.type === 'MONEY')?.value &&
        typeof draft.copyParams.find((p) => p.type === 'MONEY')?.value === 'object'
          ? (draft.copyParams.find((p) => p.type === 'MONEY')!.value as EvaluationsMoney).currency
          : null,
    });
  return { ...draft, id };
}

function deriveReceivables(input: E7DerivationInput): DraftRecommendation[] {
  const { summary, scope, quality } = input;
  const finance = summary.sections.finance;
  const overdueMetric = finance.metrics[E7_FINANCE_METRIC_OVERDUE];
  const openMetric = finance.metrics[E7_FINANCE_METRIC_OPEN];
  const overdueMoney = readFinanceMoney(overdueMetric);
  const openMoney = readFinanceMoney(openMetric);
  const financePeriod = overdueMetric?.period ?? openMetric?.period ?? summary.period;
  const financeQuality = qualityLimitationsForSections(quality, ['finance']);
  const out: DraftRecommendation[] = [];

  if (overdueMoney && overdueMoney.amountMinor > 0) {
    out.push({
      family: 'RECEIVABLES_ATTENTION',
      category: E7_FAMILY_CATEGORY.RECEIVABLES_ATTENTION,
      severity: 'WARNING',
      titleKey: 'evaluations.recommendations.receivablesAttention.title',
      explanationKey: 'evaluations.recommendations.receivablesAttention.explanation',
      copyParams: [{ key: 'amount', type: 'MONEY', value: overdueMoney }],
      actionability: 'ACTIONABLE',
      actions: [sectionNavigationAction('finance', 'evaluations.recommendations.actions.viewFinance')],
      provenance: buildProvenance({
        sourceSections: ['finance'],
        sourceRuleIds: [],
        sourceMetricIds: [E7_FINANCE_METRIC_OVERDUE],
        period: financePeriod,
        sourcePeriods: [{ source: 'finance', period: financePeriod }],
        scope,
        inputStatuses: {
          finance: finance.status,
          [E7_FINANCE_METRIC_OVERDUE]: overdueMetric?.status ?? 'UNAVAILABLE',
        },
        qualityLimitations: financeQuality,
        lineageRefs: [],
        derivationReason: `RECEIVABLES_OVERDUE:${overdueMoney.currency}`,
      }),
    });
  }

  // OPEN_RECEIVABLES_REVIEW uses E3 fin.open_receivables (non-overdue population).
  // When overdue > 0, suppress open review: UI_ACTION_SUPERSESSION (same Finance surface).
  if (
    openMoney &&
    openMoney.amountMinor > 0 &&
    (!overdueMoney || overdueMoney.amountMinor === 0)
  ) {
    out.push({
      family: 'OPEN_RECEIVABLES_REVIEW',
      category: E7_FAMILY_CATEGORY.OPEN_RECEIVABLES_REVIEW,
      severity: 'INFO',
      titleKey: 'evaluations.recommendations.openReceivablesReview.title',
      explanationKey: 'evaluations.recommendations.openReceivablesReview.explanation',
      copyParams: [{ key: 'amount', type: 'MONEY', value: openMoney }],
      actionability: 'ACTIONABLE',
      actions: [sectionNavigationAction('finance', 'evaluations.recommendations.actions.viewFinance')],
      provenance: buildProvenance({
        sourceSections: ['finance'],
        sourceRuleIds: [],
        sourceMetricIds: [OPEN_RECEIVABLES_SOURCE],
        period: financePeriod,
        sourcePeriods: [{ source: 'finance', period: financePeriod }],
        scope,
        inputStatuses: {
          finance: finance.status,
          [OPEN_RECEIVABLES_SOURCE]: openMetric?.status ?? 'UNAVAILABLE',
        },
        qualityLimitations: financeQuality,
        lineageRefs: [],
        derivationReason: `OPEN_RECEIVABLES:${openMoney.currency}`,
      }),
    });
  }

  return out;
}

function weaknessCategory(ruleId: string, dimension: string): E7Recommendation['category'] {
  if (ruleId.includes('UTILIZATION') || dimension === 'FLEET') return 'FLEET';
  if (ruleId.includes('CANCELLATION') || dimension === 'BOOKINGS') return 'OPERATIONS';
  return 'OPERATIONS';
}

function deriveFromWeakness(
  input: E7DerivationInput,
  weakness: E4WeaknessResult,
): DraftRecommendation | null {
  const { summary, scope, quality } = input;
  const section = summary.sections.weaknesses;
  if (!isValueAvailable(section.status)) return null;
  const sourceSections = ['weaknesses'] as const;
  const qualityLimits = qualityLimitationsForSections(quality, sourceSections);

  if (weakness.ruleId === E7_WEAKNESS_RULE_UNDERUTILIZATION) {
    const utilization = summary.sections.utilization;
    const utilizationMetric = utilization.utilizationPercent;
    if (
      !isValueAvailable(utilization.status) ||
      !isValueAvailable(utilizationMetric.status) ||
      utilizationMetric.value === null
    ) {
      return null;
    }
    const utilSections = ['weaknesses', 'utilization'] as const;
    return {
      family: 'UTILIZATION_ATTENTION',
      category: 'FLEET',
      severity: weakness.severity,
      titleKey: 'evaluations.recommendations.utilizationAttention.title',
      explanationKey: 'evaluations.recommendations.utilizationAttention.explanation',
      copyParams: [
        { key: 'observedPercent', type: 'PERCENT', value: weakness.evidence.observedValue },
        { key: 'thresholdPercent', type: 'PERCENT', value: weakness.evidence.threshold },
      ],
      actionability: 'ACTIONABLE',
      actions: [sectionNavigationAction('utilization', 'evaluations.recommendations.actions.viewUtilization')],
      provenance: buildProvenance({
        sourceSections: utilSections,
        sourceRuleIds: [weakness.ruleId],
        sourceMetricIds: weakness.evidence.metricId ? [weakness.evidence.metricId] : [],
        period: section.period,
        sourcePeriods: [
          { source: 'weaknesses', period: section.period },
          { source: 'utilization', period: summary.sections.utilization.period },
        ],
        scope,
        inputStatuses: {
          weaknesses: section.status,
          utilization: summary.sections.utilization.status,
        },
        qualityLimitations: qualityLimitationsForSections(quality, utilSections),
        lineageRefs: [],
        derivationReason: `UTILIZATION_UNDER:${weakness.dimension}`,
      }),
    };
  }

  return {
    family: 'WEAKNESS_ATTENTION',
    category: weaknessCategory(weakness.ruleId, weakness.dimension),
    severity: weakness.severity,
    titleKey: 'evaluations.recommendations.weaknessAttention.title',
    explanationKey: 'evaluations.recommendations.weaknessAttention.explanation',
    copyParams: [
      { key: 'ruleId', type: 'TEXT', value: weakness.ruleId },
      { key: 'observed', type: 'NUMBER', value: weakness.evidence.observedValue },
    ],
    actionability: 'ACTIONABLE',
    actions: [sectionNavigationAction('weaknesses', 'evaluations.recommendations.actions.viewWeaknesses')],
    provenance: buildProvenance({
      sourceSections: sourceSections,
      sourceRuleIds: [weakness.ruleId],
      sourceMetricIds: weakness.evidence.metricId ? [weakness.evidence.metricId] : [],
      period: section.period,
      sourcePeriods: [{ source: 'weaknesses', period: section.period }],
      scope,
      inputStatuses: { weaknesses: section.status },
      qualityLimitations: qualityLimits,
      lineageRefs: [],
      derivationReason: `WEAKNESS:${weakness.ruleId}:${weakness.dimension}`,
    }),
  };
}

function deriveStrength(input: E7DerivationInput, strength: E4StrengthResult): DraftRecommendation | null {
  const section = input.summary.sections.strengths;
  if (!isValueAvailable(section.status)) return null;
  const sourceSections = ['strengths'] as const;
  return {
    family: 'STRENGTH_REINFORCE',
    category: 'INSIGHT',
    severity: 'INFO',
    titleKey: 'evaluations.recommendations.strengthReinforce.title',
    explanationKey: 'evaluations.recommendations.strengthReinforce.explanation',
    copyParams: [{ key: 'ruleId', type: 'TEXT', value: strength.ruleId }],
    actionability: 'INFORMATIONAL',
    actions: [sectionNavigationAction('strengths', 'evaluations.recommendations.actions.viewStrengths')],
    provenance: buildProvenance({
      sourceSections: sourceSections,
      sourceRuleIds: [strength.ruleId],
      sourceMetricIds: strength.evidence.metricId ? [strength.evidence.metricId] : [],
      period: section.period,
      sourcePeriods: [{ source: 'strengths', period: section.period }],
      scope: input.scope,
      inputStatuses: { strengths: section.status },
      qualityLimitations: qualityLimitationsForSections(input.quality, sourceSections),
      lineageRefs: [],
      derivationReason: `STRENGTH:${strength.ruleId}:${strength.dimension}`,
    }),
  };
}

function deriveCostIncomplete(input: E7DerivationInput): DraftRecommendation | null {
  const cost = input.summary.sections.costModel;
  if (cost.status !== 'PARTIAL') return null;
  const unsupported = cost.categories.filter((c) => c.status === 'UNAVAILABLE');
  const hasCanonicalEvidence = unsupported.length > 0 || Boolean(cost.reason);
  if (!hasCanonicalEvidence) return null;

  const sourceSections = ['costModel'] as const;
  return {
    family: 'COST_EVIDENCE_INCOMPLETE',
    category: 'OPERATIONS',
    severity: 'INFO',
    titleKey: 'evaluations.recommendations.costEvidenceIncomplete.title',
    explanationKey: 'evaluations.recommendations.costEvidenceIncomplete.explanation',
    copyParams: [{ key: 'reason', type: 'TEXT', value: cost.reason ?? 'COST_SOURCES_UNSUPPORTED' }],
    actionability: 'INFORMATIONAL',
    actions: [sectionNavigationAction('cost', 'evaluations.recommendations.actions.viewCost')],
    provenance: buildProvenance({
      sourceSections: sourceSections,
      sourceRuleIds: [],
      sourceMetricIds: [],
      period: cost.period,
      sourcePeriods: [{ source: 'costModel', period: cost.period }],
      scope: input.scope,
      inputStatuses: { costModel: cost.status },
      qualityLimitations: qualityLimitationsForSections(input.quality, sourceSections),
      lineageRefs: [],
      derivationReason: `COST_INCOMPLETE:${cost.reason ?? 'PARTIAL_CATEGORIES'}`,
    }),
  };
}

function deriveQualityLimited(
  input: E7DerivationInput,
  drafts: readonly DraftRecommendation[],
): DraftRecommendation | null {
  const actionable = getActionableQualityLimitations(input.quality);
  if (actionable.length === 0) return null;

  const covered = new Set<string>();
  for (const draft of drafts) {
    for (const key of limitationsCoveredByFamily(draft.family, actionable)) {
      covered.add(key);
    }
  }

  const remaining = actionable.filter((l) => !covered.has(qualityLimitationKey(l)));
  if (remaining.length === 0) return null;

  return {
    family: 'DATA_QUALITY_LIMITED',
    category: 'QUALITY',
    severity: 'INFO',
    titleKey: 'evaluations.recommendations.dataQualityLimited.title',
    explanationKey: 'evaluations.recommendations.dataQualityLimited.explanation',
    copyParams: [{ key: 'overallStatus', type: 'TEXT', value: input.quality.overall.status }],
    actionability: 'INFORMATIONAL',
    actions: [sectionNavigationAction('quality', 'evaluations.recommendations.actions.viewQuality')],
    provenance: buildProvenance({
      sourceSections: ['quality'],
      sourceRuleIds: [],
      sourceMetricIds: [],
      period: input.quality.period,
      sourcePeriods: [{ source: 'quality', period: input.quality.period }],
      scope: input.scope,
      inputStatuses: { quality: input.quality.overall.status },
      qualityLimitations: remaining,
      lineageRefs: [],
      derivationReason: 'DATA_QUALITY_LIMITED',
    }),
  };
}

function deriveSkippedDetection(input: E7DerivationInput): DraftRecommendation[] {
  const strengths = input.summary.sections.strengths;
  const weaknesses = input.summary.sections.weaknesses;
  const seen = new Set<string>();
  const skipped: { dimension: string; reason: string }[] = [];
  for (const item of [...strengths.skippedDimensions, ...weaknesses.skippedDimensions]) {
    const key = `${item.dimension}::${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skipped.push(item);
  }
  if (skipped.length === 0) return [];

  const sourceSections = ['strengths', 'weaknesses'] as const;
  return [
    {
      family: 'DETECTION_INPUT_SKIPPED',
      category: 'INSIGHT',
      severity: 'INFO',
      titleKey: 'evaluations.recommendations.detectionInputSkipped.title',
      explanationKey: 'evaluations.recommendations.detectionInputSkipped.explanation',
      copyParams: skipped.map((s, i) => ({
        key: `skipped_${i}`,
        type: 'TEXT' as const,
        value: `${s.dimension}:${s.reason}`,
      })),
      actionability: 'INFORMATIONAL',
      actions: [sectionNavigationAction('weaknesses', 'evaluations.recommendations.actions.viewDetection')],
      provenance: buildProvenance({
        sourceSections: sourceSections,
        sourceRuleIds: [],
        sourceMetricIds: [],
        period: input.requestPeriod,
        sourcePeriods: [
          { source: 'strengths', period: strengths.period },
          { source: 'weaknesses', period: weaknesses.period },
        ],
        scope: input.scope,
        inputStatuses: {
          strengths: strengths.status,
          weaknesses: weaknesses.status,
        },
        qualityLimitations: qualityLimitationsForSections(input.quality, sourceSections),
        lineageRefs: [],
        derivationReason: `DETECTION_SKIPPED:${skipped.map((s) => s.dimension).sort().join(',')}`,
      }),
    },
  ];
}

function deriveDriverInfluence(input: E7DerivationInput): DraftRecommendation | null {
  const driver = input.summary.sections.driverInfluence;
  if (driver.status !== 'AVAILABLE') return null;
  if (driver.piiTier === 'none') return null;
  if (driver.factors.length === 0) return null;

  const sourceSections = ['driverInfluence'] as const;
  return {
    family: 'DRIVER_INFLUENCE_REVIEW',
    category: 'DRIVER',
    severity: 'INFO',
    titleKey: 'evaluations.recommendations.driverInfluenceReview.title',
    explanationKey: 'evaluations.recommendations.driverInfluenceReview.explanation',
    copyParams: [{ key: 'factorCount', type: 'COUNT', value: driver.factors.length }],
    actionability: 'ACTIONABLE',
    actions: [sectionNavigationAction('driver', 'evaluations.recommendations.actions.viewDriverInfluence')],
    provenance: buildProvenance({
      sourceSections: sourceSections,
      sourceRuleIds: [],
      sourceMetricIds: [],
      period: driver.period,
      sourcePeriods: [{ source: 'driverInfluence', period: driver.period }],
      scope: input.scope,
      inputStatuses: { driverInfluence: driver.status },
      qualityLimitations: qualityLimitationsForSections(input.quality, sourceSections),
      lineageRefs: [],
      derivationReason: 'DRIVER_INFLUENCE_AVAILABLE',
    }),
  };
}

function sortRecommendations(items: readonly E7Recommendation[]): E7Recommendation[] {
  return [...items].sort((a, b) => {
    const bucket = E7_RECOMMENDATION_SORT_BUCKET_ORDER[a.family] - E7_RECOMMENDATION_SORT_BUCKET_ORDER[b.family];
    if (bucket !== 0) return bucket;
    const sevA = a.severity ? E7_SEVERITY_RANK[a.severity] : 99;
    const sevB = b.severity ? E7_SEVERITY_RANK[b.severity] : 99;
    if (sevA !== sevB) return sevA - sevB;
    const fam = a.family.localeCompare(b.family);
    if (fam !== 0) return fam;
    const reason = a.provenance.derivationReason.localeCompare(b.provenance.derivationReason);
    if (reason !== 0) return reason;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Collection status rollup precedence:
 * 1. ERROR if any governing status is ERROR
 * 2. UNAVAILABLE if all governing statuses are UNAVAILABLE or NOT_APPLICABLE
 * 3. STALE if any governing status is STALE
 * 4. PARTIAL if any governing status is PARTIAL or UNAVAILABLE (mixed)
 * 5. AVAILABLE otherwise
 */
function rollupCollectionStatus(statuses: readonly EvaluationsMetricStatus[]): EvaluationsMetricStatus {
  if (statuses.length === 0) return 'UNAVAILABLE';
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.every((s) => s === 'UNAVAILABLE' || s === 'NOT_APPLICABLE')) return 'UNAVAILABLE';
  if (statuses.includes('STALE')) return 'STALE';
  if (statuses.includes('PARTIAL') || statuses.includes('UNAVAILABLE')) return 'PARTIAL';
  return 'AVAILABLE';
}

function deriveEmptyState(
  recommendations: readonly E7Recommendation[],
  collectionStatus: EvaluationsMetricStatus,
): E7RecommendationEmptyState | null {
  if (recommendations.length > 0) return null;
  if (collectionStatus === 'AVAILABLE') {
    return 'NO_ACTION_NEEDED';
  }
  return 'INSUFFICIENT_EVIDENCE';
}

export function deriveEvaluationsRecommendations(
  input: E7DerivationInput,
): EvaluationsRecommendationsResponse {
  const drafts: DraftRecommendation[] = [];

  drafts.push(...deriveReceivables(input));

  for (const weakness of input.summary.sections.weaknesses.weaknesses) {
    const rec = deriveFromWeakness(input, weakness);
    if (rec) drafts.push(rec);
  }

  for (const strength of input.summary.sections.strengths.strengths) {
    const rec = deriveStrength(input, strength);
    if (rec) drafts.push(rec);
  }

  const costRec = deriveCostIncomplete(input);
  if (costRec) drafts.push(costRec);

  drafts.push(...deriveSkippedDetection(input));

  const qualityRec = deriveQualityLimited(input, drafts);
  if (qualityRec) drafts.push(qualityRec);

  const driverRec = deriveDriverInfluence(input);
  if (driverRec) drafts.push(driverRec);

  const recommendations = sortRecommendations(drafts.map(finalizeDraft));

  const governingStatuses: EvaluationsMetricStatus[] = [
    input.summary.sections.finance.status,
    input.summary.sections.utilization.status,
    input.summary.sections.weaknesses.status,
    input.summary.sections.strengths.status,
    input.summary.sections.costModel.status,
    input.summary.sections.driverInfluence.status,
    input.quality.overall.status,
  ];

  const status = rollupCollectionStatus(governingStatuses);
  const emptyState = deriveEmptyState(recommendations, status);

  return {
    schemaVersion: E7_RECOMMENDATIONS_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    calculationVersion: E7_RECOMMENDATIONS_CALCULATION_VERSION,
    requestPeriod: input.requestPeriod,
    scope: input.scope,
    status,
    reason: emptyState === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT_CANONICAL_EVIDENCE' : null,
    recommendations,
    emptyState,
  };
}
