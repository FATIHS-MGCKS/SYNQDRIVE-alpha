import type { PhysicalRefuelIdentityClassification } from '../physical-refuel-identity.matcher';

/** F4 advisory native-overlap classification — F5 owns authoritative convergence. */
export type RawRefuelNativeOverlapAdvisoryClassification =
  | 'NO_NATIVE_SIBLINGS'
  | 'DISTINCT'
  | 'SAME'
  | 'INSUFFICIENT_EVIDENCE'
  | 'AMBIGUOUS_MULTIPLE_SAME';

export interface RawRefuelNativeOverlapSiblingAssessment {
  nativeEventId: string;
  classification: PhysicalRefuelIdentityClassification;
  reason: string;
}

export interface RawRefuelNativeOverlapAdvisoryResult {
  advisoryClassification: RawRefuelNativeOverlapAdvisoryClassification;
  siblingAssessments: RawRefuelNativeOverlapSiblingAssessment[];
  sameNativeEventIds: string[];
  distinctNativeEventIds: string[];
  insufficientNativeEventIds: string[];
  detail: string;
}
