import { RFRF_RISE_DETECTION_VERSION } from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

/** Static cross-version compatibility registry authority (R1 foundation only). */
export const RFRF_CANDIDATE_CROSS_VERSION_COMPATIBILITY_V1 =
  'rfrf-candidate-cross-version-compatibility-v1' as const;

/**
 * Planned settled-post observation detection version — not active in runtime R1.
 * Explicit registry entry only; does not change RFRF_RISE_DETECTION_VERSION export.
 */
export const RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION = 'rfrf-rise-v2' as const;

export type CandidateDetectionVersionCompatibility =
  | 'SAME_VERSION'
  | 'AUTHORIZED_CROSS_VERSION'
  | 'UNAUTHORIZED_VERSION_PAIR';

function normalizeDetectionVersion(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Directed compatible pairs (observation → stored candidate). */
const AUTHORIZED_CROSS_VERSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION, RFRF_RISE_DETECTION_VERSION],
] as const;

export function classifyCandidateDetectionVersionCompatibility(input: {
  observationDetectionVersion: string | null | undefined;
  candidateDetectionVersion: string | null | undefined;
}): CandidateDetectionVersionCompatibility {
  const observation = normalizeDetectionVersion(input.observationDetectionVersion);
  const candidate = normalizeDetectionVersion(input.candidateDetectionVersion);

  if (observation == null || candidate == null) {
    return 'UNAUTHORIZED_VERSION_PAIR';
  }

  if (observation === candidate) {
    return 'SAME_VERSION';
  }

  for (const [obsVersion, candVersion] of AUTHORIZED_CROSS_VERSION_PAIRS) {
    if (observation === obsVersion && candidate === candVersion) {
      return 'AUTHORIZED_CROSS_VERSION';
    }
  }

  return 'UNAUTHORIZED_VERSION_PAIR';
}

export function listAuthorizedCrossVersionPairsV1(): ReadonlyArray<{
  observationDetectionVersion: string;
  candidateDetectionVersion: string;
}> {
  return AUTHORIZED_CROSS_VERSION_PAIRS.map(([observationDetectionVersion, candidateDetectionVersion]) => ({
    observationDetectionVersion,
    candidateDetectionVersion,
  }));
}
