import { classifyHmObservationDivergence } from './hm-only-canonical-observation-divergence';

describe('classifyHmObservationDivergence truth table', () => {
  const base = {
    legacyAdmission: 'LEGACY_ADMISSIBLE' as const,
    canonicalAdmission: 'CANONICAL_ADMISSION_ELIGIBLE' as const,
    canonicalReadiness: 'CANONICAL_READINESS_PASS' as const,
    evaluationCompleteness: 'COMPLETE' as const,
  };

  it('NO_DIVERGENCE when legacy and canonical agree', () => {
    const r = classifyHmObservationDivergence(base);
    expect(r.classification).toBe('NO_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(false);
  });

  it('COMPARISON_NOT_EVALUABLE on timeout / not evaluable paths', () => {
    expect(
      classifyHmObservationDivergence({
        ...base,
        legacyAdmission: 'LEGACY_NOT_EVALUABLE',
      }).classification,
    ).toBe('COMPARISON_NOT_EVALUABLE');
    expect(
      classifyHmObservationDivergence({
        ...base,
        evaluationCompleteness: 'NOT_EVALUABLE',
      }).divergenceLegacyOnly,
    ).toBe(false);
  });

  it('ADMISSION_DIVERGENCE', () => {
    const r = classifyHmObservationDivergence({
      ...base,
      canonicalAdmission: 'CANONICAL_ADMISSION_BLOCKED',
    });
    expect(r.classification).toBe('ADMISSION_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(true);
  });

  it('TECHNICAL_READINESS_DIVERGENCE', () => {
    const r = classifyHmObservationDivergence({
      ...base,
      canonicalReadiness: 'CANONICAL_READINESS_BLOCKED',
    });
    expect(r.classification).toBe('TECHNICAL_READINESS_DIVERGENCE');
    expect(r.divergenceLegacyOnly).toBe(true);
  });

  it('CANONICAL_IDEMPOTENT_REPLAY', () => {
    expect(
      classifyHmObservationDivergence({
        ...base,
        canonicalAdmission: 'CANONICAL_IDEMPOTENT_REPLAY',
      }).classification,
    ).toBe('CANONICAL_IDEMPOTENT_REPLAY');
  });

  it('LEGACY_RECONCILIATION_REQUIRED', () => {
    expect(
      classifyHmObservationDivergence({
        ...base,
        canonicalAdmission: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
      }).classification,
    ).toBe('LEGACY_RECONCILIATION_REQUIRED');
  });
});