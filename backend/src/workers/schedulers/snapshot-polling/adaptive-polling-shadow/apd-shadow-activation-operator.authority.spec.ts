import {
  assertApdShadowEpochOpsAuthorized,
  assertMutationReleaseIdentity,
  buildOperatorExecutionProof,
  disableApdShadowEpochOpsAuthorityForTests,
  enableApdShadowEpochOpsAuthorityForTests,
  isOperatorIdentityInfrastructureConfigured,
} from './apd-shadow-activation-operator.authority';

describe('ApdShadow activation operator authority (APDS-9.3B)', () => {
  const token = 'super-secret-test-token';

  afterEach(() => {
    disableApdShadowEpochOpsAuthorityForTests();
    delete process.env.APD_SHADOW_EPOCH_OPS_TOKEN;
    delete process.env.SYNQDRIVE_DEPLOYED_GIT_SHA;
    delete process.env.APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA;
    delete process.env.APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST;
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
    disableApdShadowEpochOpsAuthorityForTests();
    process.env.APD_SHADOW_EPOCH_OPS_TOKEN = token;
    process.env.APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST = 'ops-user';
    expect(() =>
      assertApdShadowEpochOpsAuthorized('activate', {
        operatorActor: 'ops-user',
        operationRequestId: 'req-12345678',
        operationReason: 'test-reason',
        opsToken: 'wrong-token',
      }),
    ).toThrow(/opsToken rejected/);
  });

  it('MISSING_RELEASE_SHA_REJECTED for mutations', () => {
    disableApdShadowEpochOpsAuthorityForTests();
    process.env.SYNQDRIVE_DEPLOYED_GIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(() => assertMutationReleaseIdentity('prepareEpoch')).toThrow(/APPROVED/);
  });

  it('DEPLOYED_SHA_MISMATCH_REJECTED', () => {
    disableApdShadowEpochOpsAuthorityForTests();
    process.env.APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    process.env.SYNQDRIVE_DEPLOYED_GIT_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expect(() => assertMutationReleaseIdentity('activateEpoch')).toThrow(/mismatch/);
  });

  it('operator allowlist required when not in test bypass', () => {
    disableApdShadowEpochOpsAuthorityForTests();
    process.env.APD_SHADOW_EPOCH_OPS_TOKEN = token;
    expect(isOperatorIdentityInfrastructureConfigured()).toBe(false);
    expect(() =>
      assertApdShadowEpochOpsAuthorized('pauseEpoch', {
        operatorActor: 'ops-user',
        operationRequestId: 'req-12345678',
        operationReason: 'pause-reason',
        opsToken: token,
      }),
    ).toThrow(/allowlist|not verifiable/);
    process.env.APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST = 'allowed-only';
    expect(isOperatorIdentityInfrastructureConfigured()).toBe(true);
    expect(() =>
      assertApdShadowEpochOpsAuthorized('pauseEpoch', {
        operatorActor: 'ops-user',
        operationRequestId: 'req-12345678',
        operationReason: 'pause-reason',
        opsToken: token,
      }),
    ).toThrow(/not in approved allowlist/);
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
