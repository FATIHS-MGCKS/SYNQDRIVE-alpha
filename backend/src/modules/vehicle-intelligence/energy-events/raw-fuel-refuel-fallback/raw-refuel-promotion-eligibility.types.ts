/** Orthogonal to F2 RawRefuelCandidate lifecycle — F5 authorization lives here, not in lifecycle enum. */
export type RawRefuelPromotionEligibilityStatus =
  | 'ELIGIBLE_FOR_F5_REVIEW'
  | 'NOT_READY'
  | 'BLOCKED_CAPABILITY'
  | 'BLOCKED_DETECTION_ADMISSIBILITY'
  | 'BLOCKED_NATIVE_OVERLAP_REVIEW'
  | 'BLOCKED_PROMOTION_TRUST'
  | 'BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED'
  | 'AMBIGUOUS'
  | 'ERROR_FAIL_CLOSED';

export interface RawRefuelPromotionEligibilityResult {
  status: RawRefuelPromotionEligibilityStatus;
  /** True when candidate is physically ready but promotion execution remains blocked. */
  blockedPendingF5: boolean;
  detail: string;
}
