import { createHash } from 'node:crypto';
import type { RawRefuelCandidateSignalChannel } from '@prisma/client';
import { RAW_REFUEL_CANDIDATE_IDENTITY_RISE_BUCKET_MS } from './raw-refuel-candidate.constants';

export function floorToUtcBucket(timestamp: Date, bucketMs: number): Date {
  const ms = Math.floor(timestamp.getTime() / bucketMs) * bucketMs;
  return new Date(ms);
}

export function bucketPrePlateauLevel(
  signalChannel: RawRefuelCandidateSignalChannel,
  value: number,
): number {
  if (signalChannel === 'ABSOLUTE_LITERS') {
    return Math.round(value * 10) / 10;
  }
  return Math.round(value * 10) / 10;
}

export interface BuildCandidateIdentityKeyInput {
  vehicleId: string;
  detectionVersion: string;
  signalChannel: RawRefuelCandidateSignalChannel;
  prePlateauBucket: number;
  riseOnsetAt: Date;
}

/**
 * Assigned only when inserting a new row after semantic rediscovery finds no match.
 * Immutable after assignment — delayed telemetry must not recompute/replace this key.
 */
export function buildCandidateIdentityKey(input: BuildCandidateIdentityKeyInput): string {
  const riseOnsetBucketUtc = floorToUtcBucket(
    input.riseOnsetAt,
    RAW_REFUEL_CANDIDATE_IDENTITY_RISE_BUCKET_MS,
  );
  const canonical = [
    input.vehicleId,
    input.detectionVersion,
    input.signalChannel,
    String(input.prePlateauBucket),
    riseOnsetBucketUtc.toISOString(),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

export function derivePrePlateauBucketFromObservation(input: {
  signalChannel: RawRefuelCandidateSignalChannel;
  preFuelAbsoluteLiters?: number | null;
  preFuelRelativePercent?: number | null;
}): number | null {
  if (input.signalChannel === 'ABSOLUTE_LITERS') {
    if (input.preFuelAbsoluteLiters == null) return null;
    return bucketPrePlateauLevel(input.signalChannel, input.preFuelAbsoluteLiters);
  }
  if (input.preFuelRelativePercent == null) return null;
  return bucketPrePlateauLevel(input.signalChannel, input.preFuelRelativePercent);
}

export function tryBuildCandidateIdentityKeyFromEvidence(input: {
  vehicleId: string;
  detectionVersion: string;
  signalChannel: RawRefuelCandidateSignalChannel;
  riseOnsetAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  preFuelRelativePercent?: number | null;
}): string | null {
  if (!input.riseOnsetAt) return null;
  const prePlateauBucket = derivePrePlateauBucketFromObservation(input);
  if (prePlateauBucket == null) return null;
  return buildCandidateIdentityKey({
    vehicleId: input.vehicleId,
    detectionVersion: input.detectionVersion,
    signalChannel: input.signalChannel,
    prePlateauBucket,
    riseOnsetAt: input.riseOnsetAt,
  });
}
