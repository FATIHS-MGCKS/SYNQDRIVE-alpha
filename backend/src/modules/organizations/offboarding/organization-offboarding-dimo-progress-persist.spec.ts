import { pickNewerDimoPrivilegeVerification } from './organization-offboarding-dimo-progress-preservation';

describe('persistDimoPrivilegeVerificationUnderLock policy', () => {
  const newer = {
    lastVerifiedAt: '2026-05-01T00:00:00.000Z',
    providerCheckStatus: 'CONFIRMED_ABSENT',
    detailCode: null,
    verificationSnapshotReference: 'new',
    privilegedStillActiveTokenIds: [],
    providerEvidenceSummary: {},
  };
  const older = {
    ...newer,
    lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    verificationSnapshotReference: 'old',
  };

  it('pickNewer keeps B when A is stale', () => {
    const chosen = pickNewerDimoPrivilegeVerification(older, newer);
    expect(chosen?.verificationSnapshotReference).toBe('new');
  });

  it('pickNewer rejects stale A after B stored', () => {
    const chosen = pickNewerDimoPrivilegeVerification(newer, older);
    expect(chosen?.verificationSnapshotReference).toBe('new');
  });
});