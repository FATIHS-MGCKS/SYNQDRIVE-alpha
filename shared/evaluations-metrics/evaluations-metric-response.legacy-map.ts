/**
 * Legacy UI/runtime states → canonical EvaluationsMetricStatus.
 * Frontend and exports must use the same mapping.
 */

import type { EvaluationsMetricStatus } from './evaluations-metric-response.contract';

/** Dashboard Business Pulse / Financial Insights legacy display tokens */
export const LEGACY_DISPLAY_TOKEN_TO_STATUS: Readonly<Record<string, EvaluationsMetricStatus>> = {
  '—': 'UNAVAILABLE',
  '-': 'UNAVAILABLE',
  'N/A': 'NOT_APPLICABLE',
  'n/a': 'NOT_APPLICABLE',
  '…': 'UNAVAILABLE',
  '...': 'UNAVAILABLE',
};

/** Insights cockpit / dashboard trust layer legacy flags */
export const LEGACY_TRUST_FLAG_TO_STATUS: Readonly<Record<string, EvaluationsMetricStatus>> = {
  stale: 'STALE',
  partial: 'PARTIAL',
  error: 'ERROR',
  unavailable: 'UNAVAILABLE',
  not_applicable: 'NOT_APPLICABLE',
  notApplicable: 'NOT_APPLICABLE',
};

/** Business Pulse slice states from dashboardRuntimeTypes */
export const LEGACY_BUSINESS_DOCUMENT_STATE_TO_STATUS: Readonly<
  Record<string, EvaluationsMetricStatus>
> = {
  paid: 'AVAILABLE',
  open: 'AVAILABLE',
  overdue: 'AVAILABLE',
  draft: 'AVAILABLE',
  failed: 'ERROR',
  disputed: 'ERROR',
  unknown: 'UNAVAILABLE',
};

export function resolveLegacyMetricStatus(input: {
  displayToken?: string | null;
  trustFlag?: string | null;
  documentState?: string | null;
  hasError?: boolean;
  isStale?: boolean;
  isPartial?: boolean;
}): EvaluationsMetricStatus {
  if (input.hasError) return 'ERROR';
  if (input.isStale) return 'STALE';
  if (input.isPartial) return 'PARTIAL';

  const token = input.displayToken?.trim();
  if (token && LEGACY_DISPLAY_TOKEN_TO_STATUS[token]) {
    return LEGACY_DISPLAY_TOKEN_TO_STATUS[token];
  }

  if (input.trustFlag && LEGACY_TRUST_FLAG_TO_STATUS[input.trustFlag]) {
    return LEGACY_TRUST_FLAG_TO_STATUS[input.trustFlag];
  }

  if (input.documentState && LEGACY_BUSINESS_DOCUMENT_STATE_TO_STATUS[input.documentState]) {
    return LEGACY_BUSINESS_DOCUMENT_STATE_TO_STATUS[input.documentState];
  }

  return 'AVAILABLE';
}
