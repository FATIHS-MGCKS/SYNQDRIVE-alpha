import {
  issueVoSigB1OwnerExecuteAuthorization,
  verifyVoSigB1OwnerExecuteAuthorization,
} from '../legacy-reconcile-owner-authorization';

const SECRET = 'unit-test-admission-secret';

describe('legacy reconcile owner execute authorization', () => {
  beforeAll(() => {
    process.env.VO_SIG_B1_OPERATOR_ADMISSION_SECRET = SECRET;
    process.env.SYNQDRIVE_RELEASE_GIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  });

  it('issues and verifies a signed authorization', () => {
    const token = issueVoSigB1OwnerExecuteAuthorization(
      {
        approvedReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        organizationId: 'org-1',
        sourceLinkIds: ['link-b', 'link-a'],
        manifestFingerprint: 'manifest-1',
        authorizationReference: 'auth-ref-1',
        runId: 'run-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      SECRET,
    );
    verifyVoSigB1OwnerExecuteAuthorization({
      token,
      organizationId: 'org-1',
      linkIds: ['link-a', 'link-b'],
      manifestFingerprint: 'manifest-1',
      authorizationReference: 'auth-ref-1',
      runId: 'run-1',
      productionReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('rejects tampered manifest fingerprint', () => {
    const token = issueVoSigB1OwnerExecuteAuthorization(
      {
        approvedReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        organizationId: 'org-1',
        sourceLinkIds: ['link-a'],
        manifestFingerprint: 'manifest-1',
        authorizationReference: 'auth-ref-1',
        runId: 'run-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      SECRET,
    );
    expect(() =>
      verifyVoSigB1OwnerExecuteAuthorization({
        token,
        organizationId: 'org-1',
        linkIds: ['link-a'],
        manifestFingerprint: 'manifest-2',
        authorizationReference: 'auth-ref-1',
        runId: 'run-1',
        productionReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toThrow('LEGACY_RECONCILE_OWNER_AUTHORIZATION_MANIFEST_MISMATCH');
  });
});
