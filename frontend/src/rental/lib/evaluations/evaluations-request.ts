/**
 * E6A canonical request model + result/lifecycle state.
 *
 * Request construction only — NO metric is ever computed from dates here. The
 * selected analytics period maps to the canonical E1 `periodType`; station scope
 * maps to canonical `stationIds` (narrow-only, server-authoritative). Finance (E3)
 * is fixed MTD and does NOT accept a period — see `EVALUATIONS_FINANCE_PERIOD_AUTHORITY`.
 *
 * E6A.1: HTTP/feature state semantics corrected. A generic HTTP 404 is NOT proof
 * of a disabled feature — the backend FeatureGuard returns a deliberately generic
 * `NotFoundException('Not found')` with no machine-readable discriminator (to avoid
 * leaking that a disabled route exists). So a bare 404 maps to the neutral
 * `NOT_FOUND` state, never a fabricated `FEATURE_DISABLED`.
 */
import type { EvaluationsPeriodType } from '@synq/evaluations-periods/evaluations-period.contract';

export type { EvaluationsPeriodType };

/** Canonical analytics request scope for E4/E5 (period is user-selectable). */
export interface EvaluationsAnalyticsRequest {
  readonly periodType?: EvaluationsPeriodType;
  readonly stationIds?: readonly string[] | null;
}

/**
 * Finance is ALWAYS MTD (E3 fixed; the E3 endpoint accepts no periodType),
 * regardless of the selected analytics period.
 */
export const EVALUATIONS_FINANCE_PERIOD_AUTHORITY = 'MTD' as const;
export type EvaluationsFinancePeriodAuthority = typeof EVALUATIONS_FINANCE_PERIOD_AUTHORITY;

/**
 * Discriminated result state. HTTP/feature states are distinct from metric states.
 *  - AVAILABLE: 2xx + payload (metric-level status lives inside the payload).
 *  - UNAUTHORIZED: 403.
 *  - NOT_FOUND: 404 — canonical analytics not reachable (feature disabled OR a
 *    genuine not-found; the server intentionally does not disambiguate). Neutral,
 *    honest, never legacy fallback, never empty/zero data.
 *  - FEATURE_DISABLED: only when a RELIABLE non-leaking discriminator proves it.
 *    No such discriminator exists on current main, so this is never emitted from a
 *    bare 404 — reserved for a future explicit contract.
 *  - ERROR: network / 5xx / other failure.
 */
export type EvaluationsResultState =
  | 'AVAILABLE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'FEATURE_DISABLED'
  | 'ERROR';

export type EvaluationsCanonicalResult<T> =
  | { readonly state: 'AVAILABLE'; readonly data: T }
  | { readonly state: 'UNAUTHORIZED' }
  | { readonly state: 'NOT_FOUND' }
  | { readonly state: 'FEATURE_DISABLED' }
  | { readonly state: 'ERROR'; readonly message: string };

/**
 * Hook lifecycle phase. IDLE is a first-class, deterministic state for "no
 * organization / not ready" — distinct from LOADING (so a null-org page never sits
 * in a permanent misleading spinner) and from SETTLED (so stale data is cleared).
 */
export type EvaluationsAsyncResult<T> =
  | { readonly phase: 'IDLE' }
  | { readonly phase: 'LOADING' }
  | { readonly phase: 'SETTLED'; readonly result: EvaluationsCanonicalResult<T> };

export const EVALUATIONS_ASYNC_IDLE = { phase: 'IDLE' } as const;
export const EVALUATIONS_ASYNC_LOADING = { phase: 'LOADING' } as const;

export function isAvailable<T>(
  r: EvaluationsCanonicalResult<T> | null | undefined,
): r is { state: 'AVAILABLE'; data: T } {
  return r?.state === 'AVAILABLE';
}

/** Convenience: the settled result, or null while IDLE/LOADING. */
export function settledResult<T>(
  s: EvaluationsAsyncResult<T>,
): EvaluationsCanonicalResult<T> | null {
  return s.phase === 'SETTLED' ? s.result : null;
}

/**
 * Pure lifecycle helper: the initial fetch state for a given organization.
 * No organization → IDLE (do not fetch, do not spin forever, do not retain stale
 * prior-org data). Organization present → LOADING (a fresh fetch is starting, which
 * immediately replaces any previous organization's SETTLED data).
 */
export function orgFetchState<T>(
  organizationId: string | null | undefined,
): EvaluationsAsyncResult<T> {
  return organizationId ? EVALUATIONS_ASYNC_LOADING : EVALUATIONS_ASYNC_IDLE;
}

/**
 * Pure race-safety guard: a response may be applied only when the request scope key
 * it was issued for still matches the currently active scope key. An older
 * organization/period/station response can never overwrite a newer selection.
 */
export function shouldApplyResponse(
  activeKey: string | null,
  responseKey: string | null,
): boolean {
  return activeKey !== null && responseKey !== null && activeKey === responseKey;
}
