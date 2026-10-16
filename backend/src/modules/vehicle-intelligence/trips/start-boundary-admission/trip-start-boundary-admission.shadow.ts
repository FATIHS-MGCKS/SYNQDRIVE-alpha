import { refineTripStartBoundary } from '../trip-evidence.helpers';
import { resolveLegacySegmentStartBoundary } from './trip-start-boundary-admission.legacy';
import { resolveEvidenceBackedStartBoundary } from './trip-start-boundary-admission.resolver';
import type { ResolveEvidenceBackedStartBoundaryInput } from './trip-start-boundary-admission.types';
import type { StartBoundaryAdmissionShadowComparison } from './trip-start-boundary-admission.types';

/**
 * Offline shadow — does not mutate trips or call production writers.
 */
export function compareStartBoundaryAdmissionShadow(
  input: ResolveEvidenceBackedStartBoundaryInput,
): StartBoundaryAdmissionShadowComparison {
  const proposed = resolveEvidenceBackedStartBoundary(input);
  const legacySegment = resolveLegacySegmentStartBoundary({
    segments: input.segments,
    candidateStartAt: input.candidateStartAt,
    confirmedAt: input.confirmedAt,
  });

  const legacyRefined = refineTripStartBoundary(
    input.candidateStartAt,
    input.corePoints,
    input.routePoints,
    input.profile,
  );

  const legacyCanonicalStartAt = legacySegment
    ? legacySegment.startAt
    : legacyRefined.startAt;

  return {
    legacyCanonicalStartAt,
    proposedCanonicalStartAt: proposed.canonicalStartAt,
    deltaMs:
      proposed.canonicalStartAt.getTime() - legacyCanonicalStartAt.getTime(),
    decision: proposed.decision,
    evidenceSources: proposed.provenance.movementEvidenceSources,
    uncertainty: proposed.uncertainty,
    providerMechanism: input.providerMechanism,
  };
}
