import { BatteryMeasurementQuality } from '@prisma/client';
import { buildHvSessionJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import {
  buildFallbackSegmentFingerprint,
} from './hv-fallback-charge-session.policy';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import { assessHvChargeSessionQualityFromFallbackCandidate } from './hv-charge-session-quality.assessor';
import {
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionDraft,
  type HvChargeSessionMetadata,
} from './hv-charge-session.types';

/** @deprecated Use assessHvChargeSessionQualityFromFallbackCandidate */
export function assessFallbackChargeSessionQuality(
  candidate: HvFallbackChargeSessionCandidate,
): BatteryMeasurementQuality {
  return assessHvChargeSessionQualityFromFallbackCandidate(candidate).measurementQuality;
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

  const qualityAssessment = assessHvChargeSessionQualityFromFallbackCandidate(
    candidate,
    reconciledAt,
  );

  const metadata: HvChargeSessionMetadata = {
    providerSegmentFingerprint: segmentFingerprint,
    durationSeconds,
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: 1,
    fallbackPrimaryTier: candidate.primaryTier,
    fallbackCorroboratingTiers: candidate.corroboratingTiers,
    fallbackEvidenceStrength: candidate.evidenceStrength,
    fallbackEndReason: candidate.endReason,
    qualityStatus: qualityAssessment.status,
    qualityReasonCodes: qualityAssessment.reasonCodes,
    capacityShadowEligible: qualityAssessment.capacityShadowEligible,
    capacityValidationEligible: qualityAssessment.capacityValidationEligible,
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
    quality: qualityAssessment.measurementQuality,
    idempotencyKey: buildHvSessionJobIdempotencyKey({
      vehicleId,
      segmentFingerprint,
    }),
    providerObservedAt: candidate.endAt ?? candidate.startAt,
    metadata,
  };
}
