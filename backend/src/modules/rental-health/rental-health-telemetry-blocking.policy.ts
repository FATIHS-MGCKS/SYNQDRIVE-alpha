import {
  resolveTelemetryFreshness,
  type TelemetryTimestampEvidence,
} from '@modules/vehicles/telemetry-freshness.resolver';

/** Canonical blocking reason prefix — aligns with TELEMETRY_OFFLINE notification vocabulary. */
export const RENTAL_HEALTH_TELEMETRY_OFFLINE_BLOCKING_REASON =
  'Telemetrie: Kein Signal innerhalb der letzten 48 Stunden';

export interface TelemetryRentalBlockingEvaluation {
  blocksRental: boolean;
  reason: string | null;
  freshness: ReturnType<typeof resolveTelemetryFreshness>['freshness'];
  observedAtIso: string | null;
}

/**
 * Canonical rental-health telemetry gate.
 *
 * Product rule (2026-08-21):
 * - live / standby → no penalty
 * - signal_delayed (24–48h) → warning elsewhere, NOT a hard rental block
 * - offline (>=48h) → hard NOT_READY
 * - no_signal / missing timestamp → preserve existing unevaluable/unknown paths (no auto block)
 */
export function evaluateTelemetryRentalBlocking(
  evidence: TelemetryTimestampEvidence,
  nowMs: number = Date.now(),
): TelemetryRentalBlockingEvaluation {
  const resolved = resolveTelemetryFreshness(evidence, nowMs);

  if (resolved.freshness === 'offline') {
    return {
      blocksRental: true,
      reason: RENTAL_HEALTH_TELEMETRY_OFFLINE_BLOCKING_REASON,
      freshness: resolved.freshness,
      observedAtIso: resolved.observedAtIso,
    };
  }

  return {
    blocksRental: false,
    reason: null,
    freshness: resolved.freshness,
    observedAtIso: resolved.observedAtIso,
  };
}
