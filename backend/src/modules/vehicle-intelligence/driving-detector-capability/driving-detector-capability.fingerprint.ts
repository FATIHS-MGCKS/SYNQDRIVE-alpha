import { createHash } from 'crypto';
import type { DrivingDetectorCapabilityResult } from './driving-detector-capability.types';

/** Stable fingerprint so jobs can detect capability-driven detector changes. */
export function fingerprintDetectorCapabilities(
  result: DrivingDetectorCapabilityResult,
): string {
  const parts = result.detectors
    .map((detector) => `${detector.detectorKey}:${detector.status}`)
    .sort();
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
