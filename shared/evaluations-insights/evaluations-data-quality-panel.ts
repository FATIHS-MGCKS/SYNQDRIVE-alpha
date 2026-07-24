/**
 * Pure builders for Auswertungen data quality admin panel (Prompt 29/54).
 */
import type {
  EvaluationsDataQualityDomainSummary,
  EvaluationsDataSourceKey,
  EvaluationsDataSourceQualityAssessment,
} from './evaluations-data-quality.contract';
import type { EvaluationsLineageSummary, EvaluationsMetricLineage } from './evaluations-lineage.contract';
import type {
  EvaluationsDataQualityAdminSourceRow,
  EvaluationsDataQualityConnectionStatus,
  EvaluationsDataQualityIssueKind,
  EvaluationsDataQualityRemediationTarget,
  EvaluationsDataQualityUserHintModel,
} from './evaluations-data-quality-panel.contract';

const REMEDIATION_BY_SOURCE: Record<EvaluationsDataSourceKey, EvaluationsDataQualityRemediationTarget> = {
  INVOICES: 'invoices',
  BOOKINGS: 'bookings',
  FLEET: 'fleet',
  INSIGHTS: 'integrations-hub',
  COSTS: 'invoices',
  UTILIZATION: 'fleet',
  TELEMETRY: 'data-authorization',
  SERVICE_CASES: 'tasks',
  DAMAGES: 'damages',
};

export function isEvaluationsDataQualityAdmin(
  membershipRole: string | null | undefined,
  platformRole?: string | null,
): boolean {
  if (platformRole === 'MASTER_ADMIN') return true;
  return membershipRole === 'ORG_ADMIN';
}

function connectionStatus(source: EvaluationsDataSourceQualityAssessment): EvaluationsDataQualityConnectionStatus {
  if (!source.integrationConnected) return 'not_connected';
  if (source.overallState === 'INVALID' || source.overallState === 'STALE') return 'degraded';
  if (source.knownErrors.some((e) => e.severity === 'CRITICAL')) return 'degraded';
  return 'connected';
}

function issueKind(source: EvaluationsDataSourceQualityAssessment): EvaluationsDataQualityIssueKind {
  if (!source.integrationConnected || source.overallState === 'NOT_CONNECTED') {
    return 'missing_integration';
  }
  if (
    source.overallState === 'INVALID' ||
    source.knownErrors.some((e) => e.severity === 'CRITICAL' && /LOADER|FAILED|ERROR/i.test(e.code))
  ) {
    return 'technical_error';
  }
  if (source.overallState === 'MISSING' || source.overallState === 'LIMITED' || source.overallState === 'STALE') {
    return 'data_gap';
  }
  return 'ok';
}

function deriveErrorRatePercent(source: EvaluationsDataSourceQualityAssessment): number | null {
  if (!source.integrationConnected) return null;
  const critical = source.knownErrors.filter((e) => e.severity === 'CRITICAL').length;
  const warning = source.knownErrors.filter((e) => e.severity === 'WARNING').length;
  if (source.coveragePercent != null && source.coveragePercent < 100) {
    return Math.min(100, Math.round(100 - source.coveragePercent));
  }
  if (critical === 0 && warning === 0) return 0;
  return Math.min(100, critical * 35 + warning * 12);
}

function lineageMetricsForSource(
  lineage: EvaluationsLineageSummary | null | undefined,
  sourceKey: EvaluationsDataSourceKey,
): EvaluationsMetricLineage[] {
  if (!lineage) return [];
  return lineage.metrics.filter((m) => m.adminDiagnostics?.sourceKey === sourceKey);
}

