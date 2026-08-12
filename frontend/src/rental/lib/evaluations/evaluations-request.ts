/**
 * E6A canonical request model + result state.
 *
 * Request construction only — NO metric is ever computed from dates here. The
 * selected analytics period maps to the canonical E1 `periodType`; station scope
 * maps to canonical `stationIds` (narrow-only, server-authoritative). Finance (E3)
 * is fixed MTD and does NOT accept a period — see `EVALUATIONS_FINANCE_PERIOD_AUTHORITY`.
 */
import type { EvaluationsPeriodType } from '@synq/evaluations-periods/evaluations-period.contract';

export type { EvaluationsPeriodType };

/** Canonical analytics request scope for E4/E5 (period is user-selectable). */
export interface EvaluationsAnalyticsRequest {
  /** Selected analytics period; omitted → server default (MTD). Governs E4/E5 only. */
  readonly periodType?: EvaluationsPeriodType;
  /** Narrow-only authorized station ids; omitted/null → all authorized stations. */
  readonly stationIds?: readonly string[] | null;
}

/**
 * Period authority markers. The Finance section is ALWAYS MTD (E3 fixed; the E3
 * endpoint accepts no periodType), regardless of the selected analytics period.
 * E6B renders this distinction ("Monat bis heute" for Finance); E6A never applies
 * the selected analytics period to Finance and never recomputes E3 client-side.
 */
export const EVALUATIONS_FINANCE_PERIOD_AUTHORITY = 'MTD' as const;
export type EvaluationsFinancePeriodAuthority = typeof EVALUATIONS_FINANCE_PERIOD_AUTHORITY;

/** Discriminated result state — HTTP/feature states are distinct from metric states. */
export type EvaluationsResultState =
  | 'AVAILABLE'
  | 'FEATURE_DISABLED'
  | 'UNAUTHORIZED'
  | 'ERROR';

export type EvaluationsCanonicalResult<T> =
  | { readonly state: 'AVAILABLE'; readonly data: T }
  | { readonly state: 'FEATURE_DISABLED' }
  | { readonly state: 'UNAUTHORIZED' }
  | { readonly state: 'ERROR'; readonly message: string };

/** Async lifecycle wrapper for hooks (LOADING is distinct from every result state). */
export interface EvaluationsAsyncResult<T> {
  readonly loading: boolean;
  readonly result: EvaluationsCanonicalResult<T> | null;
}

export function isAvailable<T>(
  r: EvaluationsCanonicalResult<T> | null,
): r is { state: 'AVAILABLE'; data: T } {
  return r?.state === 'AVAILABLE';
}
