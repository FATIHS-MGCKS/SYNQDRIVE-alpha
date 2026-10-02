import type { CandidateDetectionVersionCompatibility } from './raw-refuel-candidate-cross-version-compatibility.authority';

/** Authoritative post-fuel level semantics for R2 matcher bridge. */
export type RawRefuelPostFuelAuthority = 'PEAK_INSTANTANEOUS' | 'SETTLED_MEDIAN';

export type PostFuelAuthorityTransitionClassification =
  | 'AUTHORIZED_AUTHORITY_SHIFT'
  | 'SAME_AUTHORITY'
  | 'UNAUTHORIZED_AUTHORITY_SHIFT'
  | 'UNKNOWN_AUTHORITY';

export function classifyPostFuelAuthorityTransition(input: {
  observationAuthority: RawRefuelPostFuelAuthority | null | undefined;
  candidateAuthority: RawRefuelPostFuelAuthority | null | undefined;
  versionCompatibility: CandidateDetectionVersionCompatibility;
}): PostFuelAuthorityTransitionClassification {
  const obs = input.observationAuthority ?? null;
  const cand = input.candidateAuthority ?? null;

  if (obs == null || cand == null) {
    return 'UNKNOWN_AUTHORITY';
  }

  if (obs === cand) {
    return 'SAME_AUTHORITY';
  }

  if (
    input.versionCompatibility === 'AUTHORIZED_CROSS_VERSION' &&
    cand === 'PEAK_INSTANTANEOUS' &&
    obs === 'SETTLED_MEDIAN'
  ) {
    return 'AUTHORIZED_AUTHORITY_SHIFT';
  }

  return 'UNAUTHORIZED_AUTHORITY_SHIFT';
}
