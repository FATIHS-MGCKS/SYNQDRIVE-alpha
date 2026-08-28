import type { ManualReviewEntry } from './energy-events-recovery.types';
import {
  durationBucket,
  fuelDeltaBucket,
  odometerDeltaBucket,
} from './energy-events-recovery-artifact-sanitize';

/**
 * Privacy-safe bucket signature for sanitized reporting and aggregate grouping.
 * NOT unique and NOT authoritative for applying human-reviewed dispositions.
 */
export function buildManualReviewBucketFingerprint(
  entry: ManualReviewEntry,
): string {
  const reasons = [...entry.plausibilityReasons].sort();
  return [
    entry.mechanism,
    entry.startTime.slice(0, 7),
    durationBucket(entry.durationSeconds),
    odometerDeltaBucket(entry.odometerDeltaKm) ?? 'null',
    fuelDeltaBucket(entry.fuelDeltaLiters) ?? 'null',
    entry.confidence,
    ...reasons,
  ].join('|');
}
