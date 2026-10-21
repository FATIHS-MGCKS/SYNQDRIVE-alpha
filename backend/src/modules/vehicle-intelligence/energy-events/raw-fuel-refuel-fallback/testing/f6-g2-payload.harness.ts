import type { RawRefuelCandidate, VehicleEnergyEvent } from '@prisma/client';
import { buildFallbackRawDetectionMeta } from '../fallback-raw-detection-meta.mapper';

export function readPersistedFallbackMeta(vee: VehicleEnergyEvent): Record<string, unknown> {
  const meta = vee.rawDetectionMeta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('expected object rawDetectionMeta on fallback VEE');
  }
  return meta as Record<string, unknown>;
}

export function assertFallbackCanonicalMetaConsistency(
  candidate: RawRefuelCandidate,
  vee: VehicleEnergyEvent,
): void {
  const meta = readPersistedFallbackMeta(vee);
  const expected = buildFallbackRawDetectionMeta(candidate);

  expect(meta.fuelStartLiters).toBe(expected.fuelStartLiters);
  expect(meta.fuelEndLiters).toBe(expected.fuelEndLiters);
  expect(meta.fuelStartPercent).toBe(expected.fuelStartPercent);
  expect(meta.fuelEndPercent).toBe(expected.fuelEndPercent);
  expect(meta.preFuelAbsoluteLiters).toBe(meta.fuelStartLiters);
  expect(meta.postFuelAbsoluteLiters).toBe(meta.fuelEndLiters);
  expect(meta.preFuelRelativePercent).toBe(meta.fuelStartPercent);
  expect(meta.postFuelRelativePercent).toBe(meta.fuelEndPercent);
  expect(meta.rawRefuelCandidateId).toBe(candidate.id);
  expect(meta.candidateIdentityKey).toBe(candidate.candidateIdentityKey);
  expect(meta.evidenceRevisionFingerprint).toBe(candidate.evidenceRevisionFingerprint);
  expect(meta.detectorVersion).toBe(candidate.detectorVersion);
  expect(meta.signalChannel).toBe(candidate.signalChannel);
}
