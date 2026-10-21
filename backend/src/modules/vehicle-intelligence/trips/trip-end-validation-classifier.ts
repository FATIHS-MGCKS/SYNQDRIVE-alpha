import type { DetectorFinding } from './detectors/detector.interfaces';

export type EndValidationFindingOutcome =
  | 'VALID_DECISION'
  | 'DETECTOR_EXECUTION_FAILURE'
  | 'DETECTOR_MISSING';

/**
 * END_VALIDATION contract classifier for ChangePointEndDetector findings.
 * Production DetectorRegistry catches throws/timeouts and returns INCONCLUSIVE
 * with evidence.error — that is NOT a completed CUSUM cycle.
 */
export function classifyChangePointEndFinding(
  finding: DetectorFinding | undefined,
): EndValidationFindingOutcome {
  if (!finding) return 'DETECTOR_MISSING';
  const error = finding.evidence?.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return 'DETECTOR_EXECUTION_FAILURE';
  }
  return 'VALID_DECISION';
}

export function isCompletedCusumValidationCycle(
  finding: DetectorFinding | undefined,
): boolean {
  return classifyChangePointEndFinding(finding) === 'VALID_DECISION';
}
