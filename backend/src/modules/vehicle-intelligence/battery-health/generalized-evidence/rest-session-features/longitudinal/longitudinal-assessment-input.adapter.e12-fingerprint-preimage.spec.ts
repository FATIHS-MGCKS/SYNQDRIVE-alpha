import {
  buildLongitudinalAssessmentInputV1,
  computeM3_3E_ConsumptionInputFingerprintV1,
} from './longitudinal-assessment-input.adapter';
import { M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL } from './longitudinal-assessment-input.golden';
import type { M3_3E_AssessmentGradeObservationV1 } from './longitudinal-assessment-input.types';
import { buildE1GoldenConsumptionFixture } from './longitudinal-assessment-input.test-helpers';

function okInput(fixture: Parameters<typeof buildLongitudinalAssessmentInputV1>[0]) {
  const out = buildLongitudinalAssessmentInputV1(fixture);
  if (out.status !== 'OK') {
    throw new Error(`expected OK got ${JSON.stringify(out)}`);
  }
  return out.input;
}

function cloneObservation(
  obs: M3_3E_AssessmentGradeObservationV1,
): M3_3E_AssessmentGradeObservationV1 {
  return {
    ...obs,
    versionTuple: { ...obs.versionTuple },
    features: { ...obs.features },
    chargeContextCompleteness: [...obs.chargeContextCompleteness],
    integrityContext: { ...obs.integrityContext },
  };
}

function goldenFingerprintBaseline() {
  const input = okInput(buildE1GoldenConsumptionFixture());
  const obs0 = cloneObservation(input.assessmentGradeObservations[0]);
  const obs1 = cloneObservation(input.assessmentGradeObservations[1]);
  const params = {
    organizationId: input.identity.organizationId,
    vehicleId: input.identity.vehicleId,
    canonicalProfileFingerprint: input.identity.canonicalProfileFingerprint,
    longitudinalProfileContractVersion: input.identity.longitudinalProfileContractVersion,
    profilePolicyVersion: input.identity.profilePolicyVersion,
    integrityInspectionContractVersion: input.identity.integrityInspectionContractVersion,
    assessmentGradeObservations: [obs0, obs1],
  };
  const baselineFingerprint = computeM3_3E_ConsumptionInputFingerprintV1(params);
  return { params, baselineFingerprint, obs0, obs1 };
}

function fpWithObservations(
  params: ReturnType<typeof goldenFingerprintBaseline>['params'],
  observations: M3_3E_AssessmentGradeObservationV1[],
): string {
  return computeM3_3E_ConsumptionInputFingerprintV1({
    ...params,
    assessmentGradeObservations: observations,
  });
}

describe('M3.3E E1.2 — isolated consumption fingerprint preimage', () => {
  it('golden vector unchanged', () => {
    const { baselineFingerprint } = goldenFingerprintBaseline();
    expect(baselineFingerprint).toBe(M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL);
  });

  it('observation array order is canonicalized (reverse input → same fingerprint)', () => {
    const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
    const reversed = fpWithObservations(params, [obs1, obs0]);
    expect(reversed).toBe(baselineFingerprint);
  });

  describe('field sensitivity (single-field mutations, fixed canonicalProfileFingerprint)', () => {
    it('A — eligible observation set: remove one observation', () => {
      const { params, baselineFingerprint, obs0 } = goldenFingerprintBaseline();
      expect(fpWithObservations(params, [obs0])).not.toBe(baselineFingerprint);
    });

    it('B — feature scalar: minimumRestVoltageMv only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.features = { ...mutated.features, minimumRestVoltageMv: 99999 };
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('C — temperatureC only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.temperatureC = 21.5;
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('D — temperatureSource only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.temperatureSource = 'TRIP_EXTERIOR';
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('E — chargeOpportunityClass (top-level + features coherent)', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.chargeOpportunityClass = 'SUFFICIENT';
      mutated.features = { ...mutated.features, chargeOpportunityClass: 'SUFFICIENT' };
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('F — chargeContextCompleteness only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.chargeContextCompleteness = ['MISSING_TEMPERATURE'];
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('G — inputDigest only (anchorAt unchanged)', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.inputDigest = '0000000000000000000000000000000000000000000000000000000000000001';
      expect(mutated.anchorAt).toBe(obs0.anchorAt);
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('H — versionTuple: featureModelVersion only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.versionTuple = {
        ...mutated.versionTuple,
        featureModelVersion: 'fm-isolated-mutation-only',
      };
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('I — digestVerificationScope only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.integrityContext = {
        ...mutated.integrityContext,
        digestVerificationScope: 'BOUNDED_LATEST_WINDOW',
      };
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });

    it('J — anchorAt only', () => {
      const { params, baselineFingerprint, obs0, obs1 } = goldenFingerprintBaseline();
      const mutated = cloneObservation(obs0);
      mutated.anchorAt = '2026-01-01T10:00:01.000Z';
      expect(fpWithObservations(params, [mutated, obs1])).not.toBe(baselineFingerprint);
    });
  });
});
