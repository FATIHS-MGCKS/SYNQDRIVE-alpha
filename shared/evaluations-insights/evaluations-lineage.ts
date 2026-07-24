/**
 * Pure builders for Auswertungen lineage and freshness metadata (Prompt 27/54).
 */
import { DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS } from './evaluations-data-quality.thresholds';
import type { EvaluationsDataSourceKey } from './evaluations-data-quality.contract';
import type { EvaluationsMetricStatus } from './evaluations-analytics-primitives.contract';
import {
  EVALUATIONS_LINEAGE_VERSION,
  type EvaluationsLineageAdminDiagnostics,
  type EvaluationsLineageAudience,
  type EvaluationsLineageBuildInput,
  type EvaluationsLineageExclusion,
  type EvaluationsLineageFreshness,
  type EvaluationsLineageFreshnessState,
  type EvaluationsLineageRecalculationTrigger,
  type EvaluationsLineageSourceError,
  type EvaluationsLineageSummary,
  type EvaluationsMetricLineage,
  type EvaluationsSectionLineage,
} from './evaluations-lineage.contract';
import { EVALUATIONS_COST_MODEL_VERSION } from './evaluations-cost-model.contract';
import { EVALUATIONS_UTILIZATION_MODEL_VERSION } from './evaluations-utilization-model.contract';
import { EVALUATIONS_STRENGTH_DETECTION_VERSION } from './evaluations-strength-detection.contract';
import { EVALUATIONS_WEAKNESS_DETECTION_VERSION } from './evaluations-weakness-detection.contract';
import { EVALUATIONS_DRIVER_ANALYSIS_VERSION } from './evaluations-driver-analysis.contract';
import { EVALUATIONS_DATA_QUALITY_VERSION } from './evaluations-data-quality.contract';

const FRESHNESS_POLICY_REF = 'docs/architecture/analytics/evaluations-lineage-freshness.md';

const SOURCE_LABELS: Record<EvaluationsDataSourceKey, string> = {
  INVOICES: 'Invoice ledger (OrgInvoice)',
  BOOKINGS: 'Bookings',
  FLEET: 'Fleet master data',
  INSIGHTS: 'Business insights engine',
  COSTS: 'Cost model',
  UTILIZATION: 'Utilization intervals',
  TELEMETRY: 'Vehicle telemetry',
  SERVICE_CASES: 'Service cases',
  DAMAGES: 'Damage records',
};

const LOADER_BY_SOURCE: Record<EvaluationsDataSourceKey, string> = {
  INVOICES: 'financial',
  BOOKINGS: 'bookings',
  FLEET: 'fleet',
  INSIGHTS: 'insights',
  COSTS: 'costModel',
  UTILIZATION: 'utilizationModel',
  TELEMETRY: 'utilizationModel',
  SERVICE_CASES: 'costModel',
  DAMAGES: 'costModel',
};

const JOB_BY_SOURCE: Record<EvaluationsDataSourceKey, string | null> = {
  INVOICES: null,
  BOOKINGS: null,
  FLEET: null,
  INSIGHTS: 'business-insights-scheduler',
  COSTS: null,
  UTILIZATION: null,
  TELEMETRY: 'dimo-telemetry-sync',
  SERVICE_CASES: null,
  DAMAGES: null,
};

const STALE_MS_BY_SOURCE: Partial<Record<EvaluationsDataSourceKey, number>> = {
  INSIGHTS: DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS.freshness.insightsStaleAfterMs,
  TELEMETRY: DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS.freshness.staleAfterMs,
};

const SOURCES_WITHOUT_LINEAGE_V1 = [
  'EXTERNAL_ACCOUNTING_EXPORT',
  'PAYROLL_PERSONNEL',
  'DEMAND_FORECAST',
] as const;

function freshnessStateFromDq(
  dqState: string | undefined,
  insightsStale: boolean,
  loaderOk: boolean,
  hasError: boolean,
): EvaluationsLineageFreshnessState {
  if (!loaderOk || hasError) return 'FAILED';
  if (dqState === 'STALE' || insightsStale) return 'STALE';
  if (dqState === 'LIMITED') return 'DELAYED';
  if (dqState === 'GOOD' || dqState === 'NOT_APPLICABLE') return 'FRESH';
  if (dqState === 'MISSING' || dqState === 'NOT_CONNECTED') return 'UNKNOWN';
  if (dqState === 'INVALID') return 'FAILED';
  return 'UNKNOWN';
}

