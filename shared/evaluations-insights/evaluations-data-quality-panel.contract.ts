/**
 * Admin data quality panel contracts (Prompt 29/54).
 */
import type { EvaluationsDataQualityState, EvaluationsDataSourceKey } from './evaluations-data-quality.contract';
import type { EvaluationsLineageFreshnessState } from './evaluations-lineage.contract';

export type EvaluationsDataQualityIssueKind =
  | 'ok'
  | 'missing_integration'
  | 'technical_error'
  | 'data_gap';

export type EvaluationsDataQualityRemediationTarget =
  | 'integrations-hub'
  | 'data-authorization'
  | 'fleet'
  | 'invoices'
  | 'bookings'
  | 'damages'
  | 'tasks';

export type EvaluationsDataQualityConnectionStatus = 'connected' | 'not_connected' | 'degraded';

export interface EvaluationsDataQualityAdminSourceRow {
  sourceKey: EvaluationsDataSourceKey;
  label: string;
  connectionStatus: EvaluationsDataQualityConnectionStatus;
  overallState: EvaluationsDataQualityState;
  freshnessState: EvaluationsLineageFreshnessState | null;
  coveragePercent: number | null;
  /** Derived indicator 0–100 — not a raw server log metric. */
  errorRatePercent: number | null;
  lastSuccessfulImportAt: string | null;
  /** Background job name only — never stack traces or credentials. */
  lastFailedJobLabel: string | null;
  affectedMetrics: string[];
  excludedRecordCount: number;
  exclusionSummaries: string[];
  recommendedActions: string[];
  remediationTarget: EvaluationsDataQualityRemediationTarget;
  issueKind: EvaluationsDataQualityIssueKind;
  knownIssueSummaries: string[];
}

export interface EvaluationsDataQualityUserHintModel {
  visible: boolean;
  severity: 'info' | 'watch' | 'critical';
  messageKey: EvaluationsDataQualityUserHintKey;
  messageParams?: Record<string, string | number>;
}

export type EvaluationsDataQualityUserHintKey =
  | 'allGood'
  | 'partialData'
  | 'staleInsights'
  | 'connectionIssue'
  | 'unavailable';
