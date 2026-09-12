import type { RawRefuelCandidate } from '@prisma/client';
import { RawRefuelCandidateLifecycleValidationError } from './raw-refuel-candidate.errors';

/**
 * F2 promotion contract — structure/mapping only; no runtime promotion caller in F2.
 * Future: READY_FOR_PERSIST → VehicleEnergyEvent (SYNQDRIVE_RAW_FUEL_FALLBACK) → G2.
 */
export interface RawRefuelCandidatePromotionDraft {
  vehicleId: string;
  detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK';
  sourceEventKey: string;
  dimoSegmentIdPlaceholder: string;
  kind: 'REFUEL';
  detectionMechanism: 'raw_fuel_fallback';
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  fuelLevelRiseStart: Date | null;
  fuelLevelRiseEnd: Date | null;
  fuelLevelRiseDurationSeconds: number | null;
  rawDetectionMeta: Record<string, unknown>;
  /** SynqDrive first durable observation — NOT physical refuel time. */
  firstObservedAt: Date;
}

export function buildSyntheticDimoSegmentIdPlaceholder(
  vehicleId: string,
  candidateIdentityKey: string,
): string {
  return `synqdrive-rfrf-${vehicleId}-${candidateIdentityKey.slice(0, 16)}`;
}

export function mapRawRefuelCandidateToPromotionDraft(
  candidate: RawRefuelCandidate,
): RawRefuelCandidatePromotionDraft {
  if (!candidate.candidateIdentityKey) {
    throw new RawRefuelCandidateLifecycleValidationError(
      'Cannot map candidate to promotion draft without candidateIdentityKey',
    );
  }

  const startTime =
    candidate.riseOnsetAt ??
    candidate.physicalEvidenceStart ??
    candidate.firstObservedAt;
  const endTime =
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    (candidate.postFuelAbsoluteLiters != null ||
    candidate.postFuelRelativePercent != null
      ? candidate.lastObservedAt
      : candidate.firstObservedAt);
  const durationSeconds = Math.max(
    1,
    Math.round((endTime.getTime() - startTime.getTime()) / 1000),
  );
  const riseDurationSeconds =
    candidate.riseOnsetAt && candidate.riseEndAt
      ? Math.max(
          0,
          Math.round(
            (candidate.riseEndAt.getTime() - candidate.riseOnsetAt.getTime()) / 1000,
          ),
        )
      : null;

  return {
    vehicleId: candidate.vehicleId,
    detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
    sourceEventKey: candidate.candidateIdentityKey,
    dimoSegmentIdPlaceholder: buildSyntheticDimoSegmentIdPlaceholder(
      candidate.vehicleId,
      candidate.candidateIdentityKey,
    ),
    kind: 'REFUEL',
    detectionMechanism: 'raw_fuel_fallback',
    startTime,
    endTime,
    durationSeconds,
    fuelDeltaLiters: candidate.deltaAbsoluteLiters,
    fuelDeltaPercent: candidate.deltaRelativePercent,
    fuelLevelRiseStart: candidate.riseOnsetAt,
    fuelLevelRiseEnd: candidate.riseEndAt,
    fuelLevelRiseDurationSeconds: riseDurationSeconds,
    rawDetectionMeta: {
      rawRefuelCandidateId: candidate.id,
      candidateIdentityKey: candidate.candidateIdentityKey,
      evidenceRevisionFingerprint: candidate.evidenceRevisionFingerprint,
      preFuelAbsoluteLiters: candidate.preFuelAbsoluteLiters,
      postFuelAbsoluteLiters: candidate.postFuelAbsoluteLiters,
      preFuelRelativePercent: candidate.preFuelRelativePercent,
      postFuelRelativePercent: candidate.postFuelRelativePercent,
      signalChannel: candidate.signalChannel,
      detectorVersion: candidate.detectorVersion,
    },
    firstObservedAt: candidate.firstObservedAt,
  };
}
