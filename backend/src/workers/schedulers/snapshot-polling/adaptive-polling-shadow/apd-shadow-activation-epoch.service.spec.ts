import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_LTE_R1_COHORT_V1 } from './adaptive-polling-shadow-cohort.config';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';
import {
  disableApdShadowEpochOpsAuthorityForTests,
  enableApdShadowEpochOpsAuthorityForTests,
} from './apd-shadow-activation-operator.authority';

describe('ApdShadowActivationEpochService (unit)', () => {
  const fingerprint = 'abc123fingerprint';
  const scopeKey = buildApdShadowActivationScopeKey(fingerprint);

  function buildService(prisma: Record<string, unknown>) {
    return new ApdShadowActivationEpochService(prisma as never);
  }

  it('PREPARED epoch does not satisfy shadow gate', () => {
    const service = buildService({});
    const gate = service.evaluateShadowEpochGate({
      cohortConfigFingerprintSha256: fingerprint,
      decisionAtMs: Date.now(),
      activeEpoch: null,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('EPOCH_MISSING');
  });

  it('ACTIVE epoch allows decision at or after T0', () => {
    const service = buildService({});
    const t0 = new Date('1970-01-01T00:00:00.000Z');
    const gate = service.evaluateShadowEpochGate({
      cohortConfigFingerprintSha256: fingerprint,
      decisionAtMs: t0.getTime() + 1000,
      activeEpoch: {
        id: 'epoch-1',
        activationScopeKey: scopeKey,
        organizationId: 'org-1',
        cohortConfigFingerprintSha256: fingerprint,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: t0,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        productionReleaseIdentity: null,
      },
    });
    expect(gate.allowed).toBe(true);
  });

  it('decision before T0 fails closed', () => {
    const service = buildService({});
    const t0 = new Date('1970-01-01T00:00:00.000Z');
    const gate = service.evaluateShadowEpochGate({
      cohortConfigFingerprintSha256: fingerprint,
      decisionAtMs: t0.getTime() - 1,
      activeEpoch: {
        id: 'epoch-1',
        activationScopeKey: scopeKey,
        organizationId: 'org-1',
        cohortConfigFingerprintSha256: fingerprint,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: t0,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        productionReleaseIdentity: null,
      },
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('DECISION_BEFORE_T0');
  });

  it('prepareEpoch requires internal ops authority', async () => {
    disableApdShadowEpochOpsAuthorityForTests();
    const service = buildService({
      apdShadowActivationEpoch: { create: jest.fn() },
    });
    await expect(
      service.prepareEpoch({
        organizationId: 'org-1',
        cohortOrganizationIds: ['org-1'],
        cohortConfigFingerprintSha256: fingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
      }),
    ).rejects.toThrow(/opsToken|operatorActor/);
    enableApdShadowEpochOpsAuthorityForTests();
  });

  it('fingerprint mismatch fails closed', () => {
    const service = buildService({});
    const t0 = new Date('1970-01-01T00:00:00.000Z');
    const gate = service.evaluateShadowEpochGate({
      cohortConfigFingerprintSha256: 'other-fingerprint',
      decisionAtMs: t0.getTime() + 1,
      activeEpoch: {
        id: 'epoch-1',
        activationScopeKey: scopeKey,
        organizationId: 'org-1',
        cohortConfigFingerprintSha256: fingerprint,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: t0,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        productionReleaseIdentity: null,
      },
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('EPOCH_FINGERPRINT_MISMATCH');
  });
});
