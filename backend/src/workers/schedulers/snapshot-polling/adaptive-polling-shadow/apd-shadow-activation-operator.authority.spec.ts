import {
  assertApdShadowEpochOpsAuthorized,
  assertDeployedReleaseIdentity,
  buildOperatorExecutionProof,
  disableApdShadowEpochOpsAuthorityForTests,
  enableApdShadowEpochOpsAuthorityForTests,
} from './apd-shadow-activation-operator.authority';

describe('ApdShadow activation operator authority (APDS-9.3B)', () => {
  const token = 'super-secret-test-token';

  afterEach(() => {
    disableApdShadowEpochOpsAuthorityForTests();
    delete process.env.APD_SHADOW_EPOCH_OPS_TOKEN;
    delete process.env.SYNQDRIVE_DEPLOYED_GIT_SHA;
  });

  it('rejects unknown actor', () => {
    process.env.APD_SHADOW_EPOCH_OPS_TOKEN = token;
    expect(() =>
      assertApdShadowEpochOpsAuthorized('activate', {
        operatorActor: 'ab',
        operationRequestId: 'req-12345678',
        operationReason: 'test-reason',
        opsToken: token,
      }),
    ).toThrow(/operatorActor/);
  });

  it('rejects mismatched ops token', () => {
    process.env.APD_SHADOW_EPOCH_OPS_TOKEN = token;
    expect(() =>
      assertApdShadowEpochOpsAuthorized('activate', {
        operatorActor: 'ops-user',
        operationRequestId: 'req-12345678',
        operationReason: 'test-reason',
        opsToken: 'wrong-token',
      }),
    ).toThrow(/opsToken rejected/);
  });

  it('RELEASE_IDENTITY_VERIFICATION rejects SHA mismatch', () => {
    process.env.SYNQDRIVE_DEPLOYED_GIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(() => assertDeployedReleaseIdentity('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toThrow(
      /mismatch/,
    );
  });

  it('dry-run path: test bypass allows authorized actor without env token', () => {
    enableApdShadowEpochOpsAuthorityForTests();
    expect(() =>
      assertApdShadowEpochOpsAuthorized('preflight', {
        operatorActor: 'integration-test',
        operationRequestId: 'req-12345678',
        operationReason: 'dry-run-check',
        opsToken: '',
      }),
    ).not.toThrow();
  });

  it('execution proof is deterministic', () => {
    const proof = buildOperatorExecutionProof('actor', 'request-id', token);
    expect(proof).toHaveLength(64);
    expect(proof).toBe(buildOperatorExecutionProof('actor', 'request-id', token));
  });
});