function buildFreshness(
  sourceKey: EvaluationsDataSourceKey,
  dqFreshnessState: string | undefined,
  insightsStale: boolean,
  loaderOk: boolean,
  hasError: boolean,
): EvaluationsLineageFreshness {
  const staleMs = STALE_MS_BY_SOURCE[sourceKey] ?? null;
  const state = freshnessStateFromDq(dqFreshnessState, insightsStale, loaderOk, hasError);
  return {
    state,
    staleThresholdMs: staleMs,
    staleThresholdLabel:
      staleMs != null ? `Stale when older than ${Math.round(staleMs / 3_600_000)}h` : null,
  };
}

function adminDiag(
  input: EvaluationsLineageBuildInput,
  sourceKey: EvaluationsDataSourceKey | null,
  loaderKey: string | null,
  jobName: string | null,
  notes: string[] = [],
): EvaluationsLineageAdminDiagnostics | undefined {
  if (input.audience !== 'ADMIN') return undefined;
  return {
    loaderKey,
    backgroundJobName: jobName,
    recalculationTrigger: input.recalculationTrigger ?? 'ON_DEMAND',
    servedFromCache: input.servedFromCache ?? false,
    cacheGeneratedAt: input.cacheGeneratedAt ?? null,
    sourceKey,
    notes,
  };
}

function redactMetricLineage(
  lineage: EvaluationsMetricLineage,
  audience: EvaluationsLineageAudience,
): EvaluationsMetricLineage {
  if (audience === 'ADMIN') return lineage;
  const { adminDiagnostics: _admin, ...rest } = lineage;
  return rest;
}

function oldestNewestFromPeriod(period: EvaluationsLineageBuildInput['period']): {
  oldest: string;
  newest: string;
} {
  return { oldest: period.from, newest: period.to };
}

function bookingIntervalBounds(
  input: EvaluationsLineageBuildInput,
): { oldest: string | null; newest: string | null } {
  const rows = input.utilizationSnapshot?.vehicles ?? [];
  if (rows.length === 0) return { oldest: input.period.from, newest: input.period.to };
  return { oldest: input.period.from, newest: input.generatedAt };
}

function metricFromSource(
  input: EvaluationsLineageBuildInput,
  metricKey: string,
  metricLabel: string,
  sourceKey: EvaluationsDataSourceKey,
  calculationVersion: string,
  exclusions: EvaluationsLineageExclusion[],
  temporal: { oldest: string | null; newest: string | null },
  importAt: string | null,
  jobAt: string | null,
  affectedMetricKeys: string[],
): EvaluationsMetricLineage {
  const source = input.dataQuality.sources.find((s) => s.sourceKey === sourceKey);
  const loaderKey = LOADER_BY_SOURCE[sourceKey];
  const loaderOk = loaderKey
    ? (input.loaderHealth[loaderKey as keyof typeof input.loaderHealth]?.ok ?? false)
    : false;
  const freshnessDim = source?.dimensions.find((d) => d.dimension === 'FRESHNESS');
  const hasError =
    (source?.knownErrors.some((e) => e.severity === 'CRITICAL') ?? false) || !loaderOk;
  const sourceErrors: EvaluationsLineageSourceError[] = (source?.knownErrors ?? []).map((e) => ({
    code: e.code,
    message: e.message,
    affectsMetrics: affectedMetricKeys,
  }));

  return redactMetricLineage(
    {
      metricKey,
      metricLabel,
      dataSources: [SOURCE_LABELS[sourceKey]],
      oldestIncludedRecordAt: temporal.oldest,
      newestIncludedRecordAt: temporal.newest,
      lastSuccessfulImportAt: importAt,
      lastSuccessfulBackgroundJobAt: jobAt,
      calculatedAt: input.generatedAt,
      calculationVersion,
      excludedRecordCount: exclusions.reduce((sum, e) => sum + e.excludedCount, 0),
      exclusionReasons: exclusions,
      dataCoverage: {
        percent: source?.coveragePercent ?? null,
        includedCount: source?.presentRecordCount ?? null,
        eligibleCount: source?.expectedRecordCount ?? null,
      },
      freshness: buildFreshness(
        sourceKey,
        freshnessDim?.state,
        input.insights?.stale ?? false,
        loaderOk,
        hasError,
      ),
      sourceErrors,
      adminDiagnostics: adminDiag(
        input,
        sourceKey,
        loaderKey,
        JOB_BY_SOURCE[sourceKey],
        source?.recommendedRemediation ?? [],
      ),
    },
    input.audience,
  );
}

function buildFinancialMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  const { oldest, newest } = oldestNewestFromPeriod(input.period);
  const base = (key: string, label: string): EvaluationsMetricLineage =>
    metricFromSource(
      input,
      key,
      label,
      'INVOICES',
      'financial-summary-v1',
      [],
      { oldest, newest },
      input.generatedAt,
      null,
      [key],
    );
  return [
    base('financial.revenueMtdMinor', 'Revenue MTD'),
    base('financial.expensesMtdMinor', 'Expenses MTD'),
    base('receivables.openAmountMinor', 'Open receivables'),
    base('receivables.overdueAmountMinor', 'Overdue receivables'),
  ];
}

function buildBookingMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  const bounds = bookingIntervalBounds(input);
  const exclusions: EvaluationsLineageExclusion[] = [];
  if (input.overlappingBookingCount > 0) {
    exclusions.push({
      reasonCode: 'OVERLAPPING_BOOKINGS',
      reason: 'Overlapping blocking bookings excluded from utilization trust.',
      excludedCount: input.overlappingBookingCount,
    });
  }
  const snapshot = input.costModelSnapshot;
  if (snapshot && snapshot.completedBookingsInPeriod > snapshot.bookingsWithKmCount) {
    exclusions.push({
      reasonCode: 'MISSING_KM',
      reason: 'Completed bookings without kmDriven excluded from km-based metrics.',
      excludedCount: snapshot.completedBookingsInPeriod - snapshot.bookingsWithKmCount,
    });
  }
  return [
    metricFromSource(
      input,
      'bookings.completed',
      'Completed bookings',
      'BOOKINGS',
      'booking-summary-v1',
      exclusions,
      bounds,
      input.generatedAt,
      null,
      ['bookings.completed', 'bookings.revenueMtdMinor'],
    ),
  ];
}

function buildFleetMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  const { oldest, newest } = oldestNewestFromPeriod(input.period);
  return [
    metricFromSource(
      input,
      'fleetUtilization.utilizationPercent',
      'Fleet utilization',
      'FLEET',
      'fleet-utilization-v1',
      [],
      { oldest, newest },
      input.generatedAt,
      null,
      ['fleetUtilization.utilizationPercent'],
    ),
  ];
}

function buildInsightsMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  const exclusions: EvaluationsLineageExclusion[] = [];
  if (!input.insights?.hasRun) {
    exclusions.push({
      reasonCode: 'INSIGHTS_NEVER_RUN',
      reason: 'Insights engine has not completed an initial run.',
      excludedCount: 0,
    });
  }
  return [
    metricFromSource(
      input,
      'activeRisks.criticalInsights',
      'Critical insights',
      'INSIGHTS',
      'insights-analytics-v1',
      exclusions,
      {
        oldest: input.period.from,
        newest: input.insights?.lastRunAt ?? input.period.to,
      },
      input.insights?.lastRunAt ?? null,
      input.insights?.lastRunAt ?? null,
      ['activeRisks.criticalInsights', 'activeRisks.businessRiskGroups'],
    ),
  ];
}

function buildCostModelMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  if (!input.costModelSummary) return [];
  const { oldest, newest } = oldestNewestFromPeriod(input.period);
  const snapshot = input.costModelSnapshot;
  const exclusions: EvaluationsLineageExclusion[] = [];
  if (snapshot && snapshot.serviceCasesTotalInPeriod > snapshot.serviceCasesWithActualCostCount) {
    exclusions.push({
      reasonCode: 'SERVICE_CASE_NO_COST',
      reason: 'Service cases without actualCostCents excluded from maintenance cost rollup.',
      excludedCount: snapshot.serviceCasesTotalInPeriod - snapshot.serviceCasesWithActualCostCount,
    });
  }
  if (snapshot && snapshot.damagesTotalInPeriod > snapshot.damagesWithRepairCostCount) {
    exclusions.push({
      reasonCode: 'DAMAGE_NO_REPAIR_COST',
      reason: 'Damage records without repairCostCents excluded from repair cost rollup.',
      excludedCount: snapshot.damagesTotalInPeriod - snapshot.damagesWithRepairCostCount,
    });
  }
  for (const gap of input.costModelSummary.dataGaps) {
    exclusions.push({
      reasonCode: `GAP_${gap.category}`,
      reason: gap.reason,
      excludedCount: 0,
    });
  }

  return input.costModelSummary.metrics.map((metric) =>
    metricFromSource(
      input,
      `costModel.${metric.key}`,
      metric.label,
      'COSTS',
      EVALUATIONS_COST_MODEL_VERSION,
      exclusions,
      { oldest, newest },
      input.generatedAt,
      null,
      [`costModel.${metric.key}`],
    ),
  );
}

