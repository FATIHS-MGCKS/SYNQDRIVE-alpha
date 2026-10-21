import { isV2CoordinateEligibleForEnrichment } from './physical-refuel-coordinate.policy';
import { hasRouteEvidenceChanged } from './physical-refuel-route-evidence.util';

export const COORDINATE_HOLD_MISSING_DIMO_TOKEN = 'COORDINATE_HOLD_MISSING_DIMO_TOKEN';
export const COORDINATE_ROUTE_UNAVAILABLE = 'ROUTE_UNAVAILABLE';
export const COORDINATE_PROVIDER_ERROR = 'PROVIDER_ERROR';
export const COORDINATE_ROUTE_EVIDENCE_STABILIZING = 'ROUTE_EVIDENCE_STABILIZING';
export const COORDINATE_NO_DWELL_STABLE = 'NO_DWELL_FOUND_FOR_STABLE_EVIDENCE';

const TERMINAL_COORDINATE_STATUSES = new Set([
  'MISSING_FUEL_RISE_ONSET',
  'INSUFFICIENT_EVIDENCE',
  'NO_DWELL_FOUND',
  COORDINATE_NO_DWELL_STABLE,
  'AMBIGUOUS',
]);

export const RETRYABLE_COORDINATE_STATUS_LIST = [
  COORDINATE_HOLD_MISSING_DIMO_TOKEN,
  COORDINATE_ROUTE_UNAVAILABLE,
  COORDINATE_PROVIDER_ERROR,
  COORDINATE_ROUTE_EVIDENCE_STABILIZING,
] as const;

const RETRYABLE_COORDINATE_STATUSES = new Set<string>(RETRYABLE_COORDINATE_STATUS_LIST);

/**
 * coordinateRetryCount = number of failed retryable coordinate attempts (not SELECTED, not stable terminal).
 */
export function isCoordinateStatusTerminal(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_COORDINATE_STATUSES.has(status);
}

export function isCoordinateStatusRetryable(status: string | null | undefined): boolean {
  if (!status) return false;
  if (TERMINAL_COORDINATE_STATUSES.has(status)) return false;
  if (RETRYABLE_COORDINATE_STATUSES.has(status)) return true;
  if (status === 'SELECTED') return false;
  return false;
}

export function computeNextCoordinateRetryAt(retryCount: number, asOfMs: number): Date {
  const baseMs = 60_000;
  const maxMs = 30 * 60_000;
  const delay = Math.min(maxMs, baseMs * 2 ** Math.min(Math.max(retryCount, 1), 10));
  return new Date(asOfMs + delay);
}

export function resolveStableRouteEvidenceStatus(selectorStatus: string): string {
  if (selectorStatus === 'NO_DWELL_FOUND') return COORDINATE_NO_DWELL_STABLE;
  return selectorStatus;
}

export function resolveRouteEvidenceCoordinateStatus(params: {
  selectorStatus: string;
  eventObservedAtMs: number;
  asOfMs: number;
  stabilizationHorizonMs: number;
  routeEvidenceStabilizationUntil: Date | null | undefined;
}): { status: string; stabilizationUntil: Date | null } {
  if (!['NO_DWELL_FOUND', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS'].includes(params.selectorStatus)) {
    return { status: params.selectorStatus, stabilizationUntil: null };
  }

  const horizonEnd = params.eventObservedAtMs + params.stabilizationHorizonMs;
  const existingUntil = params.routeEvidenceStabilizationUntil?.getTime() ?? horizonEnd;
  const stabilizationUntil = new Date(Math.max(horizonEnd, existingUntil));

  if (params.asOfMs < stabilizationUntil.getTime()) {
    return { status: COORDINATE_ROUTE_EVIDENCE_STABILIZING, stabilizationUntil };
  }

  return {
    status: resolveStableRouteEvidenceStatus(params.selectorStatus),
    stabilizationUntil: null,
  };
}

export function shouldAttemptCoordinateResolution(params: {
  coordinateLatitude: number | null | undefined;
  coordinateLongitude: number | null | undefined;
  coordinateSource: string | null | undefined;
  coordinateSelectionStatus: string | null | undefined;
  nextCoordinateRetryAt: Date | null | undefined;
  asOfMs: number;
  evidenceInvalidated?: boolean;
  routeEvidenceInvalidated?: boolean;
}): boolean {
  if (
    isV2CoordinateEligibleForEnrichment({
      latitude: params.coordinateLatitude,
      longitude: params.coordinateLongitude,
      source: params.coordinateSource,
    })
  ) {
    return false;
  }

  if (params.evidenceInvalidated || params.routeEvidenceInvalidated) {
    return true;
  }

  if (!params.coordinateSelectionStatus) {
    return true;
  }

  if (isCoordinateStatusTerminal(params.coordinateSelectionStatus)) {
    return false;
  }

  if (!isCoordinateStatusRetryable(params.coordinateSelectionStatus)) {
    return false;
  }

  if (!params.nextCoordinateRetryAt) {
    return false;
  }

  return params.nextCoordinateRetryAt.getTime() <= params.asOfMs;
}

export function isRouteEvidenceInvalidated(
  persistedFingerprint: string | null | undefined,
  currentFingerprint: string | null | undefined,
  coordinateSelectionStatus: string | null | undefined,
): boolean {
  if (!hasRouteEvidenceChanged(persistedFingerprint, currentFingerprint)) return false;
  if (!coordinateSelectionStatus) return false;
  if (coordinateSelectionStatus === 'SELECTED') return false;
  return true;
}
