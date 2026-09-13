import type { RawRefuelCandidateLifecycleState } from '@prisma/client';

/** Explicit F4 runtime readiness reason codes — orthogonal to promotion eligibility. */
export type RawRefuelCandidateReadinessReasonCode =
  | 'READY'
  | 'INSUFFICIENT_EVIDENCE'
  | 'POST_PLATEAU_NOT_FINAL'
  | 'CANDIDATE_SETTLING'
  | 'CANDIDATE_OBSERVED'
  | 'AMBIGUOUS_IDENTITY'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'CAPABILITY_UNKNOWN'
  | 'DETECTION_NOT_ADMISSIBLE'
  | 'INVALID_EVIDENCE'
  | 'TERMINAL_REJECTED'
  | 'TERMINAL_PROMOTED'
  | 'MISSING_IDENTITY_KEY';

export interface RawRefuelCandidateReadinessResult {
  ready: boolean;
  reasonCode: RawRefuelCandidateReadinessReasonCode;
  lifecycleState: RawRefuelCandidateLifecycleState;
  /** Human-readable diagnostic — not a user-facing string. */
  detail: string;
}
