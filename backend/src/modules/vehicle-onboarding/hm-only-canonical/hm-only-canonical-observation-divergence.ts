import type {
  HmCanonicalAdmissionVerdict,
  HmCanonicalReadinessVerdict,
  HmEvaluationCompleteness,
  HmLegacyAdmissionVerdict,
  HmObservationDivergenceClassification,
} from './hm-only-canonical-readiness-observation.types';

export function classifyHmObservationDivergence(input: {
  legacyAdmission: HmLegacyAdmissionVerdict;
  canonicalAdmission: HmCanonicalAdmissionVerdict;
  canonicalReadiness: HmCanonicalReadinessVerdict;
  evaluationCompleteness: HmEvaluationCompleteness;
}): { classification: HmObservationDivergenceClassification; divergenceLegacyOnly: boolean } {
  if (input.canonicalAdmission === 'CANONICAL_IDEMPOTENT_REPLAY') {
    return { classification: 'CANONICAL_IDEMPOTENT_REPLAY', divergenceLegacyOnly: false };
  }

  if (input.canonicalAdmission === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED') {
    return { classification: 'LEGACY_RECONCILIATION_REQUIRED', divergenceLegacyOnly: false };
  }

  if (input.canonicalAdmission === 'CANONICAL_ADMISSION_BLOCKED') {
    const legacyAdmits = input.legacyAdmission === 'LEGACY_ADMISSIBLE';
    if (legacyAdmits) {
      return { classification: 'ADMISSION_DIVERGENCE', divergenceLegacyOnly: true };
    }
    return { classification: 'NO_DIVERGENCE', divergenceLegacyOnly: false };
  }

  const comparisonIndeterminate =
    input.canonicalAdmission === 'CANONICAL_ADMISSION_NOT_EVALUABLE' ||
    input.legacyAdmission === 'LEGACY_NOT_EVALUABLE' ||
    input.evaluationCompleteness === 'NOT_EVALUABLE';

  if (comparisonIndeterminate) {
    return { classification: 'COMPARISON_NOT_EVALUABLE', divergenceLegacyOnly: false };
  }

  const legacyAdmits = input.legacyAdmission === 'LEGACY_ADMISSIBLE';
  const admissionEligible = input.canonicalAdmission === 'CANONICAL_ADMISSION_ELIGIBLE';
  const readinessPass = input.canonicalReadiness === 'CANONICAL_READINESS_PASS';

  if (legacyAdmits && admissionEligible && !readinessPass) {
    return { classification: 'TECHNICAL_READINESS_DIVERGENCE', divergenceLegacyOnly: true };
  }

  return { classification: 'NO_DIVERGENCE', divergenceLegacyOnly: false };
}