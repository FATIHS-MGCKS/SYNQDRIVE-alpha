import { createHash } from 'node:crypto';
import { canonicalJsonString } from './raw-refuel-candidate-canonical-json';
import type { RawRefuelCandidateEvidenceSlice } from './raw-refuel-candidate.types';

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function num(value: number | null | undefined): number | null {
  return value == null ? null : Number(value.toFixed(6));
}

/**
 * Deterministic canonical digest of current evidence maturity.
 * Mutates on meaningful evidence changes; independent of candidateIdentityKey.
 */
export function buildEvidenceRevisionFingerprint(
  evidence: RawRefuelCandidateEvidenceSlice,
): string {
  const payload = {
    detectionVersion: evidence.detectionVersion,
    signalChannel: evidence.signalChannel,
    physicalEvidenceStart: iso(evidence.physicalEvidenceStart),
    physicalEvidenceEnd: iso(evidence.physicalEvidenceEnd),
    riseOnsetAt: iso(evidence.riseOnsetAt),
    riseEndAt: iso(evidence.riseEndAt),
    preFuelAbsoluteLiters: num(evidence.preFuelAbsoluteLiters),
    postFuelAbsoluteLiters: num(evidence.postFuelAbsoluteLiters),
    deltaAbsoluteLiters: num(evidence.deltaAbsoluteLiters),
    preFuelRelativePercent: num(evidence.preFuelRelativePercent),
    postFuelRelativePercent: num(evidence.postFuelRelativePercent),
    deltaRelativePercent: num(evidence.deltaRelativePercent),
    prePlateauSampleCount: evidence.prePlateauSampleCount ?? null,
    postPlateauSampleCount: evidence.postPlateauSampleCount ?? null,
    totalSampleCount: evidence.totalSampleCount ?? null,
    maxSampleGapSeconds: evidence.maxSampleGapSeconds ?? null,
    absoluteSignalTrust: evidence.absoluteSignalTrust ?? null,
    relativeSignalAvailable: evidence.relativeSignalAvailable ?? null,
    routeEvidenceAvailable: evidence.routeEvidenceAvailable ?? null,
    stationaryEvidenceAvailable: evidence.stationaryEvidenceAvailable ?? null,
    scanWindowStart: iso(evidence.scanWindowStart),
    scanWindowEnd: iso(evidence.scanWindowEnd),
    signalProvider: evidence.signalProvider ?? null,
    evidenceMeta: evidence.evidenceMeta ?? null,
    qualityMeta: evidence.qualityMeta ?? null,
  };

  const canonical = canonicalJsonString(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

export function observationToEvidenceSlice(
  observation: RawRefuelCandidateEvidenceSlice & {
    organizationId: string;
    vehicleId: string;
    detectionVersion: string;
  },
): RawRefuelCandidateEvidenceSlice {
  return {
    organizationId: observation.organizationId,
    vehicleId: observation.vehicleId,
    detectionVersion: observation.detectionVersion,
    signalChannel: observation.signalChannel,
    physicalEvidenceStart: observation.physicalEvidenceStart,
    physicalEvidenceEnd: observation.physicalEvidenceEnd,
    riseOnsetAt: observation.riseOnsetAt,
    riseEndAt: observation.riseEndAt,
    preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters,
    postFuelAbsoluteLiters: observation.postFuelAbsoluteLiters,
    deltaAbsoluteLiters: observation.deltaAbsoluteLiters,
    preFuelRelativePercent: observation.preFuelRelativePercent,
    postFuelRelativePercent: observation.postFuelRelativePercent,
    deltaRelativePercent: observation.deltaRelativePercent,
    prePlateauSampleCount: observation.prePlateauSampleCount,
    postPlateauSampleCount: observation.postPlateauSampleCount,
    totalSampleCount: observation.totalSampleCount,
    maxSampleGapSeconds: observation.maxSampleGapSeconds,
    absoluteSignalTrust: observation.absoluteSignalTrust,
    relativeSignalAvailable: observation.relativeSignalAvailable,
    routeEvidenceAvailable: observation.routeEvidenceAvailable,
    stationaryEvidenceAvailable: observation.stationaryEvidenceAvailable,
    scanWindowStart: observation.scanWindowStart,
    scanWindowEnd: observation.scanWindowEnd,
    signalProvider: observation.signalProvider,
    evidenceMeta: observation.evidenceMeta,
    qualityMeta: observation.qualityMeta,
  };
}