function buildUtilizationMetrics(input: EvaluationsLineageBuildInput): EvaluationsMetricLineage[] {
  if (!input.utilizationModelSummary) return [];
  const bounds = bookingIntervalBounds(input);
  const exclusions: EvaluationsLineageExclusion[] = [];
  if (input.overlappingBookingCount > 0) {
    exclusions.push({
      reasonCode: 'OVERLAPPING_BOOKINGS',
      reason: 'Overlapping booking intervals excluded from time-weighted utilization.',
      excludedCount: input.overlappingBookingCount,
    });
  }
  const offline = input.utilizationModelSummary.totals.telemetryOfflineCount;
  if (offline > 0) {
    exclusions.push({
      reasonCode: 'TELEMETRY_OFFLINE',
      reason: 'Vehicles with stale telemetry excluded from freshness-sensitive metrics.',
      excludedCount: offline,
    });
  }

  return input.utilizationModelSummary.metrics.map((metric) =>
    metricFromSource(
      input,
      `utilizationModel.${metric.key}`,
      metric.label,
      'UTILIZATION',
      EVALUATIONS_UTILIZATION_MODEL_VERSION,
      exclusions,
      bounds,
      input.generatedAt,
      null,
      [`utilizationModel.${metric.key}`],
    ),
  );
}

function buildDerivedAnalysisMetrics(
  input: EvaluationsLineageBuildInput,
): EvaluationsMetricLineage[] {
  const { oldest, newest } = oldestNewestFromPeriod(input.period);
  const sharedExclusions: EvaluationsLineageExclusion[] = [];
  if (input.dataQuality.partialSections.length > 0) {
    sharedExclusions.push({
      reasonCode: 'PARTIAL_SECTIONS',
      reason: `Partial sections: ${input.dataQuality.partialSections.join(', ')}`,
      excludedCount: input.dataQuality.partialSections.length,
    });
  }

  return [
    metricFromSource(
      input,
      'strengths.detection',
      'Organizational strengths',
      'INSIGHTS',
      EVALUATIONS_STRENGTH_DETECTION_VERSION,
      sharedExclusions,
      { oldest, newest },
      input.generatedAt,
      input.insights?.lastRunAt ?? null,
      ['strengths.detection'],
    ),
    metricFromSource(
      input,
      'weaknesses.detection',
      'Organizational weaknesses',
      'INSIGHTS',
      EVALUATIONS_WEAKNESS_DETECTION_VERSION,
      sharedExclusions,
      { oldest, newest },
      input.generatedAt,
      input.insights?.lastRunAt ?? null,
      ['weaknesses.detection'],
    ),
    metricFromSource(
      input,
      'driverAnalysis.summary',
      'Driver analysis',
      'INSIGHTS',
      EVALUATIONS_DRIVER_ANALYSIS_VERSION,
      sharedExclusions,
      { oldest, newest },
      input.generatedAt,
      input.insights?.lastRunAt ?? null,
      ['driverAnalysis.summary'],
    ),
    metricFromSource(
      input,
      'dataQuality.domain',
      'Data quality assessment',
      'INVOICES',
      EVALUATIONS_DATA_QUALITY_VERSION,
      [],
      { oldest, newest },
      input.generatedAt,
      null,
      ['dataQuality.domain'],
    ),
  ];
}

function aggregateSectionLineage(
  sectionKey: string,
  metrics: EvaluationsMetricLineage[],
  calculatedAt: string,
): EvaluationsSectionLineage | null {
  if (metrics.length === 0) return null;
  const worstFreshness = metrics.reduce<EvaluationsLineageFreshnessState>((worst, m) => {
    const rank: Record<EvaluationsLineageFreshnessState, number> = {
      FAILED: 0,
      STALE: 1,
      DELAYED: 2,
      UNKNOWN: 3,
      FRESH: 4,
    };
    return rank[m.freshness.state] < rank[worst] ? m.freshness.state : worst;
  }, 'FRESH');
  return {
    sectionKey,
    calculatedAt,
    calculationVersion: EVALUATIONS_LINEAGE_VERSION,
    metrics,
    freshness: {
      state: worstFreshness,
      staleThresholdMs: null,
      staleThresholdLabel: 'Worst metric freshness in section',
    },
  };
}

