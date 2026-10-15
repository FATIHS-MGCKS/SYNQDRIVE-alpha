import type { TripGpsSpeedEvaluationProductV1 } from '../../lib/api';

export function formatTripGpsSpeedKmh(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value)}`;
}

export function formatTripGpsCoveragePercent(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value)}`;
}

export function tripGpsSpeedEvaluationHasDisplayableMetrics(
  payload: TripGpsSpeedEvaluationProductV1 | null | undefined,
): boolean {
  if (!payload || payload.availability === 'PENDING' || payload.availability === 'UNAVAILABLE') {
    return false;
  }
  return payload.coverage != null || payload.speed != null;
}
