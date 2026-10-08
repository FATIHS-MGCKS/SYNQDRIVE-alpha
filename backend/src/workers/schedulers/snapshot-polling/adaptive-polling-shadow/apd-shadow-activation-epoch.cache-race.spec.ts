import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';

describe('ApdShadowActivationEpochService multi-replica cache race', () => {
  const fingerprint = 'fp-race-test';
  const scopeKey = buildApdShadowActivationScopeKey(fingerprint);
  const epochView = {
    id: 'epoch-race',
    activationScopeKey: scopeKey,
    organizationId: 'org-1',
    cohortConfigFingerprintSha256: fingerprint,
    lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
    activatedAt: new Date('1970-01-01T00:00:00.000Z'),
    b2PolicyVersion: 'P25_APD_B2_V1',
    b4PolicyVersion: 'P25_APD_B4_V1',
    productionReleaseIdentity: null,
  };

  it('replica A stale positive cache cannot authorize writes after replica B pause (authoritative path)', async () => {
    let dbLifecycle: ApdShadowActivationEpochLifecycle =
      ApdShadowActivationEpochLifecycle.ACTIVE;
    const prisma = {
      apdShadowActivationEpoch: {
        findFirst: jest.fn(async () =>
          dbLifecycle === ApdShadowActivationEpochLifecycle.ACTIVE
            ? {
                id: epochView.id,
                activationScopeKey: scopeKey,
                organizationId: 'org-1',
                cohortConfigFingerprintSha256: fingerprint,
                lifecycleState: dbLifecycle,
                activatedAt: epochView.activatedAt,
                b2PolicyVersion: 'P25_APD_B2_V1',
                b4PolicyVersion: 'P25_APD_B4_V1',
                productionReleaseIdentity: null,
              }
            : null,
        ),
      },
    };

    const replicaA = new ApdShadowActivationEpochService(prisma as never);
    const replicaB = new ApdShadowActivationEpochService(prisma as never);

    (
      replicaA as unknown as {
        positiveCacheByScope: Map<string, unknown>;
      }
    ).positiveCacheByScope.set(scopeKey, {
      epoch: epochView,
      loadedAtMs: Date.now(),
    });

    const cachedHint = replicaA.getCachedActiveEpochSnapshot(fingerprint);
    expect(cachedHint).not.toBeNull();

    dbLifecycle = ApdShadowActivationEpochLifecycle.PAUSED;
    replicaB.invalidateCache();

    const authoritative = await replicaA.loadActiveEpochForScopeAuthoritative(fingerprint);
    expect(authoritative).toBeNull();

    const gate = replicaA.evaluateShadowEpochGate({
      cohortConfigFingerprintSha256: fingerprint,
      decisionAtMs: Date.now(),
      activeEpoch: authoritative,
      vehicleOrganizationId: 'org-1',
    });
    expect(gate.allowed).toBe(false);
  });
});
