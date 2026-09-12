import type { RawRefuelCandidate } from '@prisma/client';
import type {
  RawRefuelCandidateEvidenceSlice,
  RawRefuelCandidateObservation,
} from './raw-refuel-candidate.types';

export interface MergedRawRefuelCandidateEvidence {
  organizationId: string;
  vehicleId: string;
  detectionVersion: string;
  signalChannel: RawRefuelCandidateEvidenceSlice['signalChannel'];
  physicalEvidenceStart: Date | null;
  physicalEvidenceEnd: Date | null;
  riseOnsetAt: Date | null;
  riseEndAt: Date | null;
  preFuelAbsoluteLiters: number | null;
  postFuelAbsoluteLiters: number | null;
  deltaAbsoluteLiters: number | null;
  preFuelRelativePercent: number | null;
  postFuelRelativePercent: number | null;
  deltaRelativePercent: number | null;
  prePlateauSampleCount: number | null;
  postPlateauSampleCount: number | null;
  totalSampleCount: number | null;
  maxSampleGapSeconds: number | null;
  absoluteSignalTrust: RawRefuelCandidateEvidenceSlice['absoluteSignalTrust'];
  relativeSignalAvailable: boolean | null;
  routeEvidenceAvailable: boolean | null;
  stationaryEvidenceAvailable: boolean | null;
  scanWindowStart: Date | null;
  scanWindowEnd: Date | null;
  signalProvider: string | null;
  evidenceMeta: Record<string, unknown> | null;
  qualityMeta: Record<string, unknown> | null;
}

export function candidateRowToEvidenceSlice(row: RawRefuelCandidate): MergedRawRefuelCandidateEvidence {
  return {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    detectionVersion: row.detectionVersion,
    signalChannel: row.signalChannel,
    physicalEvidenceStart: row.physicalEvidenceStart,
    physicalEvidenceEnd: row.physicalEvidenceEnd,
    riseOnsetAt: row.riseOnsetAt,
    riseEndAt: row.riseEndAt,
    preFuelAbsoluteLiters: row.preFuelAbsoluteLiters,
    postFuelAbsoluteLiters: row.postFuelAbsoluteLiters,
    deltaAbsoluteLiters: row.deltaAbsoluteLiters,
    preFuelRelativePercent: row.preFuelRelativePercent,
    postFuelRelativePercent: row.postFuelRelativePercent,
    deltaRelativePercent: row.deltaRelativePercent,
    prePlateauSampleCount: row.prePlateauSampleCount,
    postPlateauSampleCount: row.postPlateauSampleCount,
    totalSampleCount: row.totalSampleCount,
    maxSampleGapSeconds: row.maxSampleGapSeconds,
    absoluteSignalTrust: row.absoluteSignalTrust,
    relativeSignalAvailable: row.relativeSignalAvailable,
    routeEvidenceAvailable: row.routeEvidenceAvailable,
    stationaryEvidenceAvailable: row.stationaryEvidenceAvailable,
    scanWindowStart: row.scanWindowStart,
    scanWindowEnd: row.scanWindowEnd,
    signalProvider: row.signalProvider,
    evidenceMeta: (row.evidenceMeta as Record<string, unknown> | null) ?? null,
    qualityMeta: (row.qualityMeta as Record<string, unknown> | null) ?? null,
  };
}

export function mergeCandidateEvidence(
  existing: RawRefuelCandidate | null,
  observation: RawRefuelCandidateObservation,
  organizationId: string,
): MergedRawRefuelCandidateEvidence {
  const base = existing ? candidateRowToEvidenceSlice(existing) : null;
  return {
    organizationId,
    vehicleId: observation.vehicleId,
    detectionVersion: observation.detectionVersion,
    signalChannel: observation.signalChannel,
    physicalEvidenceStart: minDate(base?.physicalEvidenceStart ?? null, observation.physicalEvidenceStart),
    physicalEvidenceEnd: maxDate(base?.physicalEvidenceEnd ?? null, observation.physicalEvidenceEnd),
    riseOnsetAt: minDate(base?.riseOnsetAt ?? null, observation.riseOnsetAt),
    riseEndAt: maxDate(base?.riseEndAt ?? null, observation.riseEndAt),
    preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters ?? base?.preFuelAbsoluteLiters ?? null,
    postFuelAbsoluteLiters: observation.postFuelAbsoluteLiters ?? base?.postFuelAbsoluteLiters ?? null,
    deltaAbsoluteLiters: observation.deltaAbsoluteLiters ?? base?.deltaAbsoluteLiters ?? null,
    preFuelRelativePercent: observation.preFuelRelativePercent ?? base?.preFuelRelativePercent ?? null,
    postFuelRelativePercent: observation.postFuelRelativePercent ?? base?.postFuelRelativePercent ?? null,
    deltaRelativePercent: observation.deltaRelativePercent ?? base?.deltaRelativePercent ?? null,
    prePlateauSampleCount: observation.prePlateauSampleCount ?? base?.prePlateauSampleCount ?? null,
    postPlateauSampleCount: observation.postPlateauSampleCount ?? base?.postPlateauSampleCount ?? null,
    totalSampleCount: observation.totalSampleCount ?? base?.totalSampleCount ?? null,
    maxSampleGapSeconds: observation.maxSampleGapSeconds ?? base?.maxSampleGapSeconds ?? null,
    absoluteSignalTrust: observation.absoluteSignalTrust ?? base?.absoluteSignalTrust ?? null,
    relativeSignalAvailable:
      observation.relativeSignalAvailable ?? base?.relativeSignalAvailable ?? null,
    routeEvidenceAvailable:
      observation.routeEvidenceAvailable ?? base?.routeEvidenceAvailable ?? null,
    stationaryEvidenceAvailable:
      observation.stationaryEvidenceAvailable ?? base?.stationaryEvidenceAvailable ?? null,
    scanWindowStart: observation.scanWindowStart ?? base?.scanWindowStart ?? null,
    scanWindowEnd: observation.scanWindowEnd ?? base?.scanWindowEnd ?? null,
    signalProvider: observation.signalProvider ?? base?.signalProvider ?? null,
    evidenceMeta: observation.evidenceMeta ?? base?.evidenceMeta ?? null,
    qualityMeta: observation.qualityMeta ?? base?.qualityMeta ?? null,
  };
}

function minDate(current: Date | null, incoming: Date | null | undefined): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming < current ? incoming : current;
}

function maxDate(current: Date | null, incoming: Date | null | undefined): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming > current ? incoming : current;
}
