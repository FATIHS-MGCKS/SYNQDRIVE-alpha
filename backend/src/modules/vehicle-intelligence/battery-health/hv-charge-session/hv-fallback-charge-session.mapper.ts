import { BatteryMeasurementQuality } from '@prisma/client';
import { buildHvSessionJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import {
  buildFallbackSegmentFingerprint,
} from './hv-fallback-charge-session.policy';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import {
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionDraft,
  type HvChargeSessionMetadata,
} from './hv-charge-session.types';

export function assessFallbackChargeSessionQuality(
  candidate: HvFallbackChargeSessionCandidate,
): BatteryMeasurementQuality {
  if (candidate.providerStale) {
    return BatteryMeasurementQuality.STALE;
  }
  if (candidate.isOngoing) {
    return BatteryMeasurementQuality.SHADOW;
  }
  if (
    candidate.deltaSocPercent != null &&
    candidate.deltaSocPercent >= 5 &&
    candidate.endAt != null &&
    candidate.endAt.getTime() - candidate.startAt.getTime() >= 5 * 60 * 1000
  ) {
    return BatteryMeasurementQuality.SHADOW;
  }
  return BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
}

export function mapFallbackCandidateToHvChargeSessionDraft(input: {
  organizationId: string;
  vehicleId: string;
  candidate: HvFallbackChargeSessionCandidate;
  reconciledAt?: Date;
}): HvChargeSessionDraft {
  const { organizationId, vehicleId, candidate } = input;
  const reconciledAt = input.reconciledAt ?? new Date();
  const segmentFingerprint = buildFallbackSegmentFingerprint(
    vehicleId,
    candidate.startAt,
  );
  const durationSeconds = candidate.endAt
    ? Math.max(
        0,
        Math.round(
          (candidate.endAt.getTime() - candidate.startAt.getTime()) / 1000,
        ),
      )
    : null;

  const metadata: HvChargeSessionMetadata = {
    providerSegmentFingerprint: segmentFingerprint,
    durationSeconds,
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: 1,
    fallbackPrimaryTier: candidate.primaryTier,
    fallbackCorroboratingTiers: candidate.corroboratingTiers,
    fallbackEvidenceStrength: candidate.evidenceStrength,
    fallbackEndReason: candidate.endReason,
  };

  return {
    organizationId,
    vehicleId,
    segmentFingerprint,
    dimoSegmentId: null,
    source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    startSocPercent: candidate.startSocPercent,
    endSocPercent: candidate.endSocPercent,
    startEnergyKwh: candidate.startEnergyKwh,
    endEnergyKwh: candidate.endEnergyKwh,
    energyAddedKwh: candidate.energyAddedKwh,
    deltaSocPercent: candidate.deltaSocPercent,
    isOngoing: candidate.isOngoing,
    quality: assessFallbackChargeSessionQuality(candidate),
    idempotencyKey: buildHvSessionJobIdempotencyKey({
      vehicleId,
      segmentFingerprint,
    }),
    providerObservedAt: candidate.endAt ?? candidate.startAt,
    metadata,
  };
}
