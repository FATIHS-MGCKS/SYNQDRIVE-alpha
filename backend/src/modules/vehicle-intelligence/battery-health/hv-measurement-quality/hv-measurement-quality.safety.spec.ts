import {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import { computeHvSohGateAssessment } from '../hv-capacity-shadow/hv-soh-gate.policy';
import { HV_SOH_GATE_GATE_REASONS } from '../hv-capacity-shadow/hv-soh-gate.types';
import {
  mapBatteryAssessmentToCrossSessionEvidence,
  mapPersistedCrossSessionToSohGateInput,
} from './hv-measurement-quality.cross-session';
import { evaluateHvMeasurementQualitySession, resolveQ4CohortSessionIds } from './hv-measurement-quality.policy';
import { qualifiedPartialSession } from './hv-measurement-quality.policy.spec-helpers';

describe('hv-measurement-quality safety', () => {
  it('does not assign Q4 without persisted cross-session gate pass', () => {
    const m3Pass = evaluateHvMeasurementQualitySession(
      qualifiedPartialSession({ sessionId: 'a' }),
      new Set(),
    );
    expect(m3Pass.m3GateEligible).toBe(true);
    const cohort = resolveQ4CohortSessionIds([m3Pass], null);
    expect(cohort.size).toBe(0);
    const withFailedPersisted = resolveQ4CohortSessionIds([m3Pass], {
      shadowGatePassed: false,
      sessionIds: ['a'],
    });
    expect(withFailedPersisted.size).toBe(0);
  });

  it('assigns Q4 only when persisted cross-session passed and session is listed', () => {
    const row = qualifiedPartialSession({ sessionId: 'a' });
    const cohort = resolveQ4CohortSessionIds(
      [evaluateHvMeasurementQualitySession(row, new Set())],
      { shadowGatePassed: true, sessionIds: ['a', 'b', 'c'] },
    );
    expect(cohort.has('a')).toBe(true);
    const q4 = evaluateHvMeasurementQualitySession(row, cohort);
    expect(q4.qualityLevel).toBe('Q4');
  });

  it('SOH gate stays blocked without persisted cross-session evidence', () => {
    const result = computeHvSohGateAssessment({
      crossSession: null,
      reference: {
        id: 'ref-1',
        capacityKwh: 57,
        capacityType: BatteryReferenceCapacityType.USABLE,
        verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
      },
      context: {
        vehicleId: 'v1',
        modelVersion: 1,
        currentCapabilityVersion: 1,
        sohPublicationEnabled: false,
        now: new Date(),
      },
    });
    expect(result.sohGatePassed).toBe(false);
    expect(result.gateReasonCodes).toContain(
      HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE,
    );
  });

  it('does not fabricate SOH gate pass from synthetic shadowGatePassed without persisted row', () => {
    const evidence = mapBatteryAssessmentToCrossSessionEvidence(null);
    expect(evidence).toBeNull();
    const input = mapPersistedCrossSessionToSohGateInput(evidence);
    expect(input).toBeNull();
  });

  it('blocks SOH when reference is missing (no public SOH)', () => {
    const result = computeHvSohGateAssessment({
      crossSession: mapPersistedCrossSessionToSohGateInput({
        shadowGatePassed: true,
        sessionIds: ['a', 'b', 'c'],
        sessionCount: 3,
        estimatedUsableCapacityKwh: 55,
        computedAt: new Date().toISOString(),
        gateReasonCodes: [],
        methodAgreement: { sessionsWithM3Conflict: 0 },
        confidence: 'HIGH',
        idempotencyKey: 'k',
        modelVersion: 1,
        capabilityVersion: 1,
      }),
      reference: null,
      context: {
        vehicleId: 'v1',
        modelVersion: 1,
        currentCapabilityVersion: 1,
        sohPublicationEnabled: false,
        now: new Date(),
      },
    });
    expect(result.estimatedSohPercent).toBeNull();
    expect(result.gateReasonCodes).toContain(HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY);
  });

  it('old Q1 plus new Q3 yields vehicle quality level Q3', () => {
    const q1 = evaluateHvMeasurementQualitySession(
      qualifiedPartialSession({
        sessionId: 'old',
        measurementQuality: 'CONTAMINATED_BY_CHARGING' as never,
      }),
      new Set(),
    );
    const q3 = evaluateHvMeasurementQualitySession(
      qualifiedPartialSession({ sessionId: 'new' }),
      new Set(),
    );
    expect(q1.qualityLevel).toBe('Q1');
    expect(q3.qualityLevel).toBe('Q3');
  });
});
