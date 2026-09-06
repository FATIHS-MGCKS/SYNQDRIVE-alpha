import {
  classifyChangePointEndFinding,
  isCompletedCusumValidationCycle,
} from './trip-end-validation-classifier';
import type { DetectorFinding } from './detectors/detector.interfaces';

describe('trip-end-validation-classifier (R5A)', () => {
  it('classifies production registry error sentinel as DETECTOR_EXECUTION_FAILURE', () => {
    const finding: DetectorFinding = {
      detectorName: 'ChangePointEndDetector',
      verdict: 'INCONCLUSIVE',
      confidence: 'LOW',
      evidence: { error: 'Detector ChangePointEndDetector timed out' },
      timestamp: new Date(),
    };
    expect(classifyChangePointEndFinding(finding)).toBe('DETECTOR_EXECUTION_FAILURE');
    expect(isCompletedCusumValidationCycle(finding)).toBe(false);
  });

  it('classifies missing finding as DETECTOR_MISSING', () => {
    expect(classifyChangePointEndFinding(undefined)).toBe('DETECTOR_MISSING');
  });

  it('classifies analytical INCONCLUSIVE without error as VALID_DECISION', () => {
    const finding: DetectorFinding = {
      detectorName: 'ChangePointEndDetector',
      verdict: 'INCONCLUSIVE',
      confidence: 'LOW',
      evidence: { reason: 'insufficient_points', pointCount: 2 },
      timestamp: new Date(),
    };
    expect(classifyChangePointEndFinding(finding)).toBe('VALID_DECISION');
    expect(isCompletedCusumValidationCycle(finding)).toBe(true);
  });
});
