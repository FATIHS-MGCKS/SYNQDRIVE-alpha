import { computeHvSohGateAssessment } from './hv-soh-gate.policy';
import {
  TESLA_AUDIT_CAPABILITY_CHANGED_CROSS_SESSION_INPUT,
  TESLA_AUDIT_CONFLICTING_CROSS_SESSION_INPUT,
  TESLA_AUDIT_IMPLAUSIBLE_HIGH_CROSS_SESSION_INPUT,
  TESLA_AUDIT_INCOMPATIBLE_REFERENCE,
  TESLA_AUDIT_INSUFFICIENT_SESSIONS_CROSS_SESSION_INPUT,
  TESLA_AUDIT_M3_CONFLICT_CROSS_SESSION_INPUT,
  TESLA_AUDIT_SOH_GATE_CONTEXT,
  TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
  TESLA_AUDIT_STALE_CROSS_SESSION_INPUT,
  TESLA_AUDIT_UNSTABLE_CROSS_SESSION_INPUT,
  TESLA_AUDIT_UNVERIFIED_REFERENCE,
  TESLA_AUDIT_VERIFIED_REFERENCE,
  TESLA_AUDIT_VERIFIED_REFERENCE_KWH,
} from './hv-soh-gate.fixtures';
import {
  HV_SOH_GATE_AVAILABILITY,
  HV_SOH_GATE_GATE_REASONS,
  HV_SOH_GATE_MATURITY,
  HV_SOH_GATE_MODEL_VERSION,
} from './hv-soh-gate.types';

describe('hv-soh-gate.policy', () => {
  it('computes internal SOH from verified reference and stable cross-session assessment', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.sohGatePassed).toBe(true);
    expect(result.estimatedSohPercent).not.toBeNull();
    expect(result.estimatedSohPercent!).toBeGreaterThan(95);
    expect(result.estimatedSohPercent!).toBeLessThan(100);
    expect(result.sohAvailability).toBe(HV_SOH_GATE_AVAILABILITY.COMPUTED_INTERNAL);
    expect(result.maturity).toBe(HV_SOH_GATE_MATURITY.SHADOW);
    expect(result.publicationEligible).toBe(false);
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED,
    );
    expect(
      result.gateReasonCodes.filter(
        (code) => code !== HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED,
      ),
    ).toHaveLength(0);
  });

  it('marks SOH unavailable when no reference capacity exists', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: null,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.sohAvailability).toBe(HV_SOH_GATE_AVAILABILITY.UNAVAILABLE);
    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY,
    );
  });

  it('does not emit percent when reference is unverified', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_UNVERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.sohAvailability).toBe(HV_SOH_GATE_AVAILABILITY.GATED);
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED,
    );
  });

  it('rejects incompatible reference capacity type', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_INCOMPATIBLE_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.INCOMPATIBLE_CAPACITY_TYPE,
    );
  });

  it('rejects unstable cross-session capacity assessment', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_UNSTABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE,
    );
  });

  it('rejects insufficient qualified sessions', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_INSUFFICIENT_SESSIONS_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.INSUFFICIENT_SESSIONS,
    );
  });

  it('rejects stale cross-session assessment', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STALE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.ASSESSMENT_STALE,
    );
  });

  it('rejects when capability version changed since assessment', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_CAPABILITY_CHANGED_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.CAPABILITY_CHANGED,
    );
  });

  it('rejects strong method conflicts from cross-session spread', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_CONFLICTING_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE,
    );
  });

  it('rejects M3 method conflict sessions', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_M3_CONFLICT_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.METHOD_CONFLICT,
    );
  });

  it('rejects unapproved model version', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: {
        ...TESLA_AUDIT_SOH_GATE_CONTEXT,
        modelVersion: HV_SOH_GATE_MODEL_VERSION + 99,
      },
    });

    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.MODEL_VERSION_NOT_APPROVED,
    );
  });

  it('rejects out-of-band SOH without clamping', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_IMPLAUSIBLE_HIGH_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: TESLA_AUDIT_SOH_GATE_CONTEXT,
    });

    const rawPercent =
      (TESLA_AUDIT_IMPLAUSIBLE_HIGH_CROSS_SESSION_INPUT.estimatedUsableCapacityKwh! /
        TESLA_AUDIT_VERIFIED_REFERENCE_KWH) *
      100;

    expect(rawPercent).toBeGreaterThan(105);
    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.OUT_OF_PLAUSIBLE_BAND,
    );
  });

  it('records publication disabled while still computing internally', () => {
    const result = computeHvSohGateAssessment({
      crossSession: TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
      reference: TESLA_AUDIT_VERIFIED_REFERENCE,
      context: {
        ...TESLA_AUDIT_SOH_GATE_CONTEXT,
        sohPublicationEnabled: false,
      },
    });

    expect(result.sohPublicationEnabled).toBe(false);
    expect(result.publicationEligible).toBe(false);
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED,
    );
    expect(result.estimatedSohPercent).not.toBeNull();
  });
});
