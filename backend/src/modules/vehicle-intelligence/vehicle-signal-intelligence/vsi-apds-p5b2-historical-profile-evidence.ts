import {
  VsiApdsProfileEvidenceInterpretation,
  type VsiApdsProfileEvidenceInterpretation as VsiApdsProfileEvidenceInterpretationType,
} from './vsi-apds-profile-evidence-time';
import {
  VsiProfileRevisionAsOfAuthority,
  type VsiProfileRevisionAsOfResolutionV1,
} from './vsi-profile-revision-as-of.types';

export function revisionAsOfCommitVisibilityProven(limitations: readonly string[]): boolean {
  if (limitations.some((l) => l === 'PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN')) {
    return false;
  }
  return limitations.every(
    (l) =>
      l !== 'PERSISTENCE_RECORDED_AT_UPPER_BOUND_ONLY' &&
      l !== 'PERSISTENCE_RECORDED_AT_NOT_STRICTLY_BEFORE_DECISION',
  );
}

/**
 * Maps P5-H1 as-of authority to APDS readonly profile-evidence interpretation.
 * Never upgrades PRIOR_REVISION_FOUND to VERIFIED_DECISION_TIME_SNAPSHOT without commit proof.
 */
export function classifyProfileEvidenceFromRevisionAsOf(input: {
  resolution: VsiProfileRevisionAsOfResolutionV1;
  malformedProfileProjection: boolean;
}): {
  interpretation: VsiApdsProfileEvidenceInterpretationType;
  decisionTimeRetrospectiveAssessable: boolean;
  limitations: string[];
  historicalRevisionEvidence: {
    authority: VsiProfileRevisionAsOfAuthority;
    limitations: string[];
    commitVisibilityProven: boolean;
  };
} {
  const limitations = [...input.resolution.limitations];
  if (input.malformedProfileProjection) {
    limitations.push('MALFORMED_REVISION_PROFILE_PROJECTION');
  }

  const authority = input.resolution.authority;
  const commitVisibilityProven =
    authority === VsiProfileRevisionAsOfAuthority.VERIFIED_DECISION_TIME_EVIDENCE &&
    revisionAsOfCommitVisibilityProven(limitations);

  const historicalRevisionEvidence = {
    authority,
    limitations: [...limitations],
    commitVisibilityProven,
  };

  if (input.malformedProfileProjection) {
    return {
      interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
      decisionTimeRetrospectiveAssessable: false,
      limitations,
      historicalRevisionEvidence,
    };
  }

  switch (authority) {
    case VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION:
      return {
        interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
        decisionTimeRetrospectiveAssessable: false,
        limitations,
        historicalRevisionEvidence,
      };
    case VsiProfileRevisionAsOfAuthority.VERIFIED_DECISION_TIME_EVIDENCE:
      if (commitVisibilityProven) {
        return {
          interpretation: VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT,
          decisionTimeRetrospectiveAssessable: true,
          limitations,
          historicalRevisionEvidence,
        };
      }
      limitations.push('COMMIT_VISIBILITY_UNPROVEN_DOWNGRADE');
      return {
        interpretation: VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
        decisionTimeRetrospectiveAssessable: true,
        limitations,
        historicalRevisionEvidence: { ...historicalRevisionEvidence, commitVisibilityProven: false },
      };
    case VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND:
      return {
        interpretation: VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
        decisionTimeRetrospectiveAssessable: true,
        limitations,
        historicalRevisionEvidence,
      };
    case VsiProfileRevisionAsOfAuthority.STALE_AT_DECISION:
      return {
        interpretation: VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
        decisionTimeRetrospectiveAssessable: false,
        limitations,
        historicalRevisionEvidence,
      };
    case VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY:
    default:
      return {
        interpretation: VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
        decisionTimeRetrospectiveAssessable: false,
        limitations,
        historicalRevisionEvidence,
      };
  }
}
