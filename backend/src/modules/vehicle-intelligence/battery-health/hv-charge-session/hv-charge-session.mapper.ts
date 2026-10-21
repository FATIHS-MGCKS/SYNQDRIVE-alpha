import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { buildHvSessionJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import {
  assessHvChargeSessionQualityFromDimoSegment,
  assessHvChargeSessionQualityFromInput,
} from './hv-charge-session-quality.assessor';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  type HvChargeSessionDraft,
  type HvChargeSessionMetadata,
} from './hv-charge-session.types';
import { mapDimoSegmentToAuthoritativeSessionLocations } from '@modules/vehicle-intelligence/energy-events/erd-recharge-location-provenance/erd-recharge-session-location.policy';
import type { HvChargeSessionResolvedBoundaryEvidence } from './hv-charge-session-boundary-snapshot.policy';
import { HV_CHARGE_SESSION_BOUNDARY_ENRICHMENT_VERSION } from './hv-charge-session-boundary-snapshot.constants';

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
    durationProvenance: segment.durationProvenance,
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: 2,
    isChargingObservedAny: segment.isCharging.anyTrue,
    isChargingObservedAll: segment.isCharging.allTrue,
    cableConnectedObservedAny: segment.cableConnected.anyTrue,
    cableConnectedObservedAll: segment.cableConnected.allTrue,
    socProvenance: segment.soc.provenance,
    currentEnergyProvenance: segment.currentEnergyKwh.provenance,
    addedEnergyProvenance: segment.addedEnergyKwh.provenance,
    startedBeforeRange: segment.startedBeforeRange,
    odometerStartKm: segment.odometerKm.min,
    odometerEndKm: segment.odometerKm.max,
    dimoTokenId: segment.tokenId,
    providerSegmentId: segment.providerSegmentId,
    qualityStatus: qualityAssessment.status,
    qualityReasonCodes: qualityAssessment.reasonCodes,
    capacityShadowEligible: qualityAssessment.capacityShadowEligible,
    capacityValidationEligible: qualityAssessment.capacityValidationEligible,
    ...mapDimoSegmentToAuthoritativeSessionLocations(segment),
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

export function applyHvChargeSessionBoundaryEvidenceToDraft(input: {
  draft: HvChargeSessionDraft;
  segment: NormalizedDimoRechargeSegment;
  evidence: HvChargeSessionResolvedBoundaryEvidence;
  assessedAt?: Date;
}): HvChargeSessionDraft {
  const assessedAt = input.assessedAt ?? new Date();
  const { draft, segment, evidence } = input;

  const qualityAssessment = assessHvChargeSessionQualityFromInput({
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: draft.isOngoing,
    startAt: draft.startAt,
    endAt: draft.endAt,
    durationSeconds: segment.durationSeconds,
    startSocPercent: evidence.start.socPercent,
    endSocPercent: evidence.end.socPercent,
    startEnergyKwh: evidence.start.energyUsedKwh,
    endEnergyKwh: evidence.end.energyUsedKwh,
    energyAddedKwh: segment.addedEnergyKwh.delta,
    deltaSocPercent: evidence.deltaSocPercent,
    addedEnergyMinKwh: segment.addedEnergyKwh.min,
    addedEnergyMaxKwh: segment.addedEnergyKwh.max,
    isChargingObservedAny: segment.isCharging.anyTrue,
    isChargingObservedAll: segment.isCharging.allTrue,
    cableConnectedObservedAny: segment.cableConnected.anyTrue,
    cableConnectedObservedAll: segment.cableConnected.allTrue,
    socExtremaProxy: false,
    energyExtremaProxy: false,
    startedBeforeRange: segment.startedBeforeRange,
    providerObservedAt: draft.providerObservedAt,
    assessedAt,
  });

  const metadata: HvChargeSessionMetadata = {
    ...draft.metadata,
    socProvenance: evidence.provenance,
    currentEnergyProvenance: evidence.provenance,
    addedEnergyProvenance: segment.addedEnergyKwh.provenance,
    boundaryEnrichmentVersion: HV_CHARGE_SESSION_BOUNDARY_ENRICHMENT_VERSION,
    boundaryStartSocObservedAt: evidence.start.socObservedAt.toISOString(),
    boundaryEndSocObservedAt: evidence.end.socObservedAt.toISOString(),
    boundaryStartEnergyObservedAt: evidence.start.energyObservedAt.toISOString(),
    boundaryEndEnergyObservedAt: evidence.end.energyObservedAt.toISOString(),
    boundaryStartOffsetMs: evidence.start.offsetFromBoundaryMs,
    boundaryEndOffsetMs: evidence.end.offsetFromBoundaryMs,
    qualityStatus: qualityAssessment.status,
    qualityReasonCodes: qualityAssessment.reasonCodes,
    capacityShadowEligible: qualityAssessment.capacityShadowEligible,
    capacityValidationEligible: qualityAssessment.capacityValidationEligible,
    lastReconciledAt: assessedAt.toISOString(),
  };

  return {
    ...draft,
    startSocPercent: evidence.start.socPercent,
    endSocPercent: evidence.end.socPercent,
    startEnergyKwh: evidence.start.energyUsedKwh,
    endEnergyKwh: evidence.end.energyUsedKwh,
    deltaSocPercent: evidence.deltaSocPercent,
    energyAddedKwh: segment.addedEnergyKwh.delta,
    quality: qualityAssessment.measurementQuality,
    metadata,
  };
}
