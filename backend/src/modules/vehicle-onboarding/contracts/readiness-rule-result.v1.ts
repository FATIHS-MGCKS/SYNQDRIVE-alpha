import type { ReadinessInputClass } from '../readiness/readiness-input-classes';

export type ReadinessRuleStatus =
  | 'PASS'
  | 'FAIL'
  | 'REVIEW_REQUIRED'
  | 'DEFERRED'
  | 'UNKNOWN_ALLOWED'
  | 'NOT_APPLICABLE';

export interface ReadinessRuleResultV1 {
  ruleId: string;
  ruleVersion: string;
  inputClass: ReadinessInputClass;
  status: ReadinessRuleStatus;
  blocking: boolean;
  reasonCode: string;
  evidenceRefs: string[];
}
