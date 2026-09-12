import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate/raw-refuel-candidate.types';
import type { RawFuelRiseDetectionContext } from './raw-fuel-signal-sample.types';
import type { DetectedRiseDraft } from './raw-fuel-rise-state-machine';
import { draftToObservationFields } from './raw-fuel-rise-state-machine';
import type { RawFuelRiseDetectorConfig } from './raw-fuel-rise-detector.config';

export function mapDraftToObservation(
  draft: DetectedRiseDraft,
  context: RawFuelRiseDetectionContext,
  config: RawFuelRiseDetectorConfig,
): RawRefuelCandidateObservation {
  const fields = draftToObservationFields(draft, context, config);
  return {
    organizationId: context.organizationId,
    vehicleId: context.vehicleId,
    detectionVersion: context.detectionVersion,
    detectorVersion: context.detectorVersion,
    signalChannel: draft.channel,
    lifecycleState: draft.lifecycleState,
    rejectionReason: draft.rejectionReason,
    physicalEvidenceStart: fields.physicalEvidenceStart,
    physicalEvidenceEnd: fields.physicalEvidenceEnd,
    riseOnsetAt: draft.riseOnsetAt,
    riseEndAt: draft.riseEndAt,
    preFuelAbsoluteLiters: fields.preFuelAbsoluteLiters,
    postFuelAbsoluteLiters: fields.postFuelAbsoluteLiters,
    deltaAbsoluteLiters: fields.deltaAbsoluteLiters,
    preFuelRelativePercent: fields.preFuelRelativePercent,
    postFuelRelativePercent: fields.postFuelRelativePercent,
    deltaRelativePercent: fields.deltaRelativePercent,
    prePlateauSampleCount: fields.prePlateauSampleCount,
    postPlateauSampleCount: fields.postPlateauSampleCount,
    totalSampleCount: fields.totalSampleCount,
    maxSampleGapSeconds: draft.maxSampleGapSeconds,
    absoluteSignalTrust: context.absoluteSignalTrust,
    relativeSignalAvailable: context.relativeSignalAvailable,
    routeEvidenceAvailable: context.routeEvidenceAvailable ?? null,
    stationaryEvidenceAvailable: context.stationaryEvidenceAvailable ?? null,
    scanWindowStart: context.scanWindowStart,
    scanWindowEnd: context.scanWindowEnd,
    signalProvider: context.signalProvider ?? null,
    evidenceMeta: fields.evidenceMeta,
    qualityMeta: fields.qualityMeta,
  };
}
