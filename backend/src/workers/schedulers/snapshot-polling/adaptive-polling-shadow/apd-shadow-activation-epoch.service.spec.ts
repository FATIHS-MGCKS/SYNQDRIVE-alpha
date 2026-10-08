import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';

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
        b2PolicyVersion: 'B2',
        b4PolicyVersion: 'B4',
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
        b2PolicyVersion: 'B2',
        b4PolicyVersion: 'B4',
        productionReleaseIdentity: null,
      },
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('DECISION_BEFORE_T0');
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
        b2PolicyVersion: 'B2',
        b4PolicyVersion: 'B4',
        productionReleaseIdentity: null,
      },
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe('EPOCH_FINGERPRINT_MISMATCH');
  });
});
