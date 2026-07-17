import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { buildHvSessionJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { assessHvChargeSessionQualityFromDimoSegment } from './hv-charge-session-quality.assessor';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  type HvChargeSessionDraft,
  type HvChargeSessionMetadata,
} from './hv-charge-session.types';

export function mapRechargeSegmentToHvChargeSessionDraft(input: {
  organizationId: string;
  vehicleId: string;
  segment: NormalizedDimoRechargeSegment;
  reconciledAt?: Date;
}): HvChargeSessionDraft {
  const { organizationId, vehicleId, segment } = input;
  const reconciledAt = input.reconciledAt ?? new Date();
  const segmentFingerprint = segment.fingerprint;
  const qualityAssessment = assessHvChargeSessionQualityFromDimoSegment(
    segment,
    reconciledAt,
  );

  const metadata: HvChargeSessionMetadata = {
    providerSegmentFingerprint: segmentFingerprint,
    durationSeconds: segment.durationSeconds,
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: 1,
    isChargingStart: segment.isCharging.start,
    isChargingEnd: segment.isCharging.end,
    cableConnectedStart: segment.cableConnected.start,
    cableConnectedEnd: segment.cableConnected.end,
    startedBeforeRange: segment.startedBeforeRange,
    odometerStartKm: segment.odometerKm.min,
    odometerEndKm: segment.odometerKm.max,
    dimoTokenId: segment.tokenId,
    providerSegmentId: segment.providerSegmentId,
    qualityStatus: qualityAssessment.status,
    qualityReasonCodes: qualityAssessment.reasonCodes,
    capacityShadowEligible: qualityAssessment.capacityShadowEligible,
    capacityValidationEligible: qualityAssessment.capacityValidationEligible,
  };

  return {
    organizationId,
    vehicleId,
    segmentFingerprint,
    dimoSegmentId: segment.segmentId,
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt: new Date(segment.startAt),
    endAt: segment.endAt ? new Date(segment.endAt) : null,
    startSocPercent: segment.soc.min,
    endSocPercent: segment.soc.max,
    startEnergyKwh: segment.currentEnergyKwh.min,
    endEnergyKwh: segment.currentEnergyKwh.max,
    energyAddedKwh: segment.addedEnergyKwh.delta,
    deltaSocPercent: segment.soc.delta,
    isOngoing: segment.ongoing,
    quality: qualityAssessment.measurementQuality,
    idempotencyKey: buildHvSessionJobIdempotencyKey({
      vehicleId,
      segmentFingerprint,
    }),
    providerObservedAt: segment.endAt
      ? new Date(segment.endAt)
      : new Date(segment.startAt),
    metadata,
  };
}
