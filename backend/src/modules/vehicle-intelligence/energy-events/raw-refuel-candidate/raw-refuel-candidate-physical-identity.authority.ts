import { createHash } from 'node:crypto';
import type { RawRefuelCandidateSignalChannel } from '@prisma/client';
import {
  floorToUtcBucket,
} from './raw-refuel-candidate-identity-key';
import { RAW_REFUEL_CANDIDATE_IDENTITY_RISE_BUCKET_MS } from './raw-refuel-candidate.constants';

/** Future physical identity authority — not wired to F2 persistence in R1. */
export const RFRF_CANDIDATE_PHYSICAL_IDENTITY_AUTHORITY_V1 =
  'rfrf-candidate-physical-identity-v1' as const;

export interface BuildPhysicalCandidateIdentityKeyInput {
  vehicleId: string;
  signalChannel: RawRefuelCandidateSignalChannel;
  prePlateauBucket: number;
  riseOnsetAt: Date;
}

/**
 * Pure future physical identity digest — excludes detectionVersion/detectorVersion.
 * Domain-separated preimage; SHA-256 hex output.
 */
export function buildPhysicalCandidateIdentityKeyV1(
  input: BuildPhysicalCandidateIdentityKeyInput,
): string {
  const riseOnsetBucketUtc = floorToUtcBucket(
    input.riseOnsetAt,
    RAW_REFUEL_CANDIDATE_IDENTITY_RISE_BUCKET_MS,
  );
  const canonical = [
    RFRF_CANDIDATE_PHYSICAL_IDENTITY_AUTHORITY_V1,
    input.vehicleId,
    input.signalChannel,
    String(input.prePlateauBucket),
    riseOnsetBucketUtc.toISOString(),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
