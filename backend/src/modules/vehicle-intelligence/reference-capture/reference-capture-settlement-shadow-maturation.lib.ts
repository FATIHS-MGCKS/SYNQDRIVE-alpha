import { EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL } from './reference-capture-exp-021-motion.lib';
import type { BucketValueSnapshots } from './reference-capture-settlement-shadow-value-snapshot';

export type MaturationObservationRecord = {
  probeId: string;
  probeType: 'FIXED_INTERVAL' | 'WHOLE_TRIP';
  phase: string | null;
  sourceIntervalStart: Date | string;
  sourceIntervalEnd: Date | string;
  scheduledAgeMs: number;
  observationJson: {
    candidateId?: string;
    uniqueBucketIdentities?: string[];
    bucketValueSnapshots?: BucketValueSnapshots;
    valueContentHash?: string;
    valueRevisedBucketIdentities?: string[];
  } | null;
};

function intervalKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Select the immediately prior maturation observation for cross-age bucket comparison.
 * Grouping authority:
 * - FIXED_INTERVAL: same probeId
 * - PDI: same candidateId + source interval
 * - canonical WHOLE_TRIP: phase null + same source interval
 */
export function selectPriorMaturationObservation(args: {
  current: MaturationObservationRecord;
  priorObservations: MaturationObservationRecord[];
  pdiCandidateId?: string | null;
}): MaturationObservationRecord | null {
  const currentStart = intervalKey(args.current.sourceIntervalStart);
  const currentEnd = intervalKey(args.current.sourceIntervalEnd);
  const eligible = args.priorObservations
    .filter((row) => row.scheduledAgeMs < args.current.scheduledAgeMs)
    .sort((a, b) => b.scheduledAgeMs - a.scheduledAgeMs);

  const isPdi = args.current.phase === EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL;
  const isCanonicalWholeTrip =
    args.current.probeType === 'WHOLE_TRIP' &&
    (args.current.phase == null || args.current.phase === '');

  if (isPdi && args.pdiCandidateId) {
    return (
      eligible.find((row) => {
        const json = row.observationJson ?? {};
        return (
          row.phase === EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL &&
          json.candidateId === args.pdiCandidateId &&
          intervalKey(row.sourceIntervalStart) === currentStart &&
          intervalKey(row.sourceIntervalEnd) === currentEnd
        );
      }) ?? null
    );
  }

  if (isCanonicalWholeTrip) {
    return (
      eligible.find(
        (row) =>
          row.probeType === 'WHOLE_TRIP' &&
          (row.phase == null || row.phase === '') &&
          intervalKey(row.sourceIntervalStart) === currentStart &&
          intervalKey(row.sourceIntervalEnd) === currentEnd,
      ) ?? null
    );
  }

  return eligible.find((row) => row.probeId === args.current.probeId) ?? null;
}

export function priorBucketIdentitiesFromMaturationRecord(
  record: MaturationObservationRecord | null,
): string[] {
  return record?.observationJson?.uniqueBucketIdentities ?? [];
}

export function priorBucketValueSnapshotsFromMaturationRecord(
  record: MaturationObservationRecord | null,
): BucketValueSnapshots {
  return record?.observationJson?.bucketValueSnapshots ?? {};
}
