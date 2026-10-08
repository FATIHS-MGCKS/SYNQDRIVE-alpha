import { ApdShadowActivationEpochOperatorFacade } from './apd-shadow-activation-epoch-operator.facade';
import {
  assertOutputContainsNoCredentialLeak,
  buildSanitizedActivateDryRun,
  buildSanitizedPrepareDryRun,
} from './apd-shadow-operator-output.sanitize';
import {
  disableApdShadowEpochOpsAuthorityForTests,
  enableApdShadowEpochOpsAuthorityForTests,
} from './apd-shadow-activation-operator.authority';

describe('ApdShadowActivationEpochOperatorFacade security (APDS-9.3C)', () => {
  const secretToken = 'super-secret-ops-token-9.3c';

  beforeEach(() => {
    enableApdShadowEpochOpsAuthorityForTests({
      operatorActor: 'integration-test',
      operationRequestId: 'req-12345678',
      operationReason: 'facade-security-test',
      opsToken: secretToken,
    });
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env.WORKER_APD_SHADOW_COHORT_JSON = JSON.stringify({
      version: 'P25_APD_LTE_R1_COHORT_V1',
      members: [{ organizationId: 'org-1', vehicleId: 'veh-1' }],
    });
  });

  afterEach(() => {
    disableApdShadowEpochOpsAuthorityForTests();
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env.WORKER_APD_SHADOW_COHORT_JSON;
  });

  it('dry-run prepare output never contains opsToken', () => {
    const dryRun = buildSanitizedPrepareDryRun({
      organizationId: 'org-1',
      cohortOrganizationIds: ['org-1'],
      cohortConfigFingerprintSha256: 'fp',
      cohortConfigVersion: 'P25_APD_LTE_R1_COHORT_V1',
      b2PolicyVersion: 'P25_APD_B2_V1',
      b4PolicyVersion: 'P25_APD_B4_V1',
      operatorActor: 'integration-test',
      operatorReason: 'dry-run-prepare',
      operationRequestId: 'req-12345678',
      approvedReleaseSha: 'abcd1234',
    });
    const serialized = JSON.stringify({ dryRun: true, wouldPrepare: dryRun });
    assertOutputContainsNoCredentialLeak(serialized, secretToken);
    expect(serialized).not.toContain(secretToken);
  });

  it('dry-run activate output never contains opsToken', () => {
    const dryRun = buildSanitizedActivateDryRun({
      epochId: 'epoch-1',
      activationRequestKey: 'act-key-1',
      cohortOrganizationIds: ['org-1'],
      cohortConfigFingerprintSha256: 'fp',
      b2PolicyVersion: 'P25_APD_B2_V1',
      b4PolicyVersion: 'P25_APD_B4_V1',
      operatorActor: 'integration-test',
      operatorReason: 'dry-run-activate',
      operationRequestId: 'req-12345678',
      approvedReleaseSha: 'abcd1234',
    });
    const serialized = JSON.stringify({ dryRun: true, wouldActivate: dryRun });
    assertOutputContainsNoCredentialLeak(serialized, secretToken);
    expect(serialized).not.toContain(secretToken);
  });

  it('facade prepare dry-run returns sanitized payload only', async () => {
    const facade = new ApdShadowActivationEpochOperatorFacade({} as never);
    const result = await facade.run({
      command: 'prepare',
      dryRun: true,
      organizationId: 'org-1',
      ops: {
        operatorActor: 'integration-test',
        operationRequestId: 'req-12345678',
        operationReason: 'dry-run-prepare',
        opsToken: secretToken,
      },
    });
    const serialized = JSON.stringify(result);
    assertOutputContainsNoCredentialLeak(serialized, secretToken);
    expect(result.dryRun).toBe(true);
    expect((result.wouldPrepare as Record<string, unknown>).opsToken).toBeUndefined();
  });
});
