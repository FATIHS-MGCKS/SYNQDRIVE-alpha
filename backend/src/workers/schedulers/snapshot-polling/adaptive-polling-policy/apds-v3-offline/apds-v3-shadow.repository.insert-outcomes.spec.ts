import { Prisma } from '@prisma/client';
import { buildApdsV3ShadowDecisionFingerprint } from './apds-v3-shadow-decision-fingerprint.v1';
import {
  ApdsV3ShadowImmutableConflictError,
  ApdsV3ShadowRepository,
} from './apds-v3-shadow.repository';

describe('ApdsV3ShadowRepository insert outcomes', () => {
  const policyVersion = ApdsV3ShadowRepository.defaultPolicyVersion();
  const baseRow = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    physicalRequestId: 'physical-fetch:exec:exec-1:run:0',
    physicalRequestIdentityClass: 'CORRELATED' as const,
    correlationAttemptId: 'exec-1',
    decisionAt: new Date('2026-11-12T00:00:00.000Z'),
    activationVersion: 'APDS_V3_SHADOW_ACTIVATION_V1',
    policyVersion,
    baselineCanonicalDue: false,
    baselineAuthority: 'BASELINE_PARTIAL_PARITY',
    baselineAssessable: false,
    v3Decision: 'WOULD_POLL',
    v3Reason: 'TEST',
    expectedInformationGain: null,
    informationGainHeuristic: false,
    consumerDemandFailClosed: false,
    observationQuality: null,
    observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
    missingEvidenceReasons: [] as string[],
  };

  function buildRepo(existingFingerprint: string | null) {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const findUnique = jest.fn().mockResolvedValue(
      existingFingerprint ? { decisionFingerprint: existingFingerprint } : null,
    );
    const prisma = {
      apdsV3ShadowDecision: { create, findUnique },
    };
    const repo = new ApdsV3ShadowRepository(prisma as never);
    return { repo, create, findUnique };
  }

  it('B — idempotent replay when fingerprint matches', async () => {
    const { repo } = buildRepo(buildApdsV3ShadowDecisionFingerprint(baseRow));
    const outcome = await repo.insertPollStartDecision(baseRow);
    expect(outcome).toBe('idempotent_replay');
  });

  it('C — immutable conflict when fingerprint differs for same execution id', async () => {
    const { repo } = buildRepo('stale-fingerprint');
    await expect(
      repo.insertPollStartDecision({
        ...baseRow,
        v3Decision: 'WOULD_SKIP',
        v3Reason: 'CONFLICTING',
      }),
    ).rejects.toBeInstanceOf(ApdsV3ShadowImmutableConflictError);
  });
});
