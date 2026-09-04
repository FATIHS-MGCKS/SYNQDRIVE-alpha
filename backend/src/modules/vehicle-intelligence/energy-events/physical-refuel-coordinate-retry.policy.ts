import { isV2CoordinateEligibleForEnrichment } from './physical-refuel-coordinate.policy';

export const COORDINATE_HOLD_MISSING_DIMO_TOKEN = 'COORDINATE_HOLD_MISSING_DIMO_TOKEN';

const TERMINAL_COORDINATE_STATUSES = new Set([
  'MISSING_FUEL_RISE_ONSET',
  'INSUFFICIENT_EVIDENCE',
  'NO_DWELL_FOUND',
  'AMBIGUOUS',
]);

const RETRYABLE_COORDINATE_STATUSES = new Set([
  COORDINATE_HOLD_MISSING_DIMO_TOKEN,
  'ROUTE_UNAVAILABLE',
  'PROVIDER_ERROR',
]);

export function isCoordinateStatusTerminal(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_COORDINATE_STATUSES.has(status);
}

export function isCoordinateStatusRetryable(status: string | null | undefined): boolean {
  if (!status) return true;
  if (TERMINAL_COORDINATE_STATUSES.has(status)) return false;
  if (RETRYABLE_COORDINATE_STATUSES.has(status)) return true;
  if (status === 'SELECTED') return false;
  return true;
}

export function computeNextCoordinateRetryAt(retryCount: number, asOfMs: number): Date {
  const baseMs = 60_000;
  const maxMs = 30 * 60_000;
  const delay = Math.min(maxMs, baseMs * 2 ** Math.min(retryCount, 10));
  return new Date(asOfMs + delay);
}

export function shouldAttemptCoordinateResolution(params: {
  coordinateLatitude: number | null | undefined;
  coordinateLongitude: number | null | undefined;
  coordinateSource: string | null | undefined;
  coordinateSelectionStatus: string | null | undefined;
  nextCoordinateRetryAt: Date | null | undefined;
  asOfMs: number;
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
  if (isCoordinateStatusTerminal(params.coordinateSelectionStatus)) {
    return false;
  }
  if (!params.nextCoordinateRetryAt) {
    return true;
  }
  return params.nextCoordinateRetryAt.getTime() <= params.asOfMs;
}
