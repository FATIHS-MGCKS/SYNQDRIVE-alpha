import type { RawRefuelNativeOverlapSiblingAssessment } from './raw-refuel-native-overlap.types';

/** Authoritative F5 pre-promotion convergence classification (G2 matcher semantics). */
export type RawRefuelNativeFallbackConvergenceClassification =
  | 'NO_NATIVE_SIBLINGS'
  | 'SAME_NATIVE'
  | 'DISTINCT_FROM_NATIVE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'AMBIGUOUS';

export interface RawRefuelNativeFallbackConvergenceEvaluation {
  classification: RawRefuelNativeFallbackConvergenceClassification;
  siblingAssessments: RawRefuelNativeOverlapSiblingAssessment[];
  sameNativeEventIds: string[];
  distinctNativeEventIds: string[];
  insufficientNativeEventIds: string[];
  authoritativeSameNativeEventId: string | null;
  detail: string;
  /** True when F5 would apply CONVERGED_NATIVE (classification SAME_NATIVE). */
  shouldConvergeToNative: boolean;
  /** True when F5 must fail closed (no convergence, no VEE). */
  failClosed: boolean;
}

export type RawRefuelConvergenceApplyStatus =
  | 'SKIPPED_NOT_AUTHORIZED'
  | 'SKIPPED_NOT_READY'
  | 'SKIPPED_NO_ACTION'
  | 'FAIL_CLOSED'
  | 'ALREADY_CONVERGED'
  | 'FAIL_CLOSED_TERMINAL_PROMOTED'
  | 'CONVERGED_NATIVE';

export interface RawRefuelConvergenceApplyResult {
  status: RawRefuelConvergenceApplyStatus;
  evaluation: RawRefuelNativeFallbackConvergenceEvaluation | null;
  candidateId: string;
  convergedNativeEventId: string | null;
  detail: string;
}
