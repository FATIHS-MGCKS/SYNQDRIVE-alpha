import {
  mergeOffboardingProgressPreservingDimoOperatorFields,
  pickLongerDimoOwnerHandoffList,
  pickNewerDimoPrivilegeVerification,
} from './organization-offboarding-dimo-progress-preservation';

describe('organization-offboarding-dimo-progress-preservation', () => {
  it('keeps longer handoff list when execution snapshot is stale', () => {
    const storedHandoff = {
      handoffId: 'h1',
      requestedAt: '2026-01-02T00:00:00.000Z',
      requestedByUserId: 'a1',
      organizationId: 'org',
      jobId: 'job',
      idempotencyKey: 'k1',
      affectedVehicleIds: ['v1'],
      verificationSnapshotReference: null,
      status: 'RECORDED' as const,
    };
    const merged = mergeOffboardingProgressPreservingDimoOperatorFields(
      {
        phasesCompleted: ['SUSPEND'],
        dimoOwnerHandoffs: [storedHandoff],
        providerQuiesce: { finalizationState: 'EXTERNAL_DISCONNECT_PENDING' } as never,
      },
      {
        phasesCompleted: ['SUSPEND', 'PROVIDER_QUIESCE'],
        dimoOwnerHandoffs: [],
        providerQuiesce: {
          finalizationState: 'EXTERNAL_DISCONNECT_PENDING',
          providerEvidence: { assessedAt: '2026-01-02T01:00:00.000Z' },
        } as never,
      },
    );
    expect(merged.dimoOwnerHandoffs).toHaveLength(1);
    expect(merged.dimoOwnerHandoffs?.[0]?.handoffId).toBe('h1');
    expect(merged.phasesCompleted).toContain('PROVIDER_QUIESCE');
  });

  it('keeps newer DIMO verification when finalize snapshot is older', () => {
    const newer = {
      lastVerifiedAt: '2026-01-03T00:00:00.000Z',
      providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
      detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
      verificationSnapshotReference: 'snap-new',
      privilegedStillActiveTokenIds: [1],
      providerEvidenceSummary: {},
    };
    const older = {
      ...newer,
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      verificationSnapshotReference: 'snap-old',
    };
    expect(pickNewerDimoPrivilegeVerification(older, newer)?.verificationSnapshotReference).toBe('snap-new');
    expect(pickNewerDimoPrivilegeVerification(newer, older)?.verificationSnapshotReference).toBe('snap-new');
  });

  it('pickLongerDimoOwnerHandoffList prefers stored when candidate is empty', () => {
    const stored = [
      {
        handoffId: 'h',
        requestedAt: '2026-01-01T00:00:00.000Z',
        requestedByUserId: 'u',
        organizationId: 'o',
        jobId: 'j',
        idempotencyKey: 'k',
        affectedVehicleIds: [],
        verificationSnapshotReference: null,
        status: 'RECORDED' as const,
      },
    ];
    expect(pickLongerDimoOwnerHandoffList(stored, [])).toEqual(stored);
  });
});