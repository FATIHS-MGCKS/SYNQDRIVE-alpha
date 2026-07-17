import {
  buildActionIdempotencyKey,
  computeActionPlanFingerprint,
} from './document-action-plan.types';

describe('document-action-plan.types', () => {
  it('computes stable fingerprints for identical plan input', () => {
    const input = {
      planVersion: 1,
      extractionId: 'ext-1',
      documentType: 'OTHER',
      planOutcome: 'ARCHIVE_ONLY',
      actions: [{ semanticAction: 'ARCHIVE_DOCUMENT', requirement: 'REQUIRED', sequence: 1 }],
      confirmedData: { summary: 'Behördliches Schreiben' },
    };

    expect(computeActionPlanFingerprint(input)).toBe(computeActionPlanFingerprint(input));
  });

  it('changes fingerprint when confirmed data changes', () => {
    const base = {
      planVersion: 1,
      extractionId: 'ext-1',
      documentType: 'OTHER',
      planOutcome: 'ARCHIVE_ONLY',
      actions: [{ semanticAction: 'ARCHIVE_DOCUMENT', requirement: 'REQUIRED', sequence: 1 }],
      confirmedData: { summary: 'Behördliches Schreiben' },
    };

    const changed = {
      ...base,
      confirmedData: { summary: 'Anderes Schreiben' },
    };

    expect(computeActionPlanFingerprint(base)).not.toBe(computeActionPlanFingerprint(changed));
  });

  it('changes fingerprint when planContext changes', () => {
    const base = {
      planVersion: 1,
      extractionId: 'ext-1',
      documentType: 'DAMAGE',
      planOutcome: 'CREATE_DAMAGE',
      actions: [{ semanticAction: 'CREATE_DAMAGE_DRAFT', requirement: 'REQUIRED', sequence: 1 }],
      confirmedData: { summary: 'Kratzer' },
      planContext: { duplicateDamageId: null },
    };

    const changed = {
      ...base,
      planContext: { duplicateDamageId: 'damage-2' },
    };

    expect(computeActionPlanFingerprint(base)).not.toBe(computeActionPlanFingerprint(changed));
  });

  it('builds deterministic idempotency keys', () => {
    const key = buildActionIdempotencyKey({
      extractionId: 'ext-1',
      planVersion: 1,
      fingerprint: 'abc123',
      sequence: 2,
      semanticAction: 'SUGGEST_ENTITY_LINK',
    });

    expect(key).toBe('ext-1:v1:abc123:a2:SUGGEST_ENTITY_LINK');
  });
});
