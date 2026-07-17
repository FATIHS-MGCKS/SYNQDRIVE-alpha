import { computeHvCrossSessionAssessment } from './hv-capacity-cross-session.policy';
import {
  TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
  TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH,
  TESLA_AUDIT_CROSS_SESSION_M3_CONFLICT_INPUT,
  TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH,
  TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
} from './hv-capacity-cross-session.fixtures';
import {
  HV_CROSS_SESSION_CONFIDENCE,
  HV_CROSS_SESSION_GATE_REASONS,
  HV_CROSS_SESSION_MATURITY_SHADOW,
  HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS,
} from './hv-capacity-cross-session.types';

describe('hv-capacity-cross-session.policy', () => {
  it('computes shadow assessment from four stable Tesla sessions (~55.5 kWh)', () => {
    const result = computeHvCrossSessionAssessment({
      sessions: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result.shadowGatePassed).toBe(true);
    expect(result.gateReasonCodes).toHaveLength(0);
    expect(result.sessionCount).toBe(4);
    expect(result.observationCount).toBeGreaterThan(0);
    expect(result.estimatedUsableCapacityKwh).not.toBeNull();
    expect(result.crossSessionMedianKwh).toBeGreaterThanOrEqual(
      TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH -
        TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH,
    );
    expect(result.crossSessionMedianKwh).toBeLessThanOrEqual(
      TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH +
        TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH,
    );
    expect(result.maturity).toBe(HV_CROSS_SESSION_MATURITY_SHADOW);
    expect(result.publicationEligible).toBe(false);
    expect(result.sohEligible).toBe(false);
    expect(result.confidence).toBe(HV_CROSS_SESSION_CONFIDENCE.HIGH);
    expect(result.methodAgreement.sessionsWithM3Conflict).toBe(0);
    expect(result.spread.coefficientOfVariation).not.toBeNull();
  });

  it('rejects contradictory sessions with high cross-session spread', () => {
    const result = computeHvCrossSessionAssessment({
      sessions: TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result.shadowGatePassed).toBe(false);
    expect(result.gateReasonCodes).toContain(
      HV_CROSS_SESSION_GATE_REASONS.CROSS_SESSION_SPREAD_HIGH,
    );
    expect(result.estimatedUsableCapacityKwh).toBeNull();
    expect(result.confidence).toBe(HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT);
  });

  it('rejects sessions with M3 method conflict', () => {
    const result = computeHvCrossSessionAssessment({
      sessions: TESLA_AUDIT_CROSS_SESSION_M3_CONFLICT_INPUT,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result.shadowGatePassed).toBe(false);
    expect(result.gateReasonCodes).toContain(
      HV_CROSS_SESSION_GATE_REASONS.M3_METHOD_CONFLICT,
    );
    expect(result.methodAgreement.sessionsWithM3Conflict).toBe(1);
  });

  it('requires at least three qualified sessions', () => {
    const result = computeHvCrossSessionAssessment({
      sessions: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT.slice(0, 2),
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result.shadowGatePassed).toBe(false);
    expect(result.sessionCount).toBeLessThan(HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS);
    expect(result.gateReasonCodes).toContain(
      HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS,
    );
  });
});
