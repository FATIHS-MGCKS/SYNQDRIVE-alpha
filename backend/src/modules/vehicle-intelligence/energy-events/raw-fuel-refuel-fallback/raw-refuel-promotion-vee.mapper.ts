import type { Prisma } from '@prisma/client';
import type { RawRefuelCandidatePromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';

export function mapPromotionDraftToVehicleEnergyEventCreateInput(
  draft: RawRefuelCandidatePromotionDraft,
): Prisma.VehicleEnergyEventUncheckedCreateInput {
  return {
    vehicleId: draft.vehicleId,
    dimoSegmentId: draft.dimoSegmentIdPlaceholder,
    detectionSource: draft.detectionSource,
    sourceEventKey: draft.sourceEventKey,
    kind: draft.kind,
    detectionMechanism: draft.detectionMechanism,
    startTime: draft.startTime,
    endTime: draft.endTime,
    durationSeconds: draft.durationSeconds,
    fuelDeltaLiters: draft.fuelDeltaLiters,
    fuelDeltaPercent: draft.fuelDeltaPercent,
    fuelLevelRiseStart: draft.fuelLevelRiseStart,
    fuelLevelRiseEnd: draft.fuelLevelRiseEnd,
    fuelLevelRiseDurationSeconds: draft.fuelLevelRiseDurationSeconds,
    rawDetectionMeta: draft.rawDetectionMeta as Prisma.InputJsonValue,
    confidence: 'MEDIUM',
  };
}
