/** Read-only helpers for persisted DS4 shadow JSON (no DS4 algorithm changes). */

export function extractM3JPerKgPerKmFromShadowPayload(payload: unknown): number | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const acc = p.acceleration as { okM3JPerKgPerKmSum?: number } | undefined;
  const dec = p.deceleration as { okM3JPerKgPerKmSum?: number } | undefined;
  const sum =
    (typeof acc?.okM3JPerKgPerKmSum === 'number' ? acc.okM3JPerKgPerKmSum : 0) +
    (typeof dec?.okM3JPerKgPerKmSum === 'number' ? dec.okM3JPerKgPerKmSum : 0);
  if (!Number.isFinite(sum)) return null;
  return sum;
}

export function extractTemporalSecondsFromShadowPayload(payload: unknown): {
  validDrivingSeconds: number | null;
  tripDurationSeconds: number | null;
} {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { validDrivingSeconds: null, tripDurationSeconds: null };
  }
  const p = payload as Record<string, unknown>;
  const detail = p.temporalCoverageDetail as
    | {
        validDrivingSeconds?: number;
        observedTripDurationSeconds?: number;
        tripDurationSeconds?: number;
      }
    | undefined;
  const valid =
    typeof detail?.validDrivingSeconds === 'number'
      ? detail.validDrivingSeconds
      : null;
  const duration =
    typeof detail?.observedTripDurationSeconds === 'number'
      ? detail.observedTripDurationSeconds
      : typeof detail?.tripDurationSeconds === 'number'
        ? detail.tripDurationSeconds
        : null;
  return { validDrivingSeconds: valid, tripDurationSeconds: duration };
}
