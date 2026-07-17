import {
  nextDocumentActionPlanVersion,
  pickCurrentDocumentActionPlan,
  resolveInvalidationReasonForFingerprintChange,
  shouldInvalidateCurrentPlanForFingerprintChange,
} from './document-action-plan.versioning';
import { DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS } from './document-action-plan.types';

describe('document-action-plan.versioning', () => {
  it('increments plan version monotonically per extraction history', () => {
    expect(nextDocumentActionPlanVersion([])).toBe(1);
    expect(nextDocumentActionPlanVersion([{ planVersion: 1 }])).toBe(2);
    expect(nextDocumentActionPlanVersion([{ planVersion: 1 }, { planVersion: 3 }])).toBe(4);
  });

  it('picks the highest-version current plan', () => {
    const current = pickCurrentDocumentActionPlan([
      { id: 'a', planVersion: 1, invalidatedAt: new Date(), inputFingerprint: 'fp-1', status: 'SUPERSEDED' },
      { id: 'b', planVersion: 2, invalidatedAt: null, inputFingerprint: 'fp-2', status: 'DRAFT' },
      { id: 'c', planVersion: 3, invalidatedAt: null, inputFingerprint: 'fp-3', status: 'DRAFT' },
    ]);

    expect(current?.id).toBe('c');
  });

  it('requires invalidation when current fingerprint differs', () => {
    expect(
      shouldInvalidateCurrentPlanForFingerprintChange(
        { inputFingerprint: 'fp-old', invalidatedAt: null },
        'fp-new',
      ),
    ).toBe(true);
    expect(
      shouldInvalidateCurrentPlanForFingerprintChange(
        { inputFingerprint: 'fp-old', invalidatedAt: new Date() },
        'fp-new',
      ),
    ).toBe(false);
    expect(
      shouldInvalidateCurrentPlanForFingerprintChange(
        { inputFingerprint: 'fp-old', invalidatedAt: null },
        'fp-old',
      ),
    ).toBe(false);
  });

  it('maps fingerprint changes to INPUT_FINGERPRINT_CHANGED', () => {
    expect(resolveInvalidationReasonForFingerprintChange('a', 'b')).toBe(
      DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS.INPUT_FINGERPRINT_CHANGED,
    );
  });
});
