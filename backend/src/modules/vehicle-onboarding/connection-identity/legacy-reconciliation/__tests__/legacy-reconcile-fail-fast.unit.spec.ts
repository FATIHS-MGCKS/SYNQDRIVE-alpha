import { LegacyReconcileFailFastError, assertLegacyReconcileBatchOutcome } from '../legacy-reconcile-fail-fast';

describe('legacy reconcile fail-fast', () => {
  it('throws when any SKIPPED result is present', () => {
    expect(() =>
      assertLegacyReconcileBatchOutcome([
        { outcome: 'APPLIED', sourceLinkId: 'a', auditId: '1', afterFingerprint: 'fp' },
        {
          outcome: 'SKIPPED',
          sourceLinkId: 'b',
          eligibility: 'CONCURRENT_CHANGE_RISK',
          reasonCodes: ['ALREADY_RECONCILED'],
        },
      ]),
    ).toThrow(LegacyReconcileFailFastError);
  });
});
