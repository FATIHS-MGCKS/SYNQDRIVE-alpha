import type { RawRefuelCandidate } from '@prisma/client';

/** Canonical G2 VehicleEnergyEvent.rawDetectionMeta fuel-transition contract. */
export interface FallbackRawDetectionMetaCanonical {
  fuelStartLiters: number | null;
  fuelEndLiters: number | null;
  fuelStartPercent: number | null;
  fuelEndPercent: number | null;
}

/** RFRF provenance retained alongside the canonical G2 contract. */
export interface FallbackRawDetectionMetaProvenance {
  rawRefuelCandidateId: string;
  candidateIdentityKey: string;
  evidenceRevisionFingerprint: string;
  signalChannel: string;
  detectorVersion: string;
  preFuelAbsoluteLiters: number | null;
  postFuelAbsoluteLiters: number | null;
  preFuelRelativePercent: number | null;
  postFuelRelativePercent: number | null;
}

export type FallbackRawDetectionMeta = FallbackRawDetectionMetaCanonical &
  FallbackRawDetectionMetaProvenance;

/**
 * Single owner for promoted fallback VehicleEnergyEvent.rawDetectionMeta.
 *
 * Canonical fuelStart/fuelEnd keys mirror native DIMO persistence for
 * vehicleEnergyEventToRefuelRow(). RFRF pre/post aliases derive from the same
 * candidate values and must never diverge.
 */
export function buildFallbackRawDetectionMeta(
  candidate: RawRefuelCandidate,
): Record<string, unknown> {
  const fuelStartLiters = candidate.preFuelAbsoluteLiters;
  const fuelEndLiters = candidate.postFuelAbsoluteLiters;
  const fuelStartPercent = candidate.preFuelRelativePercent;
  const fuelEndPercent = candidate.postFuelRelativePercent;

  return {
    fuelStartLiters,
    fuelEndLiters,
    fuelStartPercent,
    fuelEndPercent,
    rawRefuelCandidateId: candidate.id,
    candidateIdentityKey: candidate.candidateIdentityKey!,
    evidenceRevisionFingerprint: candidate.evidenceRevisionFingerprint,
    signalChannel: candidate.signalChannel,
    detectorVersion: candidate.detectorVersion,
    preFuelAbsoluteLiters: fuelStartLiters,
    postFuelAbsoluteLiters: fuelEndLiters,
    preFuelRelativePercent: fuelStartPercent,
    postFuelRelativePercent: fuelEndPercent,
  } satisfies FallbackRawDetectionMeta as Record<string, unknown>;
}
