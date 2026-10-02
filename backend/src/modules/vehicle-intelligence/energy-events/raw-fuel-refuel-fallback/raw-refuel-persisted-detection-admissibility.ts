import type { RawRefuelCandidate } from '@prisma/client';
import type { RawFuelAbsoluteDetectionAdmissibility } from './raw-fuel-refuel-fallback.types';

/** Authoritative detection admissibility from persisted candidate qualityMeta only. */
export function readPersistedAbsoluteDetectionAdmissibility(
  candidate: Pick<RawRefuelCandidate, 'qualityMeta'>,
): RawFuelAbsoluteDetectionAdmissibility {
  const qualityMeta = candidate.qualityMeta;
  if (!qualityMeta || typeof qualityMeta !== 'object' || Array.isArray(qualityMeta)) {
    return 'UNKNOWN';
  }
  const value = (qualityMeta as Record<string, unknown>).absoluteDetectionAdmissibility;
  if (value === 'ADMISSIBLE' || value === 'INADMISSIBLE' || value === 'UNKNOWN') {
    return value;
  }
  return 'UNKNOWN';
}
