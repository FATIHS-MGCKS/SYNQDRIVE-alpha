import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';

export const VsiProfileRevisionAsOfAuthority = {
  NO_PRIOR_REVISION: 'NO_PRIOR_REVISION',
  PRIOR_REVISION_FOUND: 'PRIOR_REVISION_FOUND',
  VERIFIED_DECISION_TIME_EVIDENCE: 'VERIFIED_DECISION_TIME_EVIDENCE',
  STALE_AT_DECISION: 'STALE_AT_DECISION',
  UNPROVEN_TEMPORAL_AUTHORITY: 'UNPROVEN_TEMPORAL_AUTHORITY',
} as const;

export type VsiProfileRevisionAsOfAuthority =
  (typeof VsiProfileRevisionAsOfAuthority)[keyof typeof VsiProfileRevisionAsOfAuthority];

export const VsiProfileRevisionAsOfQueryCompleteness = {
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE',
} as const;

export type VsiProfileRevisionAsOfQueryCompleteness =
  (typeof VsiProfileRevisionAsOfQueryCompleteness)[keyof typeof VsiProfileRevisionAsOfQueryCompleteness];

/**
 * Evidence from the bounded decision-time-aware repository query.
 * When `completeness` is INCOMPLETE, callers must fail closed (no NO_PRIOR_REVISION).
 */
export type VsiProfileRevisionAsOfQueryEvidenceV1 = {
  completeness: VsiProfileRevisionAsOfQueryCompleteness;
  /** Exact count of revisions with recorded_at/evaluated_at <= decisionAt (null when incomplete). */
  eligibleRevisionCountExact: number | null;
  /** Highest profile_revision among temporally eligible rows, if known. */
  maxEligibleProfileRevision: number | null;
};

export type VsiProfileRevisionAsOfResolutionV1 = {
  authority: VsiProfileRevisionAsOfAuthority;
  selectedRevision: VsiProfileRevisionHistoryRowV1 | null;
  limitations: string[];
  queryEvidence: VsiProfileRevisionAsOfQueryEvidenceV1;
};