function aggregateLineageForSource(
  lineage: EvaluationsLineageSummary | null | undefined,
  sourceKey: EvaluationsDataSourceKey,
): {
  lastSuccessfulImportAt: string | null;
  lastFailedJobLabel: string | null;
  excludedRecordCount: number;
  exclusionSummaries: string[];
  freshnessState: EvaluationsLineageSummary['metrics'][0]['freshness']['state'] | null;
} {
  const metrics = lineageMetricsForSource(lineage, sourceKey);
  if (metrics.length === 0) {
    return {
      lastSuccessfulImportAt: null,
      lastFailedJobLabel: null,
      excludedRecordCount: 0,
      exclusionSummaries: [],
      freshnessState: null,
    };
  }

  const importDates = metrics
    .map((m) => m.lastSuccessfulImportAt ?? m.lastSuccessfulBackgroundJobAt)
    .filter((v): v is string => Boolean(v));
  const lastSuccessfulImportAt =
    importDates.length > 0 ? importDates.sort((a, b) => (a < b ? 1 : -1))[0] : null;

  const failedMetric = metrics.find((m) => m.freshness.state === 'FAILED');
  const lastFailedJobLabel = failedMetric?.adminDiagnostics?.backgroundJobName ?? null;

  const excludedRecordCount = metrics.reduce((sum, m) => sum + m.excludedRecordCount, 0);
  const exclusionSummaries = [
    ...new Set(metrics.flatMap((m) => m.exclusionReasons.map((e) => e.reason))),
  ];

  const freshnessState = failedMetric?.freshness.state ?? metrics[0]?.freshness.state ?? null;

  return {
    lastSuccessfulImportAt,
    lastFailedJobLabel,
    excludedRecordCount,
    exclusionSummaries,
    freshnessState,
  };
}

export function buildAdminSourceRow(
  source: EvaluationsDataSourceQualityAssessment,
  lineage: EvaluationsLineageSummary | null | undefined,
): EvaluationsDataQualityAdminSourceRow {
  const lineageAgg = aggregateLineageForSource(lineage, source.sourceKey);
  const kind = issueKind(source);

  return {
    sourceKey: source.sourceKey,
    label: source.label,
    connectionStatus: connectionStatus(source),
    overallState: source.overallState,
    freshnessState: lineageAgg.freshnessState,
    coveragePercent: source.coveragePercent,
    errorRatePercent: deriveErrorRatePercent(source),
    lastSuccessfulImportAt: lineageAgg.lastSuccessfulImportAt ?? source.lastSuccessfulUpdateAt,
    lastFailedJobLabel: kind === 'technical_error' ? lineageAgg.lastFailedJobLabel : null,
    affectedMetrics: source.affectedMetrics,
    excludedRecordCount: lineageAgg.excludedRecordCount,
    exclusionSummaries: lineageAgg.exclusionSummaries,
    recommendedActions: source.recommendedRemediation,
    remediationTarget: REMEDIATION_BY_SOURCE[source.sourceKey],
    issueKind: kind,
    knownIssueSummaries: source.knownErrors.map((e) => e.message).slice(0, 5),
  };
}

export function buildAdminSourceRows(
  dataQuality: EvaluationsDataQualityDomainSummary | null | undefined,
  lineage: EvaluationsLineageSummary | null | undefined,
): EvaluationsDataQualityAdminSourceRow[] {
  if (!dataQuality?.sources?.length) return [];
  return dataQuality.sources.map((source) => buildAdminSourceRow(source, lineage));
}

export function buildUserDataQualityHint(
  dataQuality: EvaluationsDataQualityDomainSummary | null | undefined,
  envelopeStatus: 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR' | null | undefined,
): EvaluationsDataQualityUserHintModel {
  if (!dataQuality || envelopeStatus === 'ERROR' || envelopeStatus === 'UNAVAILABLE') {
    return {
      visible: true,
      severity: 'critical',
      messageKey: 'unavailable',
    };
  }

  const rollup = dataQuality.rollupStatus;
  if (rollup === 'NOT_CONNECTED') {
    return { visible: true, severity: 'watch', messageKey: 'connectionIssue' };
  }
  if (dataQuality.insightsStale || rollup === 'STALE') {
    return { visible: true, severity: 'watch', messageKey: 'staleInsights' };
  }
  if (rollup === 'LIMITED' || rollup === 'MISSING' || envelopeStatus === 'PARTIAL') {
    return { visible: true, severity: 'watch', messageKey: 'partialData' };
  }
  if (rollup === 'GOOD' || rollup === 'NOT_APPLICABLE') {
    return { visible: false, severity: 'info', messageKey: 'allGood' };
  }
  if (rollup === 'INVALID') {
    return { visible: true, severity: 'critical', messageKey: 'unavailable' };
  }
  return { visible: true, severity: 'watch', messageKey: 'partialData' };
}

export function remediationTargetForSource(
  sourceKey: EvaluationsDataSourceKey,
): EvaluationsDataQualityRemediationTarget {
  return REMEDIATION_BY_SOURCE[sourceKey];
}
