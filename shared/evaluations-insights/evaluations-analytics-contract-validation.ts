/**
 * Runtime validation for Auswertungen analytics API contracts (Prompt 20/54).
 * Pure TypeScript guards — same pattern as filter validation (no zod).
 */
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';
import type { EvaluationsInsightDetail, EvaluationsInsightListResponse } from './evaluations-insight-detail.contract';
import type { InsightAnalyticsSummary } from './insights-analytics.contract';
import type { EvaluationsMetricStatus } from './evaluations-analytics-primitives.contract';

const METRIC_STATUSES = new Set<EvaluationsMetricStatus>(['OK', 'PARTIAL', 'UNAVAILABLE', 'ERROR']);

export interface ContractValidationIssue {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function push(issues: ContractValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function validateInsightAnalyticsSummary(
  value: unknown,
): { ok: true; data: InsightAnalyticsSummary } | { ok: false; issues: ContractValidationIssue[] } {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Expected object' }] };
  }
  if (!('counts' in value) || !isRecord(value.counts)) {
    push(issues, 'counts', 'Required object');
  } else {
    for (const key of [
      'totalVisible',
      'businessRisks',
      'revenueLeakage',
      'criticalInsights',
      'criticalBookings',
    ] as const) {
      if (!isNumber(value.counts[key])) push(issues, `counts.${key}`, 'Required number');
    }
    if (!isRecord(value.counts.bySeverity)) {
      push(issues, 'counts.bySeverity', 'Required object');
    }
    if (!isRecord(value.counts.entities)) {
      push(issues, 'counts.entities', 'Required object');
    }
  }
  if (!isNumber(value.estimatedFinancialExposureMinor)) {
    push(issues, 'estimatedFinancialExposureMinor', 'Required number');
  }
  if (!isString(value.estimatedFinancialExposureCurrency)) {
    push(issues, 'estimatedFinancialExposureCurrency', 'Required string');
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: value as unknown as InsightAnalyticsSummary };
}

export function validateEvaluationsInsightDetail(
  value: unknown,
): { ok: true; data: EvaluationsInsightDetail } | { ok: false; issues: ContractValidationIssue[] } {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Expected object' }] };
  }
  for (const key of ['id', 'type', 'severity', 'title', 'message', 'entityScope', 'createdAt'] as const) {
    if (!isString(value[key])) push(issues, key, 'Required string');
  }
  if (!isNumber(value.priority)) push(issues, 'priority', 'Required number');
  if (typeof value.isGrouped !== 'boolean') push(issues, 'isGrouped', 'Required boolean');
  if (!isNumber(value.groupCount)) push(issues, 'groupCount', 'Required number');
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: value as unknown as EvaluationsInsightDetail };
}

export function validateEvaluationsInsightListResponse(
  value: unknown,
): { ok: true; data: EvaluationsInsightListResponse } | { ok: false; issues: ContractValidationIssue[] } {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Expected object' }] };
  }
  if (!Array.isArray(value.data)) {
    push(issues, 'data', 'Required array');
  } else {
    value.data.forEach((item, index) => {
      const result = validateEvaluationsInsightDetail(item);
      if (!result.ok) {
        for (const issue of result.issues) {
          push(issues, `data[${index}].${issue.path}`, issue.message);
        }
      }
    });
  }
  if (!isRecord(value.meta)) {
    push(issues, 'meta', 'Required object');
  } else {
    for (const key of ['total', 'page', 'limit', 'totalPages'] as const) {
      if (!isNumber(value.meta[key])) push(issues, `meta.${key}`, 'Required number');
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: value as unknown as EvaluationsInsightListResponse };
}

const SUMMARY_SECTION_KEYS = [
  'executive',
  'financial',
  'receivables',
  'bookings',
  'fleetUtilization',
  'vehicleAvailability',
  'downtime',
  'costs',
  'activeRisks',
  'affectedEntities',
  'strengths',
  'weaknesses',
  'dataQuality',
  'insights',
] as const;

export function validateEvaluationsAnalyticsSummaryResponse(
  value: unknown,
): { ok: true; data: EvaluationsAnalyticsSummaryResponse } | { ok: false; issues: ContractValidationIssue[] } {
  const issues: ContractValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Expected object' }] };
  }
  for (const key of ['organizationId', 'generatedAt', 'overallStatus'] as const) {
    if (!isString(value[key])) push(issues, key, 'Required string');
  }
  if (value.overallStatus && !METRIC_STATUSES.has(value.overallStatus as EvaluationsMetricStatus)) {
    push(issues, 'overallStatus', 'Invalid status');
  }
  if (!isRecord(value.period) || !isString(value.period.from) || !isString(value.period.to)) {
    push(issues, 'period', 'Invalid period window');
  }
  if (
    !isRecord(value.comparisonPeriod) ||
    !isString(value.comparisonPeriod.from) ||
    !isString(value.comparisonPeriod.to)
  ) {
    push(issues, 'comparisonPeriod', 'Invalid comparison period window');
  }
  for (const sectionKey of SUMMARY_SECTION_KEYS) {
    const section = value[sectionKey];
    if (!isRecord(section)) {
      push(issues, sectionKey, 'Required section envelope');
      continue;
    }
    if (!isString(section.status) || !METRIC_STATUSES.has(section.status as EvaluationsMetricStatus)) {
      push(issues, `${sectionKey}.status`, 'Invalid section status');
    }
    if (!isString(section.generatedAt)) {
      push(issues, `${sectionKey}.generatedAt`, 'Required generatedAt');
    }
  }
  if (!isRecord(value.metadata) || !isNumber(value.metadata.generationDurationMs)) {
    push(issues, 'metadata.generationDurationMs', 'Required number');
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: value as unknown as EvaluationsAnalyticsSummaryResponse };
}

/** Compile-time + runtime anchor: required top-level keys for summary contract. */
export const EVALUATIONS_ANALYTICS_SUMMARY_REQUIRED_KEYS = [
  'organizationId',
  'generatedAt',
  'period',
  'comparisonPeriod',
  'appliedFilters',
  'overallStatus',
  ...SUMMARY_SECTION_KEYS,
  'metadata',
] as const satisfies readonly (keyof EvaluationsAnalyticsSummaryResponse)[];

export const INSIGHT_ANALYTICS_SUMMARY_REQUIRED_KEYS = [
  'generatedAt',
  'hasRun',
  'lastRunAt',
  'stale',
  'error',
  'counts',
  'estimatedFinancialExposureMinor',
  'estimatedFinancialExposureCurrency',
] as const satisfies readonly (keyof InsightAnalyticsSummary)[];
