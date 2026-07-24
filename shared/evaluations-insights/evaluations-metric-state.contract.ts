/**
 * UX metric states for Auswertungen (Prompt 28/54).
 * Maps section envelopes + fetch lifecycle to display semantics.
 */
import type { EvaluationsMetricStatus, EvaluationsSectionEnvelope } from './evaluations-analytics-primitives.contract';

/** End-user metric availability — distinct from section `EvaluationsMetricStatus`. */
export type EvaluationsMetricUxKind =
  | 'available'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'error'
  | 'not_applicable'
  | 'null_value';

export type EvaluationsMetricFetchPhase = 'idle' | 'loading' | 'refetching' | 'ready' | 'failed';

export interface EvaluationsResolvedMetricState {
  kind: EvaluationsMetricUxKind;
  fetchPhase: EvaluationsMetricFetchPhase;
  /** Whether a numeric/text value may be rendered (never substitute 0 on error). */
  canShowValue: boolean;
  /** Previous data shown during background refetch — must be visually distinct. */
  showStaleOverlay: boolean;
  displayValue: string | null;
  rawValue: number | null;
  tooltip: string;
  shortLabel: string;
  sectionStatus?: EvaluationsMetricStatus;
  error?: string | null;
}

export interface ResolveMetricFromEnvelopeOptions<T> {
  envelope?: EvaluationsSectionEnvelope<T> | null;
  extractValue: (data: T) => number | null;
  formatValue: (value: number) => string;
  fetchPhase: EvaluationsMetricFetchPhase;
  fetchError?: string | null;
  notApplicable?: boolean;
  locale?: 'de' | 'en';
  zeroMeansNull?: boolean;
}

export interface EvaluationsSummaryExportRow {
  sectionKey: string;
  metricKey: string;
  label: string;
  status: EvaluationsMetricStatus;
  uxKind: EvaluationsMetricUxKind;
  value: string;
  excluded: boolean;
  exclusionReason: string | null;
  generatedAt: string | null;
  error: string | null;
}