const SECTION_METRIC_KEYS: Record<string, (m: EvaluationsMetricLineage) => boolean> = {
  financial: (m) => m.metricKey.startsWith('financial.'),
  receivables: (m) => m.metricKey.startsWith('receivables.'),
  bookings: (m) => m.metricKey.startsWith('bookings.'),
  fleetUtilization: (m) => m.metricKey.startsWith('fleetUtilization.'),
  costModel: (m) => m.metricKey.startsWith('costModel.'),
  utilizationModel: (m) => m.metricKey.startsWith('utilizationModel.'),
  activeRisks: (m) => m.metricKey.startsWith('activeRisks.'),
  strengths: (m) => m.metricKey === 'strengths.detection',
  weaknesses: (m) => m.metricKey === 'weaknesses.detection',
  driverAnalysis: (m) => m.metricKey === 'driverAnalysis.summary',
  dataQuality: (m) => m.metricKey === 'dataQuality.domain',
};

export function buildEvaluationsLineageSummary(
  input: EvaluationsLineageBuildInput,
): EvaluationsLineageSummary {
  const allMetrics = [
    ...buildFinancialMetrics(input),
    ...buildBookingMetrics(input),
    ...buildFleetMetrics(input),
    ...buildInsightsMetrics(input),
    ...buildCostModelMetrics(input),
    ...buildUtilizationMetrics(input),
    ...buildDerivedAnalysisMetrics(input),
  ];

  const sourceErrors: EvaluationsLineageSourceError[] = [];
  for (const source of input.dataQuality.sources) {
    for (const err of source.knownErrors) {
      if (err.severity === 'CRITICAL' || err.severity === 'WARNING') {
        sourceErrors.push({
          code: err.code,
          message: err.message,
          affectsMetrics: source.affectedMetrics,
        });
      }
    }
  }

  const sections: EvaluationsSectionLineage[] = [];
  for (const [sectionKey, predicate] of Object.entries(SECTION_METRIC_KEYS)) {
    const sectionMetrics = allMetrics.filter(predicate);
    const section = aggregateSectionLineage(sectionKey, sectionMetrics, input.generatedAt);
    if (section) sections.push(section);
  }

  return {
    calculationVersion: EVALUATIONS_LINEAGE_VERSION,
    calculatedAt: input.generatedAt,
    period: input.period,
    audience: input.audience,
    metrics: allMetrics,
    sections,
    sourceErrors,
    sourcesWithoutLineage: [...SOURCES_WITHOUT_LINEAGE_V1],
    freshnessPolicyReference: FRESHNESS_POLICY_REF,
  };
}

export function lineageForSection(
  summary: EvaluationsLineageSummary,
  sectionKey: string,
): EvaluationsSectionLineage | undefined {
  return summary.sections.find((s) => s.sectionKey === sectionKey);
}

export function lineageForMetric(
  summary: EvaluationsLineageSummary,
  metricKey: string,
): EvaluationsMetricLineage | undefined {
  return summary.metrics.find((m) => m.metricKey === metricKey);
}

export function attachLineageToCostModel<T extends { metrics: Array<{ key: string }> }>(
  model: T,
  lineage: EvaluationsLineageSummary,
): T & {
  metrics: Array<T['metrics'][number] & { lineage?: EvaluationsMetricLineage }>;
} {
  return {
    ...model,
    metrics: model.metrics.map((metric) => ({
      ...metric,
      lineage: lineageForMetric(lineage, `costModel.${metric.key}`),
    })),
  };
}

export function attachLineageToUtilizationModel<T extends { metrics: Array<{ key: string }> }>(
  model: T,
  lineage: EvaluationsLineageSummary,
): T & {
  metrics: Array<T['metrics'][number] & { lineage?: EvaluationsMetricLineage }>;
} {
  return {
    ...model,
    metrics: model.metrics.map((metric) => ({
      ...metric,
      lineage: lineageForMetric(lineage, `utilizationModel.${metric.key}`),
    })),
  };
}

export function lineageSectionStatus(
  summary: EvaluationsLineageSummary,
  sectionStatuses: Array<{ key: string; status: EvaluationsMetricStatus }>,
): EvaluationsMetricStatus {
  const hasFailed = summary.sourceErrors.some((e) => e.code.includes('LOADER_FAILED'));
  if (hasFailed) return 'ERROR';
  const hasStale = summary.metrics.some((m) => m.freshness.state === 'STALE');
  const hasPartial = sectionStatuses.some((s) => s.status === 'PARTIAL');
  if (hasStale || hasPartial) return 'PARTIAL';
  return 'OK';
}
