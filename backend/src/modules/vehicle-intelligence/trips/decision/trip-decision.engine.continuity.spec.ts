import type { DetectorFinding } from '../detectors/detector.interfaces';
import { TripDecisionEngine } from './trip-decision.engine';

describe('TripDecisionEngine.evaluateContinuity (R12-AUD-003 fail-closed)', () => {
  const engine = new TripDecisionEngine({} as never);

  it('A — missing ContinuityAssessmentDetector finding → ACTIVE without end fields', () => {
    const decision = engine.evaluateContinuity([]);
    expect(decision.verdict).toBe('ACTIVE');
    expect(decision.endMode).toBeUndefined();
    expect(decision.endConfidence).toBeUndefined();
    expect(decision.reason).toBe('continuity_finding_missing_fail_closed');
  });

  it('B — INCONCLUSIVE continuity finding → ACTIVE, not POSSIBLE_END', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { continuityVerdict: 'POSSIBLE_END' },
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('ACTIVE');
    expect(decision.endMode).toBeUndefined();
    expect(decision.endConfidence).toBeUndefined();
    expect(decision.reason).toBe('continuity_finding_inconclusive_fail_closed');
  });

  it('C — explicit NOT_TRIGGERED + continuityVerdict=POSSIBLE_END → POSSIBLE_END', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'NOT_TRIGGERED',
        confidence: 'MEDIUM',
        evidence: {
          continuityVerdict: 'POSSIBLE_END',
          endMode: 'COMPOSITE_INACTIVITY',
        },
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('POSSIBLE_END');
    expect(decision.endMode).toBe('COMPOSITE_INACTIVITY');
    expect(decision.endConfidence).toBe('MEDIUM');
  });

  it('D — TRIGGERED ACTIVE → ACTIVE unchanged', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'TRIGGERED',
        confidence: 'HIGH',
        evidence: { continuityVerdict: 'ACTIVE' },
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('ACTIVE');
    expect(decision.endMode).toBeUndefined();
  });

  it('E — TRIGGERED IDLE → IDLE unchanged', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'TRIGGERED',
        confidence: 'MEDIUM',
        evidence: { continuityVerdict: 'IDLE' },
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('IDLE');
  });

  it('F — legacy evidence.verdict alone must not grant POSSIBLE_END', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'NOT_TRIGGERED',
        confidence: 'MEDIUM',
        evidence: { verdict: 'POSSIBLE_END' },
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('ACTIVE');
    expect(decision.endMode).toBeUndefined();
    expect(decision.endConfidence).toBeUndefined();
    expect(decision.reason).toBe('continuity_finding_malformed_fail_closed');
  });

  it('G — NOT_TRIGGERED with empty evidence must not grant end authority', () => {
    const findings: DetectorFinding[] = [
      {
        detectorName: 'ContinuityAssessmentDetector',
        verdict: 'NOT_TRIGGERED',
        confidence: 'LOW',
        evidence: {},
        timestamp: new Date(),
      },
    ];
    const decision = engine.evaluateContinuity(findings);
    expect(decision.verdict).toBe('ACTIVE');
    expect(decision.endMode).toBeUndefined();
    expect(decision.endConfidence).toBeUndefined();
    expect(decision.reason).toBe('continuity_finding_malformed_fail_closed');
  });
});
