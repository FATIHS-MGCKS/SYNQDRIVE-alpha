import { classifyHmObservationDivergence } from './hm-only-canonical-observation-divergence';

describe('classifyHmObservationDivergence truth table', () => {
  it('NO_DIVERGENCE when legacy and canonical agree (eligible + pass)', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_ADMISSIBLE',
      canonicalAdmission: 'CANONICAL_ADMISSION_ELIGIBLE',
      canonicalReadiness: 'CANONICAL_READINESS_PASS',
      evaluationCompleteness: 'COMPLETE',
    });
    expect(r.classification).toBe('NO_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(false);
  });

  it('service combo — admission blocked, readiness NOT_EVALUABLE, PARTIAL', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_ADMISSIBLE',
      canonicalAdmission: 'CANONICAL_ADMISSION_BLOCKED',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'PARTIAL',
    });
    expect(r.classification).toBe('ADMISSION_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(true);
  });

  it('service combo — idempotent replay with NOT_EVALUABLE readiness', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_BLOCKED',
      canonicalAdmission: 'CANONICAL_IDEMPOTENT_REPLAY',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'NOT_EVALUABLE',
    });
    expect(r.classification).toBe('CANONICAL_IDEMPOTENT_REPLAY');
    expect(r.divergenceLegacyOnly).toBe(false);
  });

  it('service combo — legacy reconciliation with NOT_EVALUABLE readiness', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_BLOCKED',
      canonicalAdmission: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'NOT_EVALUABLE',
    });
    expect(r.classification).toBe('LEGACY_RECONCILIATION_REQUIRED');
  });

  it('COMPARISON_NOT_EVALUABLE on timeout / admission not evaluable', () => {
    expect(
      classifyHmObservationDivergence({
        legacyAdmission: 'LEGACY_NOT_EVALUABLE',
        canonicalAdmission: 'CANONICAL_ADMISSION_NOT_EVALUABLE',
        canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
        evaluationCompleteness: 'NOT_EVALUABLE',
      }).classification,
    ).toBe('COMPARISON_NOT_EVALUABLE');
  });

  it('TECHNICAL_READINESS_DIVERGENCE when admission eligible but readiness blocked', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_ADMISSIBLE',
      canonicalAdmission: 'CANONICAL_ADMISSION_ELIGIBLE',
      canonicalReadiness: 'CANONICAL_READINESS_BLOCKED',
      evaluationCompleteness: 'COMPLETE',
    });
    expect(r.classification).toBe('TECHNICAL_READINESS_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(true);
  });

  it('NO_DIVERGENCE when both legacy and canonical admission blocked', () => {
    const r = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_BLOCKED',
      canonicalAdmission: 'CANONICAL_ADMISSION_BLOCKED',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'PARTIAL',
    });
    expect(r.classification).toBe('NO_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(false);
  });
});